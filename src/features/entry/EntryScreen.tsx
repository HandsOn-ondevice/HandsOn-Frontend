import { useEffect, useRef, useState } from 'react';
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
import { getEdgeErrorMessage, isEdgeDataEnabled } from '@/lib/edgeApi';
import {
  loadWorkEnvironments,
  type EntrySelection,
  type LoadWorkEnvironments,
  type WorkEnvironment,
} from './entryEnvironment';

type EnvironmentLookup =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; detail?: string }
  | { status: 'ready'; environments: readonly WorkEnvironment[] };

interface EntryScreenProps {
  onContinue: (selection: EntrySelection) => void;
  loadEnvironments?: LoadWorkEnvironments;
}

const roles = ['student', 'expert'] as const;

export function EntryScreen({
  onContinue,
  loadEnvironments = loadWorkEnvironments,
}: EntryScreenProps) {
  const edge = isEdgeDataEnabled();
  const [role, setRole] = useState<UserRole>();
  const [tokenInput, setTokenInput] = useState('');
  const [entryRequest, setEntryRequest] = useState<{ token?: string }>();
  const currentRequest = useRef(entryRequest);
  const [environmentId, setEnvironmentId] = useState('');
  const [lookup, setLookup] = useState<EnvironmentLookup>({
    status: edge ? 'idle' : 'loading',
  });

  useEffect(() => {
    if (edge && !entryRequest) return;
    let active = true;
    void loadEnvironments(entryRequest?.token).then(
      (environments) => {
        if (active && entryRequest === currentRequest.current) {
          setLookup({ status: 'ready', environments });
        }
      },
      (error: unknown) => {
        if (active && entryRequest === currentRequest.current) {
          setLookup({ status: 'error', detail: getEdgeErrorMessage(error) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [edge, entryRequest, loadEnvironments]);

  const environments = lookup.status === 'ready' ? lookup.environments : [];
  const environment = environments.find(({ id }) => id === environmentId);
  const loading = lookup.status === 'loading';
  const unavailable = lookup.status !== 'idle' && !loading && environments.length === 0;
  const showSymbol = role === 'expert';

  function selectRole(choice: UserRole) {
    if (edge && role !== choice) resetEdgeLookup();
    setRole(choice);
  }

  function resetEdgeLookup() {
    currentRequest.current = undefined;
    setTokenInput('');
    setEntryRequest(undefined);
    setEnvironmentId('');
    setLookup({ status: 'idle' });
  }

  function requestEnvironments() {
    setEnvironmentId('');
    setLookup({ status: 'loading' });
    const token = tokenInput.trim() || entryRequest?.token;
    const request = { token };
    currentRequest.current = request;
    setEntryRequest(request);
    setTokenInput('');
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
              onPress={() => selectRole(choice)}
              style={styles.role}
            />
          ))}
        </View>

        <SectionHeader title="작업 환경" />
        {edge && role && (lookup.status === 'idle' || lookup.status === 'error') ? (
          <TextField
            label="Edge 접속 토큰"
            value={tokenInput}
            onChange={setTokenInput}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />
        ) : null}
        {edge && lookup.status === 'idle' && role ? (
          <Button
            label="작업 환경 불러오기"
            disabled={!tokenInput.trim()}
            onPress={requestEnvironments}
          />
        ) : null}
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
            title={`작업 유형 · ${environment.workType}`}
            subtitle={`실행 장치 · ${environment.deviceName}`}
          >
            {environment.workProfile ? (
              <AppText variant="caption" color={colors.text.secondary}>
                {`작업 프로필 · ${environment.workProfile.id} · ${environment.workProfile.version}`}
              </AppText>
            ) : null}
          </SurfaceCard>
        ) : null}
        {edge && lookup.status === 'ready' ? (
          <Button label="Edge 접속 토큰 변경" variant="tertiary" onPress={resetEdgeLookup} />
        ) : null}
        {unavailable ? (
          <View style={styles.feedback}>
            <FeedbackPanel
              title={
                lookup.status === 'error'
                  ? '작업 환경을 불러오지 못했어요.'
                  : '선택할 수 있는 작업 환경이 없어요.'
              }
              subtitle={lookup.status === 'error' ? lookup.detail : undefined}
              tone="warning"
              icon="alert"
            />
            <Button
              label="다시 시도"
              variant="secondary"
              icon="retry"
              onPress={requestEnvironments}
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
          if (role && environment)
            onContinue(
              edge ? { role, environment, edgeToken: entryRequest?.token } : { role, environment },
            );
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
