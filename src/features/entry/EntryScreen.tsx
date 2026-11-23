import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  Icon,
  RoleCard,
  SectionHeader,
  SelectField,
  StatusBar,
  SurfaceCard,
  Symbol,
  TextField,
  colors,
  gradients,
  radii,
  spacing,
  type UserRole,
} from '@/design-system';
import { EdgeApiError } from '@/lib/edgeApi';
import {
  loadWorkEnvironments,
  type EntrySelection,
  type LoadWorkEnvironments,
  type WorkEnvironment,
} from './entryEnvironment';

type EnvironmentLookup =
  | { status: 'loading' }
  | { status: 'error'; error?: EdgeApiError }
  | { status: 'ready'; environments: readonly WorkEnvironment[] };

interface EntryScreenProps {
  onContinue: (selection: EntrySelection) => void;
  loadEnvironments?: LoadWorkEnvironments;
}

const roles = ['student', 'expert'] as const;

function isAuthError(error?: EdgeApiError) {
  return error?.kind === 'server' && (error.status === 401 || error.status === 403);
}

function lookupErrorTitle(error?: EdgeApiError) {
  if (isAuthError(error)) return 'Edge 서버 인증을 확인해 주세요.';
  switch (error?.kind) {
    case 'configuration':
      return 'Edge 서버 주소를 확인해 주세요.';
    case 'network':
      return 'Edge 서버에 연결할 수 없어요.';
    case 'server':
      return 'Edge 서버에서 작업 환경을 조회하지 못했어요.';
    case 'invalid-response':
      return 'Edge 서버 응답을 읽을 수 없어요.';
    default:
      return '작업 환경을 불러오지 못했어요.';
  }
}

export function EntryScreen({
  onContinue,
  loadEnvironments = loadWorkEnvironments,
}: EntryScreenProps) {
  const [role, setRole] = useState<UserRole>();
  const [environmentId, setEnvironmentId] = useState('');
  const [lookup, setLookup] = useState<EnvironmentLookup>({ status: 'loading' });
  const [attempt, setAttempt] = useState<{ token?: string }>({});
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void loadEnvironments({ token: attempt.token, signal }).then(
      (environments) => {
        if (!signal.aborted) setLookup({ status: 'ready', environments });
      },
      (error: unknown) => {
        if (!signal.aborted) {
          setLookup({ status: 'error', error: error instanceof EdgeApiError ? error : undefined });
        }
      },
    );
    return () => controller.abort();
  }, [attempt, loadEnvironments]);

  const environments = lookup.status === 'ready' ? lookup.environments : [];
  const environment = environments.find(({ id }) => id === environmentId);
  const loading = lookup.status === 'loading';
  const unavailable = !loading && environments.length === 0;
  const error = lookup.status === 'error' ? lookup.error : undefined;
  const authRequired = isAuthError(error);
  const errorDetail = [error?.status && `HTTP ${error.status}`, error?.code]
    .filter(Boolean)
    .join(' · ');
  const showSymbol = role === 'expert';

  function retry() {
    const token = authRequired ? tokenInput.trim() : attempt.token;
    setEnvironmentId('');
    setTokenInput('');
    setLookup({ status: 'loading' });
    setAttempt({ token });
  }

  return (
    <View style={styles.screen}>
      <StatusBar tone="inverse" />
      <LinearGradient
        colors={gradients.contrast}
        locations={[0.0714, 0.4286, 0.7857]}
        start={{ x: 0, y: 0.435 }}
        end={{ x: 1, y: 0.565 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.header}>
        <AppBar tone="inverse" logoWidth={40} style={styles.appBar} />
        <View style={[styles.headerCopy, showSymbol && styles.headerCopyWithSymbol]}>
          {showSymbol ? (
            <View pointerEvents="none" style={styles.headerSymbol}>
              <Symbol width={130} />
            </View>
          ) : null}
          <AppText variant="heading" color={colors.text.inverse} accessibilityRole="header">
            {'시작은 가볍게,\n실험은 정확하게.'}
          </AppText>
          <AppText variant="caption" color={colors.text.inverse}>
            나에게 맞는 작업 공간을 준비해요.
          </AppText>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.viewport}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader title="어떤 역할로 사용하시나요?" />
        <AppText variant="caption" color={colors.text.secondary}>
          역할에 따라 실행 화면과 절차 관리 기능이 달라집니다.
        </AppText>
        <View style={styles.roleChoices} accessibilityRole="radiogroup">
          {roles.map((choice) => (
            <RoleCard
              key={choice}
              role={choice}
              state={role === choice ? 'selected' : 'default'}
              onPress={() => setRole(choice)}
              style={styles.role}
            />
          ))}
        </View>

        <SectionHeader title="작업 환경" />
        <SelectField
          label="연구실"
          value={environment?.id ?? ''}
          onChange={setEnvironmentId}
          options={environments.map(({ id, name }) => ({ label: name, value: id }))}
          placeholder={loading ? '작업 환경을 불러오는 중' : '연구실을 선택해 주세요'}
          disabled={environments.length === 0}
        />
        {environment ? (
          <SurfaceCard
            tone="subtle"
            title={environment.workType ? `작업 유형 · ${environment.workType}` : undefined}
            subtitle={environment.deviceName ? `실행 장치 · ${environment.deviceName}` : undefined}
          >
            <AppText variant="caption" color={colors.text.secondary}>
              {`프로필 ID · ${environment.id}`}
            </AppText>
          </SurfaceCard>
        ) : null}
        {unavailable ? (
          <View style={styles.feedback}>
            <FeedbackPanel
              title={
                lookup.status === 'error'
                  ? lookupErrorTitle(error)
                  : '선택할 수 있는 작업 환경이 없어요.'
              }
              subtitle={errorDetail}
              tone="warning"
              icon="alert"
            />
            {authRequired ? (
              <TextField
                label="Edge 접속 토큰"
                value={tokenInput}
                onChange={setTokenInput}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
              />
            ) : null}
            <Button
              label="다시 시도"
              variant="secondary"
              icon="retry"
              disabled={authRequired && !tokenInput.trim()}
              onPress={retry}
            />
          </View>
        ) : null}
        <View style={styles.privacy}>
          <Icon name="lock" size={15} color={colors.text.secondary} />
          <AppText variant="caption" color={colors.text.secondary} style={styles.privacyText}>
            음성과 실험 이력은 로컬 장치에서 처리·저장됩니다.
          </AppText>
        </View>
      </ScrollView>

      <ActionShelf
        primary="설정하고 계속"
        disabled={!role || !environment}
        onPrimary={() => {
          if (role && environment) onContinue({ role, environment });
        }}
        safeArea
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  header: { gap: spacing[8] },
  appBar: { backgroundColor: 'transparent' },
  headerCopy: {
    gap: spacing[6],
    paddingHorizontal: spacing[24],
    paddingTop: spacing[6],
    paddingBottom: spacing[24],
  },
  headerCopyWithSymbol: { paddingRight: 112 },
  headerSymbol: { position: 'absolute', top: -3, right: spacing[10] },
  viewport: {
    flex: 1,
    borderTopLeftRadius: radii[30],
    borderTopRightRadius: radii[30],
    backgroundColor: colors.surface.canvas,
  },
  content: { padding: spacing[24], gap: spacing[12] },
  roleChoices: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
  },
  role: { flex: 1 },
  feedback: { gap: spacing[8] },
  privacy: { flexDirection: 'row', gap: spacing[8], padding: spacing[10] },
  privacyText: { flex: 1 },
});
