import type { ExperimentSession } from '../../domain/models';
import { mockProcedure } from './fixtures';
import { createLedExecutionFixture } from './led-execution-fixture';
import {
  beginExecutionSample,
  completeExecutionStep,
  finishExecutionSample,
} from './execution-transitions';
import { buildMockExecutionReport } from './execution-scenarios';
import { pauseMockExecution } from './resume-transitions';

/** S01과 S11에서 공유하는 LED-M03의 일시정지 시점이다. */
export function createLedM03PausedFixture(): ExperimentSession {
  const procedure = {
    ...mockProcedure,
    procedureId: 'demo-procedure-led-output',
    deviceCheck: { ...mockProcedure.deviceCheck!, deviceId: 'demo-orange-pi-5-plus' },
  };
  const fixture = createLedExecutionFixture(
    'demo-session-led-m03',
    '2026-11-12T00:33:00.000Z',
    procedure,
  );
  const { metadata } = fixture;
  let session = fixture.session;

  // 0%, 25%에서 각각 세 번, 50%에서 두 번 측정을 마친 뒤 다음 회차를 일시정지한다.
  for (let completed = 0; completed < 8; completed++) {
    const cursor = session.execution!.cursor!;
    const requested = metadata();
    const attemptId = `${requested.eventId}:sample`;
    session = beginExecutionSample(session, cursor.cursorId, attemptId, requested);
    const received = metadata();
    session = finishExecutionSample(
      session,
      attemptId,
      buildMockExecutionReport({
        definition: procedure.deviceCheck,
        executionDefinition: procedure.execution!,
        cursor,
        scenario: 'normal',
        sampleAttemptId: attemptId,
        now: () => received.now,
      }),
      received,
    );
    const accepted = metadata();
    session = completeExecutionStep(
      session,
      cursor.cursorId,
      attemptId,
      `${accepted.eventId}:cursor`,
      accepted,
    );
  }

  return pauseMockExecution(session, session.execution!.cursor!.cursorId, {
    ...metadata(),
    now: '2026-11-12T00:34:00.000Z',
  });
}
