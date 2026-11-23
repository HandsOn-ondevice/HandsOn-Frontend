import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  AppBar,
  AppText,
  Button,
  EvidenceRow,
  FeedbackPanel,
  Screen,
  StatusBadge,
  StatusBar,
  StepProgress,
  SurfaceCard,
  spacing,
} from '@/design-system';
import { getEdge, getEdgeErrorMessage } from '@/lib/edgeApi';
import { procedureVersionLabel } from './procedure-version-label';

interface EdgeSession {
  sessionId: string;
  phase:
    | 'preparing'
    | 'awaitingDeviceCheck'
    | 'readyToExecute'
    | 'running'
    | 'held'
    | 'completed'
    | 'cancelled';
  holdReason: { code: string } | null;
  procedure: {
    title: string;
    version: string;
    preparation: readonly { id: string; title: string; description: string; owner: string }[];
  };
  checks: readonly { id: string; checked: boolean }[];
}

type SessionLookup =
  { status: 'error'; message: string } | { status: 'ready'; session: EdgeSession };

const fallbackError = '저장된 실험 세션을 불러오지 못했어요.';

export function EdgePreparationScreen({
  sessionId,
  token,
  onBack,
  onHome,
}: {
  sessionId: string;
  token?: string;
  onBack: () => void;
  onHome: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ attempt: number; lookup: SessionLookup }>();
  const lookup = snapshot?.attempt === attempt ? snapshot.lookup : undefined;

  useEffect(() => {
    let active = true;

    void getEdge<EdgeSession>(`/sessions/${encodeURIComponent(sessionId)}`, undefined, token).then(
      (session) => {
        if (!active) return;
        const lookup: SessionLookup =
          session?.sessionId === sessionId
            ? { status: 'ready', session }
            : { status: 'error', message: fallbackError };
        setSnapshot({ attempt, lookup });
      },
      (error: unknown) => {
        if (active) {
          setSnapshot({
            attempt,
            lookup: { status: 'error', message: getEdgeErrorMessage(error) ?? fallbackError },
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [attempt, sessionId, token]);

  const session = lookup?.status === 'ready' ? lookup.session : undefined;
  const nextScreen = session ? getContinuationPath(session) : undefined;
  if (session && nextScreen) {
    return <Redirect href={{ pathname: nextScreen, params: { sessionId: session.sessionId } }} />;
  }

  return (
    <Screen>
      <StatusBar />
      <AppBar title="실험 준비 체크" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading" accessibilityRole="header">
          실험 전, 하나씩 확인해요.
        </AppText>
        {!lookup ? (
          <AppText accessibilityLiveRegion="polite">준비 상태를 불러오고 있습니다.</AppText>
        ) : lookup.status === 'error' ? (
          <>
            <FeedbackPanel
              title="준비 상태를 확인해 주세요"
              subtitle={lookup.message}
              tone="danger"
              icon="alert"
            />
            <Button
              label="상태 다시 불러오기"
              variant="secondary"
              onPress={() => setAttempt((previous) => previous + 1)}
            />
          </>
        ) : lookup.session.phase === 'preparing' ? (
          <PreparationSnapshot session={lookup.session} />
        ) : (
          <>
            <FeedbackPanel
              title="이미 종료된 실험 세션이에요."
              subtitle="연구생 홈에서 진행 중인 실험을 다시 확인해 주세요."
            />
            <Button label="연구생 홈으로" onPress={onHome} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function getContinuationPath(session: EdgeSession) {
  switch (session.phase) {
    case 'running':
      return '/researcher-workflow/[sessionId]/execution';
    case 'held':
      return session.holdReason?.code === 'USER_PAUSED'
        ? '/researcher-workflow/[sessionId]/paused'
        : '/researcher-workflow/[sessionId]/recovery';
    case 'awaitingDeviceCheck':
    case 'readyToExecute':
      return '/researcher-workflow/[sessionId]/device-check';
  }
}

function PreparationSnapshot({ session }: { session: EdgeSession }) {
  const { procedure } = session;
  const checkedIds = new Set(session.checks.filter((check) => check.checked).map(({ id }) => id));
  const completed = procedure.preparation.filter(({ id }) => checkedIds.has(id)).length;
  const total = procedure.preparation.length;

  return (
    <>
      <SurfaceCard
        title={`${procedure.title} · ${procedureVersionLabel(procedure.version)}`}
        subtitle={`세션 ${session.sessionId}`}
      >
        <StatusBadge label="준비 중" />
      </SurfaceCard>
      <StepProgress
        title={`준비 진행도 · ${completed} / ${total} 항목 완료`}
        value={total ? Math.round((completed / total) * 100) : 0}
      />
      {procedure.preparation.map(({ id, title, description, owner }) => (
        <EvidenceRow
          key={id}
          title={title}
          subtitle={description}
          kind={owner === 'operator' ? 'human' : 'program'}
          state={checkedIds.has(id) ? 'confirmed' : 'pending'}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({ content: { padding: spacing[24], gap: spacing[10] } });
