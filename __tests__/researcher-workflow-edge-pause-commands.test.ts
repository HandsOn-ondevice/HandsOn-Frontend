import { expect, jest, test } from '@jest/globals';
import { EdgeWorkflowRepository } from '@/features/researcher-workflow/infrastructure/edge/EdgeWorkflowRepository';
import type { EdgeSessionRequest } from '@/features/researcher-workflow/infrastructure/edge/edge-session-request';

const sessionId = 'session-1';
const path = `/sessions/${sessionId}`;
const cursor = { cursorId: 'cursor-2', stepId: 'step-2', conditionId: 'near', trialIndex: 2 };
const running = {
  sessionId,
  source: 'api',
  dataOrigin: 'simulation',
  operatorId: 'operator-01',
  phase: 'running',
  revision: 10,
  createdAt: '2026-11-23T00:00:00Z',
  updatedAt: '2026-11-23T00:01:00Z',
  procedure: {
    procedureId: 'kit-distance',
    version: '1.1.0',
    title: '거리 확인',
    approval: 'approved',
    deviceId: 'kit-circuit-01',
    preparation: [],
    deviceCheck: { deviceId: 'orange-pi-01', title: '장치 점검', sensors: [] },
    execution: {
      provenance: 'approved',
      profileVersion: '1.0.0',
      settlingSeconds: 1,
      conditions: [{ id: 'near', label: '근거리', repetitions: 3 }],
    },
  },
  pendingJob: null,
  checks: [],
  evidence: [],
  events: [],
  deviceChecks: [],
  execution: { cursor, attempts: [{ attemptId: 'sample-1', status: 'valid' }] },
};
const paused = {
  ...running,
  phase: 'held',
  revision: 11,
  holdReason: { code: 'USER_PAUSED', message: '작업자가 일시정지했습니다.' },
};
const resumed = { ...running, revision: 12 };
const pause = { type: 'pauseExecution', cursorId: cursor.cursorId } as const;
const resume = { type: 'resumePausedExecution', cursorId: cursor.cursorId } as const;

function reply(body: unknown, replayed = false) {
  return { body, replayed };
}

function write(requestId: string, expectedRevision: number, type: 'pause' | 'resume') {
  return { requestId, body: JSON.stringify({ requestId, expectedRevision, command: { type } }) };
}

test('같은 세션과 회차를 유지하며 일시정지·재개 명령을 Edge 형식으로 보낸다', async () => {
  const request = jest
    .fn<EdgeSessionRequest>()
    .mockResolvedValueOnce(reply(running))
    .mockResolvedValueOnce(reply(paused))
    .mockResolvedValueOnce(reply(resumed));
  const repository = new EdgeWorkflowRepository(request);
  repository.subscribe(sessionId, jest.fn());
  await repository.getSession(sessionId);

  await expect(
    repository.executeCommand(sessionId, pause, { requestId: 'pause-1', expectedRevision: 10 }),
  ).resolves.toEqual(paused);
  await expect(
    repository.executeCommand(sessionId, resume, { requestId: 'resume-1', expectedRevision: 11 }),
  ).resolves.toEqual(resumed);

  expect(request.mock.calls).toEqual([
    [path],
    [`${path}/commands`, write('pause-1', 10, 'pause')],
    [`${path}/commands`, write('resume-1', 11, 'resume')],
  ]);
});

test.each([
  {
    session: { ...paused, holdReason: { code: 'SENSOR_ERROR', message: '센서 오류' } },
    command: resume,
  },
  { session: paused, command: { ...resume, cursorId: 'other-cursor' } },
  { session: running, command: { ...pause, cursorId: 'other-cursor' } },
])('회차가 달라졌거나 센서 오류로 보류되면 명령을 보내지 않는다', async ({ session, command }) => {
  const request = jest.fn<EdgeSessionRequest>().mockResolvedValueOnce(reply(session));
  const repository = new EdgeWorkflowRepository(request);

  await expect(
    repository.executeCommand(sessionId, command, {
      requestId: 'invalid-1',
      expectedRevision: session.revision,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  expect(request.mock.calls).toEqual([[path]]);
});

test('응답 유실 뒤 더 최신 개정이 조회되어도 같은 재개 요청을 서버에서 재생한다', async () => {
  const request = jest
    .fn<EdgeSessionRequest>()
    .mockResolvedValueOnce(reply(paused))
    .mockRejectedValueOnce(new Error('response lost'))
    .mockRejectedValueOnce(new Error('response lost again'))
    .mockResolvedValueOnce(reply(resumed))
    .mockResolvedValueOnce(reply(resumed, true))
    .mockResolvedValueOnce(reply(resumed));
  const repository = new EdgeWorkflowRepository(request);
  repository.subscribe(sessionId, jest.fn());
  await repository.getSession(sessionId);

  const context = { requestId: 'resume-1', expectedRevision: 11 };
  await expect(repository.executeCommand(sessionId, resume, context)).rejects.toMatchObject({
    code: 'OUTCOME_UNKNOWN',
  });
  await repository.getSession(sessionId);
  await expect(repository.executeCommand(sessionId, resume, context)).resolves.toEqual(resumed);

  const sent = write('resume-1', 11, 'resume');
  expect(request.mock.calls).toEqual([
    [path],
    [`${path}/commands`, sent],
    [`${path}/commands`, sent],
    [path],
    [`${path}/commands`, sent],
    [path],
  ]);
});
