import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import {
  AppBar,
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  Screen,
  StatusBar,
  spacing,
} from '@/design-system';
import type { ReviewResult } from './reviewData';

type Query<T> = { status: 'loading' | 'error' } | { status: 'ready'; data: T };

export function useReviewQuery<T>(load: () => Promise<T>) {
  const [query, setQuery] = useState<Query<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (active) setQuery({ status: 'ready', data });
        },
        () => {
          if (active) setQuery({ status: 'error' });
        },
      );
    return () => {
      active = false;
    };
  }, [attempt, load]);

  return {
    query,
    retry() {
      setQuery({ status: 'loading' });
      setAttempt((value) => value + 1);
    },
  };
}

export function ReviewQueryFeedback({
  loading,
  subject,
  onRetry,
}: {
  loading: boolean;
  subject: '결과' | '측정 근거';
  onRetry: () => void;
}) {
  return loading ? (
    <FeedbackPanel title={`${subject}를 불러오는 중이에요.`} />
  ) : (
    <>
      <FeedbackPanel title={`${subject}를 불러오지 못했어요.`} tone="warning" icon="alert" />
      <Button label="다시 시도" variant="secondary" icon="retry" onPress={onRetry} />
    </>
  );
}

export function ReviewLayout({
  title,
  onBack,
  result,
  children,
  footer,
}: {
  title: string;
  onBack: () => void;
  result?: ReviewResult;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <Screen>
      <StatusBar />
      <AppBar
        title={title}
        mode="back"
        onBack={onBack}
        onMore={result ? () => setDetailsOpen(true) : undefined}
      />
      <KeyboardAvoidingView
        style={styles.viewport}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          key={title}
          ref={scroll}
          style={styles.viewport}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onLayout={() => {
            // The opinion is at the end of the scroll view. Android can focus it before the
            // keyboard has resized the viewport, so bring it into view after that layout.
            if (Platform.OS === 'android' && Keyboard.isVisible()) {
              scroll.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
      {result ? (
        <BottomSheet
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title="제출 정보"
          icon="result"
        >
          <AppText>연구생 · {result.studentName}</AppText>
          <AppText>장치 · {result.deviceName}</AppText>
          <AppText>절차 · {result.procedureTitle}</AppText>
          <AppText>승인 버전 · {result.approvedVersion}</AppText>
          <AppText>세션 · {result.sessionId}</AppText>
          <AppText>{result.submittedLabel}</AppText>
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  content: {
    paddingHorizontal: spacing[24],
    paddingVertical: spacing[24],
    gap: spacing[12],
  },
});
