import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import { EdgeApiError, type EdgeApi } from '@/lib/edgeApi';
import {
  getEdgePreparation,
  type EdgePreparation,
} from '../infrastructure/edge/edgePreparationRepository';

type Lookup =
  | { status: 'loading' }
  | { status: 'ready'; preparation: EdgePreparation }
  | { status: 'error'; message: string };

function loadError(error: unknown) {
  const status = error instanceof EdgeApiError ? error.status : undefined;
  if (status === 404) return '저장된 세션을 찾을 수 없어요. 이전 화면에서 절차를 확인해 주세요.';
  if (status === 401 || status === 403) {
    return '세션을 조회할 권한이 없어요. 작업 환경을 다시 설정해 주세요.';
  }
  return '연결 상태를 확인한 뒤 같은 세션을 다시 불러와 주세요.';
}

export function EdgePreparationScreen({
  edge,
  sessionId,
  onBack,
}: {
  edge: EdgeApi;
  sessionId: string;
  onBack: () => void;
}) {
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getEdgePreparation(edge, sessionId, controller.signal).then(
      (preparation) => {
        if (!controller.signal.aborted) setLookup({ status: 'ready', preparation });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLookup({ status: 'error', message: loadError(error) });
      },
    );
    return () => controller.abort();
  }, [attempt, edge, sessionId]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar tone="light" />
      <AppBar title="실험 준비 체크" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {lookup.status === 'loading' ? (
          <FeedbackPanel title="준비 상태를 불러오는 중" />
        ) : lookup.status === 'error' ? (
          <>
            <FeedbackPanel
              title="준비 상태를 불러오지 못했어요."
              subtitle={lookup.message}
              tone="warning"
              icon="alert"
            />
            <Button
              label="상태 다시 불러오기"
              variant="secondary"
              icon="retry"
              onPress={() => {
                setLookup({ status: 'loading' });
                setAttempt((previous) => previous + 1);
              }}
            />
          </>
        ) : (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {lookup.preparation.title}
            </AppText>
            <AppText variant="caption">{`승인 버전 ${lookup.preparation.version}`}</AppText>
            {lookup.preparation.items.map((item) => (
              <SurfaceCard key={item.id} title={item.title} subtitle={item.description}>
                <StatusBadge
                  label={item.checked ? '확인 완료' : '확인 전'}
                  tone={item.checked ? 'success' : 'neutral'}
                />
              </SurfaceCard>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[10] },
});
