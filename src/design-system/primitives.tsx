import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AlertSvg from './assets/icons/alert.svg';
import ApprovalSvg from './assets/icons/approval.svg';
import ArrowSvg from './assets/icons/arrow.svg';
import BackSvg from './assets/icons/back.svg';
import BoltSvg from './assets/icons/bolt.svg';
import CheckSvg from './assets/icons/check.svg';
import ClockSvg from './assets/icons/clock.svg';
import DeviceSvg from './assets/icons/device.svg';
import EditSvg from './assets/icons/edit.svg';
import EnvironmentSvg from './assets/icons/environment.svg';
import FlaskSvg from './assets/icons/flask.svg';
import GuidanceSvg from './assets/icons/guidance.svg';
import HistorySvg from './assets/icons/history.svg';
import HomeSvg from './assets/icons/home.svg';
import LightSvg from './assets/icons/light.svg';
import LockSvg from './assets/icons/lock.svg';
import MicSvg from './assets/icons/mic.svg';
import MoreSvg from './assets/icons/more.svg';
import PauseSvg from './assets/icons/pause.svg';
import PersonSvg from './assets/icons/person.svg';
import PlaySvg from './assets/icons/play.svg';
import PowerSvg from './assets/icons/power.svg';
import ResultSvg from './assets/icons/result.svg';
import RetrySvg from './assets/icons/retry.svg';
import { colors, spacing, typography, type TypographyVariant } from './tokens';

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const iconAssets = {
  alert: AlertSvg,
  approval: ApprovalSvg,
  arrow: ArrowSvg,
  back: BackSvg,
  bolt: BoltSvg,
  check: CheckSvg,
  clock: ClockSvg,
  device: DeviceSvg,
  edit: EditSvg,
  environment: EnvironmentSvg,
  flask: FlaskSvg,
  guidance: GuidanceSvg,
  history: HistorySvg,
  home: HomeSvg,
  light: LightSvg,
  lock: LockSvg,
  mic: MicSvg,
  more: MoreSvg,
  pause: PauseSvg,
  person: PersonSvg,
  play: PlaySvg,
  power: PowerSvg,
  result: ResultSvg,
  retry: RetrySvg,
} as const;

export const iconNames = Object.keys(iconAssets) as (keyof typeof iconAssets)[];
export type IconName = keyof typeof iconAssets;

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
};

export function AppText({
  variant = 'body',
  color = colors.text.primary,
  style,
  ...props
}: AppTextProps) {
  return <Text {...props} style={[styles.text, typography[variant], { color }, style]} />;
}

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

/** Keep the source SVG's 20×20 dimensions; scale its wrapper for smaller slots. */
export function Icon({ name, size = 20, color = colors.text.action }: IconProps) {
  const Asset = iconAssets[name];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.iconSlot, { width: size, height: size }]}
    >
      <View style={{ width: 20, height: 20, transform: [{ scale: size / 20 }] }}>
        <Asset color={color} style={{}} />
      </View>
    </View>
  );
}

export type SymbolProps = { width?: number };

/** Figma 2081:83 is a decorative 181×143 frame with a 132×132 image at (25, 6). */
export function Symbol({ width = 181 }: SymbolProps) {
  const scale = width / 181;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: 143 * scale }}
    >
      <Image
        source={require('./assets/symbol.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: 25 * scale,
          top: 6 * scale,
          width: 132 * scale,
          height: 132 * scale,
        }}
      />
    </View>
  );
}

export type BrandLogoProps = { width?: number };

export function BrandLogo({ width = 32 }: BrandLogoProps) {
  return (
    <Image
      accessible={false}
      importantForAccessibility="no"
      source={require('./assets/brand-logo.png')}
      resizeMode="contain"
      style={{ width, height: width }}
    />
  );
}

export type ScreenProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
};

export function Screen({ children, style, scroll = false, contentContainerStyle }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentContainerStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active) setReducedMotion(value);
      },
      () => {
        if (active) setReducedMotion(true);
      },
    );
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return reducedMotion;
}

const styles = StyleSheet.create({
  text: { includeFontPadding: false },
  iconSlot: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { flexGrow: 1, padding: spacing[24], gap: spacing[16] },
});
