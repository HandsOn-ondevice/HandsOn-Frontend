import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import type { MeasurementAttempt } from '../src/features/researcher-workflow/domain/execution';

export const measurementSessionId = 'edge-measurement-test';
export const firstCursor = {
  cursorId: 'server-cursor-17',
  stepId: 's1',
  conditionId: 'near',
  trialIndex: 1,
};
export const nextCursor = {
  cursorId: 'server-cursor-91',
  stepId: 's1',
  conditionId: 'far',
  trialIndex: 1,
};
const timestamp = '2026-11-23T00:00:00Z';

export function sampleFor(
  cursor = firstCursor,
  attemptId = 'server-sample-42',
  distance = 23.7,
): MeasurementAttempt {
  return {
    attemptId,
    cursor,
    purpose: 'measurement',
    status: 'ready',
    requestedAt: timestamp,
    receivedAt: timestamp,
    report: {
      attemptId,
      cursorId: cursor.cursorId,
      source: 'api',
      stability: 'stable',
      diagnostics: {
        deviceId: 'kit',
        source: 'api',
        connection: 'connected',
        checkedAt: timestamp,
        sensors: [
          {
            sensorId: 'distance-01',
            status: 'passed',
            checkedAt: timestamp,
            readings: [
              {
                metricId: 'distance',
                value: distance,
                unit: 'cm',
                observedAt: timestamp,
                source: 'api',
              },
            ],
          },
          {
            sensorId: 'light-01',
            status: 'passed',
            checkedAt: timestamp,
            readings: [
              {
                metricId: 'lightRaw',
                value: 1532,
                unit: 'adc',
                observedAt: timestamp,
                source: 'api',
              },
            ],
          },
        ],
      },
    },
  };
}

export function edgeMeasurementSession() {
  return {
    sessionId: measurementSessionId,
    source: 'api',
    dataOrigin: 'simulation',
    operatorId: 'operator-01',
    createdAt: timestamp,
    updatedAt: timestamp,
    phase: 'running',
    revision: 7,
    pendingJob: null,
    checks: [],
    deviceChecks: [],
    events: [],
    evidence: [],
    procedure: {
      procedureId: 'kit-distance',
      version: '1.0.0',
      title: '거리 측정',
      approval: 'approved',
      deviceId: 'kit',
      preparation: [],
      deviceCheck: {
        deviceId: 'kit',
        title: '키트',
        sensors: [
          {
            sensorId: 'distance-01',
            title: '거리 센서',
            description: '거리',
            required: true,
            metrics: [{ id: 'distance', label: '거리', unit: 'cm' }],
          },
        ],
      },
      execution: {
        provenance: 'approved',
        profileVersion: 'kit-distance-v1',
        settlingSeconds: 1,
        conditions: [
          { id: firstCursor.conditionId, label: '가까운 거리', repetitions: 1 },
          { id: nextCursor.conditionId, label: '먼 거리', repetitions: 1 },
        ],
      },
    },
    execution: { cursor: firstCursor, attempts: [], pendingVoice: null },
  } satisfies ExperimentSession;
}
