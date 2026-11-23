import {
  executionSampleIssue,
  validExecutionDefinition,
  type ExecutionCursor,
  type MeasurementAttempt,
} from './execution';
import type { DiagnosticIssue, SensorReading } from './device-check';
import type { ExperimentSession } from './models';

export type CleanupCheckId = 'powerOff' | 'cables' | 'storage';
export const cleanupRequirements = [
  {
    id: 'powerOff',
    title: 'USB 전원 장치 OFF 확인',
    description: '물리 전원 · 작업자 확인 필요',
    confirmed: '물리 전원 · 작업자 확인 완료',
  },
  {
    id: 'cables',
    title: '센서 케이블 분리와 정리',
    description: '전원 차단 후 진행',
    confirmed: '전원 차단 후 분리 완료',
  },
  {
    id: 'storage',
    title: 'LED 모듈·지그 원위치',
    description: '장비 라벨과 보관 위치 확인',
    confirmed: '장비 라벨과 보관 위치 확인 완료',
  },
] as const;

export interface ReviewMeasurementRequest {
  readonly requestId: string;
  readonly cursor: ExecutionCursor;
  readonly replacesAttemptIds: readonly string[];
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly acceptedAttemptId?: string;
}

/** S13 Mock 응답. 실제 출력 제어·안전 전압 판정 계약과 분리한다. */
export interface CleanupReport {
  readonly attemptId: string;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly source: 'mock';
  readonly command: 'setOutputZero';
  readonly status: 'acknowledged' | 'failed' | 'timeout' | 'stale';
  readonly checkedAt: string;
  readonly readings: readonly SensorReading[];
}
export interface CleanupAttempt {
  readonly attemptId: string;
  readonly status: 'pending' | 'passed' | 'failed';
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly report?: CleanupReport;
  readonly issue?: DiagnosticIssue;
}
export interface MockSubmissionReport {
  readonly attemptId: string;
  readonly sessionId: string;
  readonly resultId: string;
  readonly source: 'mock';
  readonly destination: 'mock-review-queue';
  readonly persistent: false;
  readonly status: 'accepted' | 'failed' | 'timeout';
  readonly receivedAt: string;
  readonly receiptId?: string;
}
export interface SubmissionAttempt {
  readonly attemptId: string;
  readonly status: 'pending' | 'submitted' | 'failed';
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly report?: MockSubmissionReport;
  readonly issue?: DiagnosticIssue;
}
export interface CompletionState {
  readonly reviewRequests: readonly ReviewMeasurementRequest[];
  readonly cleanupAttempts: readonly CleanupAttempt[];
  readonly checks: readonly {
    readonly id: CleanupCheckId;
    readonly confirmedAt: string;
    readonly evidenceId: string;
  }[];
  readonly finishedAt?: string;
  readonly resultId?: string;
  readonly submissions: readonly SubmissionAttempt[];
}

export function measurementReading(attempt: MeasurementAttempt | undefined, metricId: string) {
  return attempt?.report?.diagnostics.sensors
    .flatMap((sensor) => sensor.readings)
    .find((reading) => reading.metricId === metricId);
}

/** 조건·회차별로 근거가 있는 한 건만 센다. 원시 valid 개수나 표시 숫자를 완료 근거로 쓰지 않는다. */
export function acceptedMeasurement(session: ExperimentSession, attempt: MeasurementAttempt) {
  const received = Date.parse(attempt.receivedAt ?? '');
  const confirmed = Date.parse(attempt.confirmedAt ?? '');
  const requested = Date.parse(attempt.requestedAt);
  return (
    attempt.purpose !== 'recoveryCheck' &&
    attempt.status === 'valid' &&
    Number.isFinite(received) &&
    Number.isFinite(confirmed) &&
    Number.isFinite(requested) &&
    requested <= received &&
    received <= confirmed &&
    !executionSampleIssue(session, attempt) &&
    Date.parse(attempt.report!.diagnostics.checkedAt) <= received &&
    session.events.some(
      (event) =>
        event.type === 'measurementAccepted' &&
        event.attemptId === attempt.attemptId &&
        event.cursor?.cursorId === attempt.cursor.cursorId,
    ) &&
    session.evidence.some(
      (item) =>
        item.action === 'measurementConfirmed' &&
        item.kind === 'human' &&
        item.actorId === session.operatorId &&
        item.attemptId === attempt.attemptId &&
        item.cursor?.cursorId === attempt.cursor.cursorId &&
        item.source === session.source,
    ) &&
    session.evidence.some(
      (item) =>
        item.action === 'measurementAccepted' &&
        item.kind === 'program' &&
        item.attemptId === attempt.attemptId &&
        item.cursor?.cursorId === attempt.cursor.cursorId &&
        item.source === session.source,
    ) &&
    session.procedure.deviceCheck?.sensors
      .filter((sensor) => sensor.required)
      .every((sensor) =>
        session.evidence.some(
          (item) =>
            item.action === 'measurementAccepted' &&
            item.kind === 'sensor' &&
            item.sensorId === sensor.sensorId &&
            item.attemptId === attempt.attemptId &&
            item.cursor?.cursorId === attempt.cursor.cursorId &&
            item.source === session.source &&
            JSON.stringify(item.readings) ===
              JSON.stringify(
                attempt.report!.diagnostics.sensors.find(
                  (result) => result.sensorId === sensor.sensorId,
                )?.readings,
              ),
        ),
      ) === true
  );
}

export function selectCompletionReview(session: ExperimentSession) {
  const definition = session.procedure.execution;
  const configured = validExecutionDefinition(definition);
  const attempts = session.execution?.attempts ?? [];
  const slots = (configured ? definition!.conditions : []).flatMap((condition) =>
    Array.from({ length: condition.repetitions }, (_, index) => {
      const trialIndex = index + 1;
      const history = attempts.filter(
        (attempt) =>
          attempt.purpose !== 'recoveryCheck' &&
          attempt.cursor.conditionId === condition.id &&
          attempt.cursor.trialIndex === trialIndex &&
          attempt.cursor.stepId === `measure:${condition.id}`,
      );
      const accepted = history.filter((attempt) => acceptedMeasurement(session, attempt));
      const valid = accepted.length === 1 ? accepted[0] : undefined;
      const status = valid
        ? ('valid' as const)
        : history.some((attempt) =>
              ['valid', 'held', 'error', 'superseded'].includes(attempt.status),
            )
          ? ('invalid' as const)
          : ('missing' as const);
      return {
        conditionId: condition.id,
        label: condition.label,
        trialIndex,
        status,
        valid,
        history,
      };
    }),
  );
  const started =
    !!session.execution && session.events.some((event) => event.type === 'executionStarted');
  const required = slots.length;
  const validCount = slots.filter((slot) => slot.status === 'valid').length;
  const issues = slots.filter((slot) => slot.status !== 'valid');
  const activeRequest = session.completion?.reviewRequests.find((item) => !item.completedAt);
  const busy =
    !!session.execution?.pendingVoice ||
    attempts.some(
      (attempt) =>
        attempt.cursor.cursorId === session.execution?.cursor?.cursorId &&
        attempt.status === 'sampling',
    );
  const allValid = started && configured && required > 0 && validCount === required;
  return {
    configured,
    started,
    slots,
    issues,
    required,
    validCount,
    allValid,
    activeRequest,
    busy,
    available:
      started &&
      configured &&
      ['running', 'cleaningUp', 'completed', 'submitted'].includes(session.phase),
    canRemeasure:
      started &&
      configured &&
      session.phase === 'running' &&
      !busy &&
      issues.length > 0 &&
      !activeRequest,
    canCleanup:
      allValid &&
      session.phase === 'running' &&
      !session.execution?.cursor &&
      !busy &&
      !activeRequest,
    conditions: (definition?.conditions ?? []).map((condition) => ({
      label: condition.label,
      value: `${slots.filter((slot) => slot.conditionId === condition.id && slot.status === 'valid').length}/${condition.repetitions}`,
    })),
    invalidAttempts: attempts.filter(
      (attempt) =>
        attempt.purpose !== 'recoveryCheck' &&
        ['held', 'error', 'superseded'].includes(attempt.status),
    ),
    heldCount: attempts.filter(
      (attempt) => attempt.purpose !== 'recoveryCheck' && attempt.status === 'held',
    ).length,
    remeasurementCount: attempts.filter(
      (attempt) =>
        attempt.purpose !== 'recoveryCheck' &&
        (attempt.purpose === 'remeasurement' ||
          session.completion?.reviewRequests.some(
            (request) =>
              request.cursor.cursorId === attempt.cursor.cursorId &&
              !request.replacesAttemptIds.includes(attempt.attemptId),
          )),
    ).length,
  };
}

export function cleanupReportIssue(
  session: ExperimentSession,
  attempt: CleanupAttempt,
  report: CleanupReport,
  receivedAt: string,
): DiagnosticIssue | undefined {
  const within = (value: string) =>
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) >= Date.parse(attempt.requestedAt) &&
    Date.parse(value) <= Date.parse(receivedAt);
  if (
    session.source !== 'mock' ||
    report.source !== 'mock' ||
    report.attemptId !== attempt.attemptId ||
    report.sessionId !== session.sessionId ||
    report.deviceId !== session.procedure.deviceCheck?.deviceId ||
    report.command !== 'setOutputZero' ||
    report.status !== 'acknowledged' ||
    !within(report.checkedAt) ||
    !['voltage', 'current'].every((metricId) => {
      const matches = report.readings.filter((item) => item.metricId === metricId);
      const reading = matches[0];
      return (
        matches.length === 1 &&
        !!reading &&
        reading.source === 'mock' &&
        reading.value !== null &&
        Number.isFinite(reading.value) &&
        reading.unit === (metricId === 'voltage' ? 'V' : 'mA') &&
        within(reading.observedAt) &&
        Date.parse(reading.observedAt) <= Date.parse(report.checkedAt)
      );
    })
  )
    return {
      code: 'CLEANUP_UNCONFIRMED',
      message: '출력 종료 응답을 확인하지 못했습니다. 항목을 눌러 다시 요청해 주세요.',
    };
}

export function selectCleanup(session: ExperimentSession) {
  const review = selectCompletionReview(session);
  const attempt = session.completion?.cleanupAttempts.at(-1);
  const passed =
    attempt?.status === 'passed' &&
    !!attempt.report &&
    !!attempt.completedAt &&
    !cleanupReportIssue(session, attempt, attempt.report, attempt.completedAt) &&
    session.evidence.some(
      (item) =>
        item.action === 'cleanupOutputConfirmed' &&
        item.attemptId === attempt.attemptId &&
        item.source === session.source,
    );
  const checked = (id: CleanupCheckId) =>
    session.completion?.checks.some(
      (check) =>
        check.id === id &&
        session.evidence.some(
          (item) =>
            item.evidenceId === check.evidenceId &&
            item.action === 'cleanupConfirmed' &&
            item.kind === 'human' &&
            item.actorId === session.operatorId &&
            item.source === session.source,
        ),
    ) === true;
  const count = cleanupRequirements.filter((item) => checked(item.id)).length;
  return {
    review,
    attempt,
    passed: !!passed,
    checked,
    count,
    pending: attempt?.status === 'pending',
    available: review.allValid && !!session.completion && session.phase === 'cleaningUp',
    canFinish: review.allValid && session.phase === 'cleaningUp' && !!passed && count === 3,
  };
}

export function selectResult(session: ExperimentSession) {
  const review = selectCompletionReview(session);
  const completion = session.completion;
  const finished =
    !!completion?.finishedAt &&
    !!completion.resultId &&
    session.events.some((event) => event.type === 'experimentFinished') &&
    selectCleanup({ ...session, phase: 'cleaningUp' }).canFinish;
  const submission = completion?.submissions.at(-1);
  const submitted =
    session.phase === 'submitted' &&
    submission?.status === 'submitted' &&
    submission.report?.source === 'mock' &&
    submission.report.persistent === false &&
    submission.report.destination === 'mock-review-queue';
  return {
    review,
    completion,
    finished,
    submission,
    submitted,
    available: finished && ['completed', 'submitted'].includes(session.phase),
    canSubmit: finished && session.phase === 'completed' && submission?.status !== 'pending',
  };
}

export function conditionAverages(session: ExperimentSession, conditionId: string) {
  const measurements = selectCompletionReview(session)
    .slots.filter((slot) => slot.conditionId === conditionId && slot.valid)
    .map((slot) => slot.valid!);
  const average = (metricId: string) => {
    const values = measurements
      .map((attempt) => measurementReading(attempt, metricId)?.value)
      .filter(
        (value): value is number => value !== null && value !== undefined && Number.isFinite(value),
      );
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const illuminance = average('illuminance');
  const values = measurements
    .map((attempt) => measurementReading(attempt, 'illuminance')?.value)
    .filter((value): value is number => value !== undefined && value !== null);
  const deviation =
    illuminance && values.length
      ? (Math.sqrt(
          values.reduce((sum, value) => sum + (value - illuminance) ** 2, 0) / values.length,
        ) /
          Math.abs(illuminance)) *
        100
      : null;
  return {
    illuminance,
    voltage: average('voltage'),
    current: average('current'),
    power: average('power'),
    deviation,
  };
}
