import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  ConditionProgress,
  FeedbackPanel,
  MetricTile,
  StatusBar,
  StepProgress,
  VoicePanel,
  colors,
  spacing,
} from '../design-system';

export function ExecutionExample({ onBack }: { onBack: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar
        title="핵심 실행 화면"
        mode="back"
        tone="light"
        onBack={onBack}
        onMore={() => setMessage('조합 검증 예제입니다.')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">LED 출력 특성 측정</AppText>
        <AppText variant="caption">세션 R-241015-07 · v1.2 · 가상의 합성 데이터</AppText>
        <StepProgress title="11 / 16단계 · 50% 측정" value={64} state="running" />
        <ConditionProgress
          items={[
            { label: '0%', value: '3/3' },
            { label: '25%', value: '3/3' },
            { label: '50%', value: '2/3' },
            { label: '75%', value: '0/3' },
            { label: '100%', value: '0/3' },
          ]}
          state="running"
          currentIndex={2}
        />
        <FeedbackPanel
          title={'50% 출력 · 2회차\n측정을 진행하세요'}
          subtitle="안정화 완료 · 지그를 건드리지 말고 센서값이 최신인지 확인한 뒤 완료를 요청하세요."
          tone="info"
          icon="guidance"
        />
        <View style={styles.metrics}>
          <View style={styles.cell}>
            <MetricTile
              title="BH1750 조도"
              value="420"
              meta="lx · 0.7초 전"
              detail="이전 조도보다 증가"
              tone="success"
            />
          </View>
          <View style={styles.cell}>
            <MetricTile
              title="INA219 전압"
              value="5.01"
              meta="V · 0.5초 전"
              detail="승인 범위 안"
              tone="success"
            />
          </View>
          <View style={styles.cell}>
            <MetricTile
              title="INA219 전류"
              value="83"
              meta="mA · 0.5초 전"
              detail="250mA 미만"
              tone="success"
            />
          </View>
          <View style={styles.cell}>
            <MetricTile
              title="BME280 환경"
              value="24.3"
              meta="°C · 0.9초 전"
              detail="습도 46%"
              tone="info"
            />
          </View>
        </View>
        <VoicePanel title="말씀하세요" subtitle="“50% 조건 2회차 완료했어”" state="idle" />
        {message && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
      </ScrollView>
      <ActionShelf
        safeArea
        primary="완료 요청"
        secondary="안내 반복"
        layout="dual"
        onPrimary={() => setMessage('완료 요청 콜백 예제 · 실제 판정을 수행하지 않습니다.')}
        onSecondary={() => setMessage('안내 반복 콜백 예제 · 실제 음성을 재생하지 않습니다.')}
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[16],
    paddingBottom: spacing[12],
    gap: spacing[8],
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[20], rowGap: spacing[8] },
  cell: { width: '47%', flexGrow: 1 },
});
