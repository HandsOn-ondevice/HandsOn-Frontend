import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBar,
  AppText,
  BottomSheet,
  Button,
  StatusBar,
  colors,
  gradients,
  radii,
  spacing,
} from '@/design-system';

interface ProcedureFrameProps {
  headerTitle: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
  navigationDisabled?: boolean;
  help?: { title: string; subtitle: string };
  heroAccessory?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}

export function ProcedureFrame({
  headerTitle,
  title,
  subtitle,
  onBack,
  navigationDisabled,
  help = {
    title: '승인 절차 안내',
    subtitle:
      '선택한 작업 환경에서 승인된 절차만 준비할 수 있어요. 준비를 시작한 승인 버전은 자동으로 최신화하지 않습니다.',
  },
  heroAccessory,
  children,
  footer,
}: ProcedureFrameProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <View style={styles.screen}>
      <StatusBar tone="inverse" />
      <LinearGradient
        colors={gradients.contrast}
        start={{ x: 0, y: 0.435 }}
        end={{ x: 1, y: 0.565 }}
        locations={[0.0714, 0.4286, 0.7857]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppBar
          mode="back"
          tone="inverse"
          title={headerTitle}
          onBack={onBack}
          onMore={() => setShowHelp(true)}
          navigationDisabled={navigationDisabled}
          style={styles.appBar}
        />
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <AppText variant="heading" color={colors.text.inverse} accessibilityRole="header">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="caption" color={colors.text.inverse}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {heroAccessory}
        </View>
      </SafeAreaView>
      <ScrollView
        style={styles.viewport}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
      <BottomSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        title={help.title}
        subtitle={help.subtitle}
        icon="approval"
      >
        <Button label="닫기" variant="secondary" onPress={() => setShowHelp(false)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  appBar: { backgroundColor: 'transparent' },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[24],
    paddingTop: spacing[12],
    paddingBottom: spacing[24],
    gap: spacing[6],
  },
  heroCopy: { flex: 1, gap: spacing[6] },
  viewport: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    borderTopLeftRadius: radii[30],
    borderTopRightRadius: radii[30],
  },
  content: { padding: spacing[24], gap: spacing[12], flexGrow: 1 },
  footer: { backgroundColor: colors.surface.card },
});
