import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReduceMotion } from 'react-native-reanimated';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

import { AppText, BrandLogo, Icon, useReducedMotion, type IconName } from '../primitives';
import { colors, gradientGeometry, gradients, motion, radii, shadows, spacing } from '../tokens';
import { Button, IconButton } from './controls';

export interface AppBarProps {
  title?: string;
  mode?: 'brand' | 'back';
  tone?: 'light' | 'inverse';
  onBack?: () => void;
  onMore?: () => void;
  onProfile?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:431. Navigation is supplied by the caller, not this component. */
export function AppBar({
  title = 'HandsOn',
  mode = 'brand',
  tone = 'light',
  onBack,
  onMore,
  onProfile,
  style,
}: AppBarProps) {
  const inverse = tone === 'inverse';
  const foreground = inverse ? colors.text.inverse : colors.text.primary;
  return (
    <View style={[styles.appBar, inverse && styles.inverseSurface, style]}>
      {mode === 'brand' ? (
        <>
          <View style={styles.brand}>
            <BrandLogo />
            <AppText variant="title" color={foreground} style={styles.flexText}>
              {title}
            </AppText>
          </View>
          <IconButton icon="person" accessibilityLabel="프로필" onPress={onProfile} tone={tone} />
        </>
      ) : (
        <>
          <IconButton icon="back" accessibilityLabel="뒤로가기" onPress={onBack} tone={tone} />
          <AppText variant="label" color={foreground} style={styles.appBarTitle}>
            {title}
          </AppText>
          <IconButton icon="more" accessibilityLabel="더 보기" onPress={onMore} tone={tone} />
        </>
      )}
    </View>
  );
}

export type NavigationItem = 'home' | 'work' | 'device' | 'history';
export interface BottomNavigationProps {
  role?: 'student' | 'expert';
  active: NavigationItem;
  onChange: (item: NavigationItem) => void;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:496. Role changes labels, while active remains a controlled value. */
export function BottomNavigation({
  role = 'student',
  active,
  onChange,
  style,
}: BottomNavigationProps) {
  const items: { value: NavigationItem; label: string; icon: IconName }[] = [
    { value: 'home', label: '홈', icon: 'home' },
    { value: 'work', label: role === 'student' ? '실험' : '절차', icon: 'flask' },
    { value: 'device', label: role === 'student' ? '장치' : '현황', icon: 'device' },
    {
      value: 'history',
      label: role === 'student' ? '이력' : '내 정보',
      icon: role === 'student' ? 'history' : 'person',
    },
  ];
  return (
    <View style={[styles.navigation, style]}>
      {items.map((item) => (
        <NavigationButton
          key={item.value}
          {...item}
          active={active === item.value}
          onPress={() => onChange(item.value)}
        />
      ))}
    </View>
  );
}

function NavigationButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <ButtonSlot
      label={label}
      selected={active}
      onPress={onPress}
      style={[styles.navigationItem, active && styles.navigationSelected]}
    >
      <Icon name={icon} size={20} color={active ? colors.text.action : colors.text.inverse} />
      <AppText
        variant="caption"
        color={active ? colors.text.action : colors.text.inverse}
        style={styles.navigationLabel}
      >
        {label}
      </AppText>
    </ButtonSlot>
  );
}

// A native press target keeps the visual navigation independent from the router.
function ButtonSlot({
  label,
  selected,
  onPress,
  style,
  children,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:679. Link hit area extends beyond the 28dp visual heading. */
export function SectionHeader({ title, action, onAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <AppText variant="label" style={styles.flexText}>
        {title}
      </AppText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          hitSlop={{ top: spacing[10], bottom: spacing[10], left: spacing[8], right: spacing[8] }}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
        >
          <AppText variant="caption" color={colors.text.action}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface SurfaceCardProps {
  title?: string;
  subtitle?: string;
  tone?: 'paper' | 'subtle' | 'inverse';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:686. */
export function SurfaceCard({
  title,
  subtitle,
  tone = 'paper',
  children,
  style,
}: SurfaceCardProps) {
  const inverse = tone === 'inverse';
  return (
    <View
      style={[
        styles.surfaceCard,
        {
          backgroundColor: inverse
            ? colors.surface.inverse
            : tone === 'subtle'
              ? colors.surface.subtle
              : colors.surface.card,
        },
        style,
      ]}
    >
      {title ? (
        <AppText variant="label" color={inverse ? colors.text.inverse : colors.text.primary}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText color={inverse ? colors.text.inverse : colors.text.secondary}>{subtitle}</AppText>
      ) : null}
      {children}
    </View>
  );
}

export type ActionShelfLayout = 'single' | 'dual' | 'disabled' | 'dualDisabled';
export interface ActionShelfProps {
  primary: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  layout?: ActionShelfLayout;
  disabled?: boolean;
  loading?: boolean;
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:696. All layouts reuse Button instead of making look-alike targets. */
export function ActionShelf({
  primary,
  secondary,
  onPrimary,
  onSecondary,
  layout,
  disabled = false,
  loading = false,
  safeArea = false,
  style,
}: ActionShelfProps) {
  const insets = useSafeAreaInsets();
  const resolvedLayout = layout ?? (secondary ? 'dual' : 'single');
  const dual = resolvedLayout === 'dual' || resolvedLayout === 'dualDisabled';
  const primaryDisabled =
    disabled || resolvedLayout === 'disabled' || resolvedLayout === 'dualDisabled';
  return (
    <View
      style={[
        styles.actionShelf,
        safeArea && { paddingBottom: spacing[18] + insets.bottom },
        style,
      ]}
    >
      {dual ? (
        <Button
          label={secondary ?? '안내 다시 듣기'}
          onPress={onSecondary}
          variant="secondary"
          style={styles.secondaryAction}
        />
      ) : null}
      <Button
        label={primary}
        onPress={onPrimary}
        disabled={primaryDisabled}
        loading={loading}
        style={dual ? styles.primaryDualAction : styles.singleAction}
      />
    </View>
  );
}

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tone?: 'info' | 'warning' | 'success';
  icon?: IconName;
  children?: ReactNode;
}

/** Figma 2081:708. Requires BottomSheetModalProvider under GestureHandlerRootView. */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  tone = 'info',
  icon = 'mic',
  children,
}: BottomSheetProps) {
  const modal = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const animationConfigs = useBottomSheetSpringConfigs(motion.sheet);
  const foreground =
    tone === 'success'
      ? colors.status.success
      : tone === 'warning'
        ? colors.status.warning
        : colors.status.info;
  const background =
    tone === 'success'
      ? colors.status.successBg
      : tone === 'warning'
        ? colors.status.warningBg
        : colors.status.infoBg;

  const handleDismiss = useCallback(() => {
    presented.current = false;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const controller = modal.current;
    if (!controller) return;
    if (open && !presented.current) {
      presented.current = true;
      controller.present();
    } else if (!open && presented.current) {
      presented.current = false;
      controller.dismiss();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      modal.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        style={[props.style, styles.sheetBackdrop]}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.45}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={modal}
      onDismiss={handleDismiss}
      enablePanDownToClose
      enableDynamicSizing
      backdropComponent={backdrop}
      animationConfigs={animationConfigs}
      overrideReduceMotion={reducedMotion ? ReduceMotion.Always : ReduceMotion.System}
      keyboardBehavior={Platform.OS === 'android' ? 'fillParent' : 'interactive'}
      topInset={insets.top}
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
      accessibilityLabel={title}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.sheetContent,
          { paddingBottom: spacing[24] + insets.bottom },
        ]}
      >
        <View style={styles.sheetTop}>
          <View style={[styles.sheetIcon, { backgroundColor: background }]}>
            <Icon name={icon} color={foreground} />
          </View>
          <Button
            label="닫기"
            variant="tertiary"
            accessibilityLabel="하단 시트 닫기"
            style={styles.sheetClose}
            onPress={() => modal.current?.dismiss()}
          />
        </View>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText color={colors.text.secondary}>{subtitle}</AppText> : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export interface HeroPanelProps {
  title: string;
  subtitle?: string;
  tone?: 'aurora' | 'quiet';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:1257. Contrast Aurora is used behind white text. */
export function HeroPanel({ title, subtitle, tone = 'aurora', children, style }: HeroPanelProps) {
  const inverse = tone === 'aurora';
  return (
    <LinearGradient
      colors={inverse ? gradients.contrast : gradients.quiet}
      {...(inverse ? gradientGeometry.aurora : gradientGeometry.quiet)}
      style={[styles.heroPanel, style]}
    >
      <AppText variant="heading" color={inverse ? colors.text.inverse : colors.text.primary}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color={inverse ? colors.text.inverse : colors.text.secondary}>
          {subtitle}
        </AppText>
      ) : null}
      {children}
    </LinearGradient>
  );
}

export interface StatusBarProps {
  tone?: 'light' | 'inverse';
  hidden?: boolean;
}

/** Figma 2081:1264 maps to the real OS bar; clocks and device indicators are not drawn. */
export function StatusBar({ tone = 'light', hidden = false }: StatusBarProps) {
  const reducedMotion = useReducedMotion();
  return (
    <ExpoStatusBar
      style={tone === 'inverse' ? 'light' : 'dark'}
      hidden={hidden}
      animated={!reducedMotion}
    />
  );
}

const styles = StyleSheet.create({
  appBar: {
    minHeight: 60,
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  inverseSurface: { backgroundColor: colors.surface.inverse },
  brand: { flexDirection: 'row', flex: 1, alignItems: 'center', gap: spacing[10], minHeight: 48 },
  flexText: { flex: 1, flexShrink: 1 },
  appBarTitle: { flex: 1, textAlign: 'center' },
  navigation: {
    backgroundColor: colors.surface.inverse,
    padding: spacing[6],
    gap: spacing[4],
    flexDirection: 'row',
    minHeight: 64,
    borderRadius: radii[24],
  },
  navigationItem: {
    flex: 1,
    minHeight: 52,
    minWidth: 0,
    padding: spacing[4],
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii[16],
  },
  navigationSelected: { backgroundColor: colors.surface.card },
  navigationLabel: { textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.8 },
  sectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    justifyContent: 'space-between',
  },
  sectionAction: { minHeight: 28, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' },
  surfaceCard: { padding: spacing[16], gap: spacing[8], borderRadius: radii[20], ...shadows.card },
  actionShelf: {
    paddingTop: spacing[14],
    paddingBottom: spacing[18],
    paddingHorizontal: spacing[24],
    gap: spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.card,
  },
  secondaryAction: { flex: 160, minWidth: 0 },
  primaryDualAction: { flex: 192, minWidth: 0 },
  singleAction: { flex: 1 },
  sheetBackground: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii[28],
    borderTopRightRadius: radii[28],
    ...shadows.floating,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.border.default },
  sheetContent: { paddingHorizontal: spacing[24], paddingTop: spacing[12], gap: spacing[12] },
  sheetTop: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sheetClose: { position: 'absolute', right: 0, top: 0 },
  sheetBackdrop: { backgroundColor: colors.overlay.scrim },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: radii[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPanel: {
    padding: spacing[20],
    gap: spacing[8],
    borderRadius: radii[24],
    overflow: 'hidden',
    ...shadows.card,
  },
});
