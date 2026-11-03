import { FeedbackPanel } from '@/design-system';
import type { DeviceConnectionState } from '../domain/device-connection';

/** 같은 성공 카드로 표시하되 실제/모의 연결 상태와 문구는 구분한다. */
export function DeviceConnectionCard({
  state,
  deviceName,
}: {
  state: DeviceConnectionState;
  deviceName?: string;
}) {
  const connected = state.status === 'mockConnected' || state.status === 'apiConnected';
  const title =
    state.status === 'mockConnected'
      ? 'Mock 기기 연결됨'
      : state.status === 'apiConnected'
        ? `${deviceName ?? '기기'} 연결됨`
        : state.status === 'checking'
          ? '장치 연결 확인 중'
          : state.status === 'disconnected'
            ? '기기 미연결'
            : '장치 연결 실패';
  const subtitle =
    state.status === 'mockConnected'
      ? '모의 장치 응답 확인'
      : state.status === 'apiConnected'
        ? `${state.deviceId} · 확인 ${new Date(state.checkedAt).toLocaleTimeString('ko-KR', { hour12: false })}`
        : state.status === 'checking'
          ? '점검 응답을 기다려 주세요. 화면을 나가도 점검은 유지됩니다.'
          : (state.issue?.message ?? '장치·센서 점검을 시작해 주세요');
  return (
    <FeedbackPanel
      title={title}
      subtitle={subtitle}
      tone={
        connected
          ? 'success'
          : state.status === 'failed'
            ? 'danger'
            : state.status === 'disconnected'
              ? 'warning'
              : 'info'
      }
      icon={connected ? 'check' : state.status === 'failed' ? 'alert' : 'device'}
    />
  );
}
