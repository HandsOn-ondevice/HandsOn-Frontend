import type { CleanupReport, MockSubmissionReport } from '../../domain/completion';

export interface MockCleanupInput {
  readonly attemptId: string;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly now: () => string;
}
export interface MockSubmissionInput {
  readonly attemptId: string;
  readonly sessionId: string;
  readonly resultId: string;
  readonly now: () => string;
}
export type MockCleanupRunner = (input: MockCleanupInput) => Promise<CleanupReport>;
export type MockSubmissionRunner = (input: MockSubmissionInput) => Promise<MockSubmissionReport>;
export function buildMockCleanupReport(input: MockCleanupInput): CleanupReport {
  const checkedAt = input.now();
  return {
    attemptId: input.attemptId,
    sessionId: input.sessionId,
    deviceId: input.deviceId,
    source: 'mock',
    command: 'setOutputZero',
    status: 'acknowledged',
    checkedAt,
    readings: [
      { metricId: 'voltage', value: 0.02, unit: 'V', observedAt: checkedAt, source: 'mock' },
      { metricId: 'current', value: 0, unit: 'mA', observedAt: checkedAt, source: 'mock' },
    ],
  };
}
export function buildMockSubmissionReport(input: MockSubmissionInput): MockSubmissionReport {
  return {
    attemptId: input.attemptId,
    sessionId: input.sessionId,
    resultId: input.resultId,
    source: 'mock',
    destination: 'mock-review-queue',
    persistent: false,
    status: 'accepted',
    receivedAt: input.now(),
    receiptId: `mock-receipt-${input.attemptId}`,
  };
}
// 모의 응답 지연이다. 장치 timeout·안전 판정·서버 전송을 구현하지 않는다.
export const runMockCleanup: MockCleanupRunner = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, 450));
  return buildMockCleanupReport(input);
};
export const runMockSubmission: MockSubmissionRunner = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, 450));
  return buildMockSubmissionReport(input);
};
