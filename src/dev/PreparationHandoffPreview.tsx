import { AppText, Button, FeedbackPanel, Screen, StatusBar, SurfaceCard } from '@/design-system';
import type { PreparationRequest } from '@/features/procedures/PreparationHandoffProvider';

/** Development-only inspection surface until the A preparation contract is agreed. */
export function PreparationHandoffPreview({
  request,
  onBack,
}: {
  request: PreparationRequest;
  onBack: () => void;
}) {
  return (
    <Screen scroll>
      <StatusBar />
      <AppText variant="heading" accessibilityRole="header">
        개발용 준비 입력 확인
      </AppText>
      <FeedbackPanel
        title="실험 준비 화면 연결 대기"
        subtitle="합성 데이터로 선택한 입력만 확인합니다. 실제 세션 생성과 실험 준비는 아직 연결되지 않았습니다."
        tone="warning"
        icon="alert"
      />
      <SurfaceCard title="절차 식별자" subtitle={request.procedureId} />
      <SurfaceCard title="고정한 승인 버전" subtitle={request.approvedVersion} />
      <SurfaceCard title="작업 환경" subtitle={request.environment.name}>
        <AppText>{request.environment.id}</AppText>
        <AppText>{request.environment.workType}</AppText>
        <AppText>{request.environment.deviceName}</AppText>
      </SurfaceCard>
      <Button label="절차 상세로 돌아가기" variant="secondary" icon="back" onPress={onBack} />
    </Screen>
  );
}
