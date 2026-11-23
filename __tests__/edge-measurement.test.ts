import { expect, jest, test } from '@jest/globals';
import { EdgeWorkflowRepository } from '@/features/researcher-workflow/infrastructure/edge/EdgeWorkflowRepository';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { withEdgeMeasurement } from '@/features/researcher-workflow/infrastructure/edge/edge-measurement';
import type { EdgeSessionRequest } from '@/features/researcher-workflow/infrastructure/edge/edge-session-request';
import {
  edgeMeasurementSession,
  firstCursor,
  nextCursor,
  sampleFor,
} from '../test/edge-measurement-fixture';

test('reads again if a delayed pre-command GET returns an older revision and publishes the new Edge attempt', async () => {
  const before = edgeMeasurementSession();
  const ready = {
    ...before,
    revision: 9,
    execution: { ...before.execution, attempts: [sampleFor()] },
  };
  const accepted = {
    ...ready,
    revision: 8,
    pendingJob: { kind: 'sample', attemptId: sampleFor().attemptId },
  };
  const request = jest
    .fn<EdgeSessionRequest>()
    .mockResolvedValueOnce({ body: accepted, replayed: false })
    .mockResolvedValueOnce({ body: before, replayed: false })
    .mockResolvedValueOnce({ body: ready, replayed: false });
  const base = new EdgeWorkflowRepository(request);
  const repository = withEdgeMeasurement(base, request);
  const listener = jest.fn<(session: ExperimentSession) => void>();
  const unsubscribe = repository.subscribe(before.sessionId, listener);
  const context = { requestId: 'measure-one', expectedRevision: 7 };
  const command = { type: 'requestExecutionSample', cursorId: firstCursor.cursorId } as const;

  expect(await repository.executeCommand(before.sessionId, command, context)).toEqual(ready);
  expect(request).toHaveBeenNthCalledWith(1, '/sessions/edge-measurement-test/commands', {
    requestId: context.requestId,
    body: JSON.stringify({ ...context, command }),
  });
  expect(listener.mock.calls.map(([session]) => session.revision)).toEqual([7, 9]);
  expect(listener).toHaveBeenLastCalledWith(ready);
  unsubscribe();
});

test('a replay cannot replace current state with an old command response when GET fails', async () => {
  const before = edgeMeasurementSession();
  const replay = { ...before, revision: 8 };
  const latest = { ...before, revision: 9, execution: { ...before.execution, cursor: nextCursor } };
  const reply = { body: replay, replayed: true };
  const request = jest
    .fn<EdgeSessionRequest>()
    .mockResolvedValueOnce(reply)
    .mockRejectedValueOnce(new Error('GET failed'))
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce({ body: latest, replayed: false });
  const repository = withEdgeMeasurement(new EdgeWorkflowRepository(request), request);
  const context = { requestId: 'complete-one', expectedRevision: 7 };
  const command = {
    type: 'completeExecutionStep',
    cursorId: firstCursor.cursorId,
    sampleAttemptId: sampleFor().attemptId,
  } as const;

  await expect(repository.executeCommand(before.sessionId, command, context)).rejects.toMatchObject(
    {
      code: 'OUTCOME_UNKNOWN',
    },
  );
  await expect(repository.executeCommand(before.sessionId, command, context)).resolves.toEqual(
    latest,
  );
  expect(request.mock.calls[0]).toEqual(request.mock.calls[2]);
});
