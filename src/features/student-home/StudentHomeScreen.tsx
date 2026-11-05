import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppBar,
  AppText,
  BottomNavigation,
  BottomSheet,
  Button,
  FeedbackPanel,
  HeroPanel,
  Icon,
  SectionHeader,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  colors,
  radii,
  spacing,
} from '@/design-system';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import type { StudentHomeDestination } from './studentHomeRoutes';
import type { StudentHomeLookup } from './useStudentHome';

interface StudentHomeScreenProps {
  environment: WorkEnvironment;
  lookup: StudentHomeLookup;
  onReload: () => void;
  onNavigate: (destination: StudentHomeDestination) => void;
  onChangeEnvironment: () => void;
}

const sessionLabels = { running: '진행 중', paused: '일시정지', held: '보류' } as const;
const deviceLabels = {
  connected: '장치 연결',
  disconnected: '장치 연결 끊김',
  unknown: '장치 확인 필요',
} as const;

export function StudentHomeScreen({
  environment,
  lookup,
  onReload,
  onNavigate,
  onChangeEnvironment,
}: StudentHomeScreenProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const changeEnvironmentAfterClose = useRef(false);
  const data = lookup.status === 'ready' ? lookup.data : null;
  const session = data?.ongoingSession;
  const openProcedures = () => onNavigate({ type: 'procedures', environmentId: environment.id });

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <StatusBar />
      <AppBar onProfile={() => setProfileOpen(true)} />
      <ScrollView contentContainerStyle={styles.content} testID="student-home">
        <View style={styles.greeting}>
          <AppText variant="caption" color={colors.text.secondary}>
            {data ? `좋은 하루예요, ${data.researcherName}님` : '오늘의 실험을 준비해요.'}
          </AppText>
          <View style={styles.headingRow}>
            <AppText
              variant="heading"
              accessibilityRole="header"
              accessibilityLabel="연구생 홈"
              style={styles.flexText}
            >
              {session ? '실험을 이어갈까요?' : '새 실험을 시작할까요?'}
            </AppText>
            {data ? (
              <StatusBadge
                label={deviceLabels[data.deviceStatus]}
                tone={data.deviceStatus === 'connected' ? 'success' : 'warning'}
              />
            ) : null}
          </View>
        </View>

        {lookup.status === 'loading' ? (
          <FeedbackPanel
            title="홈을 불러오는 중"
            subtitle="진행 중인 작업과 최근 기록을 확인하고 있어요."
          />
        ) : lookup.status === 'error' ? (
          <View style={styles.group}>
            <FeedbackPanel
              title="홈을 불러오지 못했어요."
              subtitle="연결 상태를 확인하고 다시 시도해 주세요."
              tone="warning"
              icon="alert"
            />
            <Button label="다시 시도" variant="secondary" icon="retry" onPress={onReload} />
          </View>
        ) : session ? (
          <View style={styles.group}>
            <HeroPanel
              title={session.title}
              subtitle={`${sessionLabels[session.status]} · ${session.savedAtLabel} 저장\n${session.conditionProgress}% 조건 · ${session.completedCycles} / ${session.totalCycles}회차`}
            />
            <Button
              label="이어서 진행"
              icon="play"
              onPress={() => onNavigate({ type: 'resume', sessionId: session.id })}
            />
          </View>
        ) : (
          <HeroPanel
            title="첫 단계부터 차근차근"
            subtitle="승인된 절차를 선택하면 실험 준비를 시작할 수 있어요."
          />
        )}

        {!session ? (
          <Button label="승인 절차 선택" icon="approval" onPress={openProcedures} />
        ) : null}

        {data ? (
          <>
            <SectionHeader title="승인된 절차" action="전체 보기" onAction={openProcedures} />
            {data.approvedProcedures.length ? (
              data.approvedProcedures.map((procedure) => (
                <Pressable
                  key={procedure.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${procedure.title}, ${procedure.version}, 승인 절차 선택`}
                  onPress={openProcedures}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <SurfaceCard
                    title={procedure.title}
                    subtitle={`${procedure.version} · ${procedure.equipmentLabel} · ${procedure.stepCount}단계`}
                    style={styles.procedure}
                  />
                </Pressable>
              ))
            ) : (
              <SurfaceCard
                title="승인된 절차가 없어요."
                subtitle="사용할 수 있는 절차가 승인되면 여기에 표시돼요."
              />
            )}

            <SectionHeader
              title="최근 기록"
              action="이력"
              onAction={() => onNavigate({ type: 'history' })}
            />
            {data.recentResults.length ? (
              data.recentResults.map((result) => (
                <Pressable
                  key={result.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${result.title}, 결과 보기`}
                  onPress={() =>
                    onNavigate({ type: 'result', resultId: result.id, sessionId: result.sessionId })
                  }
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <SurfaceCard style={styles.result}>
                    <View style={styles.resultRow}>
                      <View style={styles.resultIcon}>
                        <Icon name="check" size={18} color={colors.status.success} />
                      </View>
                      <View style={styles.flexText}>
                        <AppText variant="label">{result.title}</AppText>
                        <AppText variant="caption" color={colors.text.secondary}>
                          {`${result.completedAtLabel} · ${result.status === 'submitted' ? '제출 완료' : '실험 완료'}`}
                        </AppText>
                      </View>
                      <AppText variant="caption" color={colors.status.success}>
                        완료
                      </AppText>
                    </View>
                  </SurfaceCard>
                </Pressable>
              ))
            ) : (
              <SurfaceCard
                title="아직 완료한 실험이 없어요."
                subtitle="실험을 마치면 최근 기록을 확인할 수 있어요."
              />
            )}
          </>
        ) : null}

        <SectionHeader title="작업 환경" />
        <SurfaceCard title={environment.name} subtitle={`작업 유형 · ${environment.workType}`}>
          <View style={styles.environmentRow}>
            <Icon name="device" size={18} />
            <AppText color={colors.text.secondary} style={styles.flexText}>
              {environment.deviceName}
            </AppText>
            <Button
              label="장치 보기"
              variant="tertiary"
              onPress={() => onNavigate({ type: 'devices' })}
            />
          </View>
        </SurfaceCard>
        {__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1' ? (
          <AppText variant="caption" color={colors.text.secondary}>
            개발용 예시 데이터입니다. 실제 장치 연결 상태와 다를 수 있어요.
          </AppText>
        ) : null}
      </ScrollView>

      <BottomNavigation
        role="student"
        active="home"
        style={styles.navigation}
        onChange={(item) => {
          if (item === 'home') onReload();
          else if (item === 'work') openProcedures();
          else onNavigate({ type: item === 'device' ? 'devices' : 'history' });
        }}
      />

      <BottomSheet
        open={profileOpen}
        onClose={() => {
          setProfileOpen(false);
          if (changeEnvironmentAfterClose.current) {
            changeEnvironmentAfterClose.current = false;
            onChangeEnvironment();
          }
        }}
        title="작업 환경"
        subtitle={environment.name}
        icon="environment"
      >
        <AppText>{`${environment.workType} · ${environment.deviceName}`}</AppText>
        <Button
          label="역할·환경 다시 선택"
          accessibilityLabel="뒤로가기"
          variant="secondary"
          onPress={() => {
            changeEnvironmentAfterClose.current = true;
            setProfileOpen(false);
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], paddingTop: spacing[16], gap: spacing[16] },
  greeting: { gap: spacing[4] },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[8] },
  flexText: { flex: 1, flexShrink: 1 },
  group: { gap: spacing[12] },
  procedure: { borderRadius: radii[28], paddingVertical: spacing[20] },
  pressed: { opacity: 0.8 },
  result: { padding: spacing[12] },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: radii[12],
    backgroundColor: colors.status.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  environmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  navigation: { marginHorizontal: spacing[24], marginTop: spacing[8], marginBottom: spacing[8] },
});
