import type { ExperimentSession, ProcedureSnapshot } from '../../domain/models';
import {
  beginDeviceCheck,
  finishDeviceCheck,
  startMockExecution,
} from './device-check-transitions';
import { buildMockDiagnostics } from './device-check-scenarios';
import { transitionPreparation, type TransitionMetadata } from './transition-engine';

/** 고정 데모의 준비·점검 이력을 실제 Mock 전이로 만들고 저장소의 시계·ID를 소비하지 않는다. */
export function createLedExecutionFixture(
  sessionId: string,
  createdAt: string,
  procedure: ProcedureSnapshot,
) {
  let sequence = 0;
  const metadata = (): TransitionMetadata => {
    const index = sequence++;
    const prefix = `${sessionId}:${index}`;
    return {
      requestId: `${prefix}:request`,
      eventId: `${prefix}:event`,
      evidenceId: `${prefix}:evidence`,
      now: new Date(Date.parse(createdAt) + index * 1000).toISOString(),
    };
  };
  const initial = metadata();
  let session: ExperimentSession = {
    sessionId,
    operatorId: 'mock-researcher',
    source: 'mock',
    procedure,
    phase: 'preparing',
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    checks: procedure.preparation.map((item) => ({
      id: item.id,
      checked: false,
      confirmedAt: null,
      evidenceId: null,
    })),
    evidence: [],
    deviceChecks: [],
    events: [
      {
        eventId: initial.eventId,
        requestId: initial.requestId,
        type: 'sessionCreated',
        occurredAt: initial.now,
      },
    ],
  };
  for (const item of procedure.preparation.filter((item) => item.owner === 'operator')) {
    session = transitionPreparation(
      session,
      { type: 'setPreparationCheck', checkId: item.id, checked: true },
      metadata(),
    );
  }
  session = transitionPreparation(session, { type: 'completePreparation' }, metadata());
  const check = metadata();
  const checkId = `${check.eventId}:check`;
  session = beginDeviceCheck(session, checkId, check);
  const checked = metadata();
  session = finishDeviceCheck(
    session,
    checkId,
    buildMockDiagnostics({
      definition: procedure.deviceCheck!,
      scenario: 'normal',
      attemptId: checkId,
      now: () => checked.now,
    }),
    checked,
  );

  return { session: startMockExecution(session, metadata()), metadata };
}
