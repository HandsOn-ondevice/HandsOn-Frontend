import { createRequestId } from '@/features/researcher-workflow/application/request-id';
import { createEdgeApi, edgeBaseUrl, EdgeApiError, getEdge } from '@/lib/edgeApi';
import type {
  ConditionEvidence,
  EvidenceEvent,
  EvidenceMeasurement,
  ExpertReviewRepository,
  ReviewCondition,
  ReviewOutcome,
  ReviewResult,
  ReviewStatus,
} from './reviewData';

type JsonObject = Record<string, unknown>;
type ResultExpectation = { sessionId?: string; procedureId?: string; preview?: true };

function invalid(): never {
  throw new EdgeApiError({ kind: 'invalid-response' });
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : invalid();
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(object) : invalid();
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : invalid();
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}

function reviewOutcome(value: unknown, sessionId: string): ReviewOutcome {
  const review = object(value);
  if (review.sessionId !== sessionId) invalid();
  const comment = text(review.comment);
  switch (review.decision) {
    case 'approved':
      return { status: 'reviewed', comment };
    case 'remeasureRequested':
      return { status: 'remeasurementRequested', comment };
    default:
      return invalid();
  }
}

function resultPath(resultId: string): `/results/${string}` {
  return `/results/${encodeURIComponent(resultId)}`;
}

async function readResult(
  edgeToken: string | undefined,
  environmentId: string,
  resultId: string,
  expected: ResultExpectation,
) {
  const payload = object(await getEdge<unknown>(resultPath(resultId), undefined, edgeToken));
  const session = object(payload.session);
  const procedure = object(session.procedure);
  const sessionId = text(session.sessionId);
  const procedureId = text(procedure.procedureId);
  const preview =
    expected.preview === true &&
    payload.publicationStatus === 'preview' &&
    payload.resultId === resultId &&
    session.workflowVersion === '2.0' &&
    (session.phase === 'awaitingCleanup' || session.phase === 'readyToSubmit');
  if (
    payload.id !== resultId ||
    (!preview && session.phase !== 'completed') ||
    session.environmentId !== environmentId ||
    (expected.sessionId !== undefined && sessionId !== expected.sessionId) ||
    (expected.procedureId !== undefined && procedureId !== expected.procedureId)
  ) {
    invalid();
  }
  if (session.workflowVersion === '2.0' && !preview) {
    const receipt = object(session.submission);
    if (
      payload.publicationStatus !== 'submitted' ||
      payload.resultId !== resultId ||
      receipt.status !== 'submitted' ||
      receipt.resultId !== resultId ||
      receipt.sessionId !== sessionId ||
      text(receipt.submittedAt) !== payload.submittedAt
    ) {
      invalid();
    }
  }
  const reviews = session.reviews === undefined ? [] : rows(session.reviews);
  const outcome = reviews.length > 0 ? reviewOutcome(reviews.at(-1), sessionId) : undefined;
  return { payload, session, sessionId, procedure, procedureId, outcome, preview };
}

export async function loadEdgeReviewStatus(
  edgeToken: string | undefined,
  environmentId: string,
  resultId: string,
  procedureId: string,
): Promise<ReviewStatus> {
  const { outcome } = await readResult(edgeToken, environmentId, resultId, { procedureId });
  return outcome?.status ?? 'pending';
}

function extractMeasurement(attempt: JsonObject, metricId: string) {
  if (!attempt.report) return undefined;
  const diagnostics = object(object(attempt.report).diagnostics);
  for (const sensor of rows(diagnostics.sensors)) {
    const reading = rows(sensor.readings ?? []).find(({ metricId: id }) => id === metricId);
    if (reading && typeof reading.value === 'number' && Number.isFinite(reading.value)) {
      return {
        value: reading.value,
        unit: text(reading.unit),
        observedAt: text(reading.observedAt),
        source: text(sensor.sensorId),
      };
    }
  }
}

export async function loadEdgeResult(
  edgeToken: string | undefined,
  environmentId: string,
  resultId: string,
  expected: ResultExpectation = {},
): Promise<{ result: ReviewResult; evidenceByCondition: Map<string, ConditionEvidence> }> {
  const { payload, session, sessionId, procedure, procedureId, outcome, preview } =
    await readResult(edgeToken, environmentId, resultId, expected);
  const execution = object(session.execution);
  const attempts = rows(execution.attempts);
  const recoveries = rows(execution.recoveries ?? []);
  const confirmations = rows(session.evidence ?? []).filter(
    ({ action }) => action === 'measurementConfirmed',
  );
  const sensorDefinition = rows(object(procedure.deviceCheck).sensors)[0];
  const metric = rows(sensorDefinition?.metrics)[0];
  const metricId = text(metric?.id);
  const unit = text(metric?.unit);
  const evidenceByCondition = new Map<string, ConditionEvidence>();
  const conditions = rows(object(procedure.execution).conditions).map<ReviewCondition>(
    (condition) => {
      const id = text(condition.id);
      const selected = attempts.filter((attempt) => object(attempt.cursor).conditionId === id);
      const acceptedValues: number[] = [];
      const measurements: EvidenceMeasurement[] = [];
      const history: EvidenceEvent[] = [];

      for (const attempt of selected) {
        const attemptId = text(attempt.attemptId);
        const cursor = object(attempt.cursor);
        const reading = extractMeasurement(attempt, metricId);
        const issue = attempt.issue ? object(attempt.issue) : undefined;
        const recovery = recoveries.find(({ recoveryId }) => recoveryId === attempt.recoveryId);
        if (attempt.purpose === 'recoveryCheck') {
          if (recovery?.status === 'recovered') {
            history.push({
              id: attemptId,
              title: '센서 복구 확인',
              timestamp: text(recovery.completedAt),
              detail: reading ? `${reading.value} ${reading.unit}` : '',
              source: reading?.source ?? '',
              kind: 'recovered',
              sourceKind: 'sensor',
            });
          }
          continue;
        }
        const valid = attempt.status === 'valid';
        if (valid) {
          if (!reading || reading.unit !== unit) return invalid();
          acceptedValues.push(reading.value);
        }
        const issueText = typeof issue?.message === 'string' ? issue.message : undefined;
        const isRemeasurement = attempt.purpose === 'remeasurement';
        measurements.push({
          id: attemptId,
          title: `${count(cursor.trialIndex)}회차${isRemeasurement ? ' 재측정' : ''}`,
          source: reading?.source ?? '',
          timestamp: reading?.observedAt ?? text(attempt.requestedAt),
          kind: reading ? 'sensor' : 'program',
          validity: valid ? 'valid' : 'invalid',
          value: reading ? `${reading.value} ${reading.unit}` : null,
          invalidReason: issueText,
          replacesMeasurementId:
            isRemeasurement && recovery ? text(recovery.blockedAttemptId) : undefined,
        });
        const confirmation = confirmations.find(
          ({ attemptId: confirmedId }) => confirmedId === attemptId,
        );
        if (confirmation) {
          history.push({
            id: text(confirmation.evidenceId),
            title: `${count(cursor.trialIndex)}회차 측정 확인`,
            timestamp: text(confirmation.recordedAt),
            detail: '',
            source: text(confirmation.actorId),
            kind: 'confirmed',
            sourceKind: 'human',
          });
        }
      }
      evidenceByCondition.set(id, {
        measurements,
        history,
        deviationPercent: null,
        voltageAverage: null,
        currentAverage: null,
        powerAverage: null,
        calculation: null,
      });
      return {
        id,
        label: text(condition.label),
        value: acceptedValues.length
          ? acceptedValues.reduce((total, value) => total + value, 0) / acceptedValues.length
          : null,
        validCount: acceptedValues.length,
        totalCount: count(condition.repetitions),
        invalidCount: measurements.length - acceptedValues.length,
      };
    },
  );

  const validCount = count(payload.completedCycles);
  const totalCount = count(payload.totalCycles);
  if (
    conditions.length === 0 ||
    evidenceByCondition.size !== conditions.length ||
    validCount > totalCount ||
    conditions.reduce((sum, item) => sum + item.validCount, 0) !== validCount ||
    conditions.reduce((sum, item) => sum + item.totalCount, 0) !== totalCount
  )
    invalid();

  return {
    result: {
      id: resultId,
      sessionId,
      procedureId,
      procedureTitle: text(procedure.title),
      approvedVersion: text(procedure.version),
      studentName: text(session.operatorId),
      deviceName: text(object(session.workProfile).deviceName),
      submittedLabel: preview
        ? text(session.measurementCompletedAt)
        : text(payload.submittedAt ?? session.completedAt),
      status: outcome?.status ?? ('pending' as const),
      comment: outcome?.comment ?? '',
      validCount,
      totalCount,
      unresolvedCount: totalCount - validCount,
      remeasurementCount: attempts.filter(({ purpose }) => purpose === 'remeasurement').length,
      unit,
      dataOrigin:
        payload.dataOrigin === 'hardware' || payload.dataOrigin === 'simulation'
          ? payload.dataOrigin
          : undefined,
      conditions,
      metricLabel: `조건별 ${text(metric?.label)} 평균`,
    },
    evidenceByCondition,
  };
}

export function createEdgeResultRepository(edgeToken?: string): ExpertReviewRepository {
  const requestIds = new Map<string, string>();
  const loadedSessions = new Map<string, string>();

  async function load(environmentId: string, resultId: string, procedureId?: string) {
    const data = await loadEdgeResult(edgeToken, environmentId, resultId, { procedureId });
    loadedSessions.set(JSON.stringify([environmentId, resultId]), data.result.sessionId);
    return data;
  }

  return {
    async loadResult(environmentId, resultId, procedureId) {
      return (await load(environmentId, resultId, procedureId)).result;
    },
    async loadEvidence(environmentId, resultId, conditionId) {
      return (
        (await load(environmentId, resultId)).evidenceByCondition.get(conditionId) ?? invalid()
      );
    },
    async loadCondition(environmentId, resultId, procedureId, conditionId) {
      const { result, evidenceByCondition } = await load(environmentId, resultId, procedureId);
      const condition = result.conditions.find(({ id }) => id === conditionId);
      const evidence = evidenceByCondition.get(conditionId);
      if (!condition || !evidence) return invalid();
      return { result, condition, evidence };
    },
    async submitReview(environmentId, resultId, outcome) {
      const sessionId = loadedSessions.get(JSON.stringify([environmentId, resultId]));
      if (!sessionId) return invalid();
      const comment = outcome.comment.trim();
      if (!comment || comment.length > 1000) return invalid();
      const decision = outcome.status === 'reviewed' ? 'approved' : 'remeasureRequested';
      const key = JSON.stringify([resultId, decision, comment]);
      const requestId = requestIds.get(key) ?? createRequestId();
      requestIds.set(key, requestId);
      const response = await createEdgeApi({ baseUrl: edgeBaseUrl, token: edgeToken }).post(
        `${resultPath(resultId)}/reviews`,
        {
          requestId,
          decision,
          comment,
        },
      );
      const saved = reviewOutcome(response, sessionId);
      if (saved.status !== outcome.status || saved.comment !== comment) return invalid();
      return saved;
    },
  };
}
