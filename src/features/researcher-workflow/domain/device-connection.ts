import { selectDeviceCheck } from './device-check';
import type { DiagnosticIssue } from './device-check';
import type { ExperimentSession } from './models';

/** 출처와 연결 확인은 별개다. 측정값 존재만으로 연결 성공을 추론하지 않는다. */
export type DeviceConnectionState =
  | { status: 'mockConnected'; deviceId: string; checkedAt: string }
  | { status: 'apiConnected'; deviceId: string; checkedAt: string }
  | { status: 'checking' | 'disconnected' | 'failed'; issue?: DiagnosticIssue };

export function selectDeviceConnection(
  session: ExperimentSession,
  mockEnabled: boolean,
): DeviceConnectionState {
  const state = selectDeviceCheck(session);
  const attempt = state.latest;
  if (state.checking) return { status: 'checking' };
  if (!attempt || attempt.report?.connection === 'disconnected')
    return { status: 'disconnected', issue: attempt?.issue };
  // 연결 성공 카드는 현재 시도·출처·시각·필수 센서 검증을 통과한 결과에만 허용한다.
  if ((state.canStart || state.executionStarted) && attempt.report?.connection === 'connected') {
    if (session.source === 'api')
      return {
        status: 'apiConnected',
        deviceId: attempt.report.deviceId,
        checkedAt: attempt.report.checkedAt,
      };
    if (mockEnabled)
      return {
        status: 'mockConnected',
        deviceId: attempt.report.deviceId,
        checkedAt: attempt.report.checkedAt,
      };
  }
  return { status: 'failed', issue: attempt.issue };
}
