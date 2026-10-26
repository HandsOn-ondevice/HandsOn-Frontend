import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { AppText, Icon, useReducedMotion, type IconName } from '../primitives';
import { colors, gradientGeometry, gradients, radii, spacing, typography } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonPreviewState = 'default' | 'pressed' | 'focus' | 'disabled' | 'loading';

export interface ButtonProps extends Omit<
  PressableProps,
  'children' | 'style' | 'onPress' | 'disabled'
> {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Development catalogue only. Real input feedback comes from Pressable. */
  previewState?: ButtonPreviewState;
}

/** Figma 2081:140 — hierarchy and input state remain separate. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  style,
  previewState,
  accessibilityLabel,
  onFocus,
  onBlur,
  ...props
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || previewState === 'disabled';
  const isLoading = loading || previewState === 'loading';
  const blocked = isDisabled || isLoading;
  const foreground = isDisabled
    ? colors.text.secondary
    : variant === 'primary' || variant === 'danger'
      ? colors.text.inverse
      : colors.text.action;
  const background = isDisabled
    ? colors.action.disabled
    : variant === 'primary'
      ? colors.action.primary
      : variant === 'secondary'
        ? colors.surface.subtle
        : variant === 'danger'
          ? colors.status.danger
          : 'transparent';

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: isLoading }}
      disabled={blocked}
      onPress={() => {
        if (!blocked) onPress?.();
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.buttonRoot, style]}
    >
      {({ pressed }) => {
        const isFocused = focused || previewState === 'focus';
        const plate = (
          <View
            style={[
              styles.buttonPlate,
              { backgroundColor: background },
              (pressed || previewState === 'pressed') && !blocked && styles.pressed,
            ]}
          >
            {isLoading ? (
              <Icon name="retry" size={18} color={foreground} />
            ) : icon ? (
              <Icon name={icon} size={18} color={foreground} />
            ) : null}
            <AppText variant="label" color={foreground} style={styles.buttonLabel}>
              {label}
            </AppText>
          </View>
        );
        return (
          <>
            {variant === 'primary' && !isDisabled ? (
              <LinearGradient
                colors={gradients.aurora}
                {...gradientGeometry.aurora}
                style={styles.buttonFrame}
              >
                {plate}
              </LinearGradient>
            ) : (
              <View style={[styles.buttonFrame, { backgroundColor: background }]}>{plate}</View>
            )}
            {isFocused && !isDisabled ? (
              <View pointerEvents="none" style={styles.focusRing} />
            ) : null}
          </>
        );
      }}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<
  PressableProps,
  'children' | 'style' | 'onPress' | 'disabled'
> {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  tone?: 'light' | 'inverse';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  previewState?: Exclude<ButtonPreviewState, 'loading'>;
}

/** Figma 2081:257. The icon's visual size is 20dp; its touch region is 48dp. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tone = 'light',
  disabled = false,
  style,
  previewState,
  onFocus,
  onBlur,
  ...props
}: IconButtonProps) {
  const [focused, setFocused] = useState(false);
  const blocked = disabled || previewState === 'disabled';
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={() => {
        if (!blocked) onPress?.();
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor:
            tone === 'light' && (pressed || previewState === 'pressed')
              ? colors.surface.subtle
              : colors.surface.card,
        },
        (focused || previewState === 'focus') && styles.iconFocus,
        blocked && styles.disabled,
        style,
      ]}
    >
      <Icon name={icon} color={colors.text.action} />
    </Pressable>
  );
}

export type TextFieldPreviewState = 'default' | 'focus' | 'filled' | 'error' | 'disabled';
export interface TextFieldProps extends Omit<
  TextInputProps,
  'value' | 'onChange' | 'onChangeText' | 'style' | 'editable'
> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  support?: string;
  error?: boolean;
  disabled?: boolean;
  /** Use Gorhom's focus integration when rendered inside BottomSheet. */
  withinSheet?: boolean;
  style?: StyleProp<ViewStyle>;
  previewState?: TextFieldPreviewState;
}

/** Figma 2081:292. Value and edits are owned by the caller. */
export function TextField({
  label,
  value,
  onChange,
  support,
  error = false,
  disabled = false,
  multiline = false,
  withinSheet = false,
  style,
  previewState,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const blocked = disabled || previewState === 'disabled';
  const invalid = error || previewState === 'error';
  const isFocused = !blocked && (focused || previewState === 'focus');
  const InputComponent = withinSheet ? BottomSheetTextInput : TextInput;
  return (
    <View style={[styles.fieldRoot, style]}>
      <AppText variant="caption" color={colors.text.secondary}>
        {label}
      </AppText>
      <InputComponent
        {...props}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={invalid ? support : props.accessibilityHint}
        accessibilityState={{ disabled: blocked }}
        editable={!blocked}
        value={value}
        onChangeText={(next) => {
          if (!blocked) onChange(next);
        }}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.text.secondary}
        selectionColor={colors.border.selected}
        underlineColorAndroid="transparent"
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          blocked && styles.fieldDisabled,
          isFocused && styles.fieldFocused,
          invalid && styles.fieldError,
        ]}
      />
      {support ? (
        <AppText
          variant="caption"
          color={invalid ? colors.status.danger : colors.text.secondary}
          accessibilityLiveRegion={invalid ? 'polite' : 'none'}
        >
          {support}
        </AppText>
      ) : null}
    </View>
  );
}

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}
export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  previewState?: 'default' | 'focus' | 'disabled';
  testID?: string;
}

/** Figma 2081:336. The native modal gives the field an actual selection flow. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = '선택해 주세요',
  style,
  previewState,
  testID,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const blocked = disabled || previewState === 'disabled';
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;
  return (
    <View style={[styles.fieldRoot, style]}>
      <AppText variant="caption" color={colors.text.secondary}>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityHint="선택 항목을 엽니다"
        accessibilityState={{ disabled: blocked, expanded: open }}
        disabled={blocked}
        onPress={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.selectField,
          blocked && styles.fieldDisabled,
          !blocked && (focused || open || previewState === 'focus') && styles.fieldFocused,
        ]}
      >
        <AppText style={styles.flexText}>{selectedLabel}</AppText>
        <Icon name="arrow" size={18} />
      </Pressable>
      <Modal
        visible={open && !blocked}
        transparent
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.selectOverlay}>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.selectDialog} accessibilityViewIsModal>
            <AppText variant="title" accessibilityRole="header">
              {label}
            </AppText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.selectOptions}
            >
              {options.length === 0 ? (
                <AppText color={colors.text.secondary}>선택할 항목이 없습니다.</AppText>
              ) : null}
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{
                    checked: option.value === value,
                    disabled: !!option.disabled,
                  }}
                  disabled={option.disabled}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.selectOption,
                    option.value === value && styles.selectedOption,
                    pressed && styles.pressed,
                    option.disabled && styles.disabled,
                  ]}
                >
                  <AppText style={styles.flexText}>{option.label}</AppText>
                  {option.value === value ? <Icon name="check" /> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Button label="닫기" variant="tertiary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export type CheckboxState = 'pending' | 'checked' | 'current' | 'issue' | 'disabled';
export interface CheckboxRowProps {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  state?: CheckboxState;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Figma 2081:360. Confirmation is a controlled user input, never sensor inference. */
export function CheckboxRow({
  title,
  subtitle,
  checked,
  onChange,
  state,
  disabled = false,
  style,
  testID,
}: CheckboxRowProps) {
  const blocked = disabled || state === 'disabled';
  const visualState = blocked ? 'disabled' : (state ?? (checked ? 'checked' : 'pending'));
  const current = visualState === 'current';
  const issue = visualState === 'issue';
  const confirmed = visualState === 'checked';
  const foreground = confirmed
    ? colors.status.success
    : current
      ? colors.status.warning
      : issue
        ? colors.status.danger
        : colors.text.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked, disabled: blocked }}
      disabled={blocked}
      onPress={() => {
        if (!blocked) onChange(!checked);
      }}
      style={({ pressed }) => [
        styles.checkboxRow,
        {
          backgroundColor: confirmed
            ? colors.status.successBg
            : current
              ? colors.status.warningBg
              : colors.surface.card,
        },
        pressed && styles.pressed,
        blocked && styles.disabled,
        style,
      ]}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: confirmed
              ? colors.status.success
              : current || issue
                ? foreground
                : colors.border.default,
            backgroundColor: confirmed ? colors.status.success : colors.surface.card,
          },
        ]}
      >
        {confirmed || checked ? (
          <Icon name="check" size={18} color={confirmed ? colors.text.inverse : foreground} />
        ) : current || issue ? (
          <Icon name="alert" size={18} color={foreground} />
        ) : null}
      </View>
      <View style={styles.checkboxCopy}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.text.secondary}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export interface SegmentOption {
  label: string;
  value: string;
  disabled?: boolean;
}
export interface SegmentedControlProps {
  options: readonly SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Figma 2081:394. Each 40dp visual segment has an additional 4dp vertical hit area. */
export function SegmentedControl({
  options,
  value,
  onChange,
  disabled = false,
  style,
}: SegmentedControlProps) {
  return (
    <View style={[styles.segmentedControl, style]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        const blocked = disabled || !!option.disabled;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled: blocked }}
            disabled={blocked}
            hitSlop={{ top: spacing[4], bottom: spacing[4] }}
            onPress={() => {
              if (!blocked) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.selectedSegment,
              pressed && styles.pressed,
              blocked && styles.disabled,
            ]}
          >
            <AppText
              variant="caption"
              color={selected ? colors.text.action : colors.text.secondary}
              style={styles.segmentLabel}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonRoot: { minHeight: 54, borderRadius: radii[18] },
  buttonFrame: { minHeight: 54, padding: spacing[4], borderRadius: radii[18] },
  buttonPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
    minHeight: 46,
    borderRadius: radii[16],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[12],
  },
  buttonLabel: { flexShrink: 1, textAlign: 'center' },
  focusRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radii[18],
    borderWidth: 2,
    borderColor: colors.border.selected,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radii[999],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconFocus: { borderColor: colors.border.selected },
  fieldRoot: { gap: spacing[6], alignSelf: 'stretch' },
  textInput: {
    ...typography.body,
    color: colors.text.primary,
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[12],
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii[12],
    backgroundColor: colors.surface.card,
    includeFontPadding: false,
  },
  multilineInput: { minHeight: 144 },
  fieldDisabled: { backgroundColor: colors.surface.subtle },
  fieldError: { borderColor: colors.status.danger },
  fieldFocused: { borderWidth: 2, borderColor: colors.border.selected },
  flexText: { flex: 1, flexShrink: 1 },
  selectField: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    borderRadius: radii[12],
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[12],
    backgroundColor: colors.surface.card,
  },
  selectOverlay: {
    flex: 1,
    backgroundColor: `${colors.overlay.scrim}99`,
    justifyContent: 'center',
    padding: spacing[24],
  },
  selectDialog: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[24],
    padding: spacing[24],
    gap: spacing[16],
    maxHeight: '80%',
  },
  selectOptions: { gap: spacing[4] },
  selectOption: {
    minHeight: 48,
    padding: spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    borderRadius: radii[12],
  },
  selectedOption: { backgroundColor: colors.surface.subtle },
  checkboxRow: {
    minHeight: 68,
    padding: spacing[12],
    gap: spacing[12],
    borderRadius: radii[16],
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii[8],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCopy: { flex: 1, gap: spacing[2] },
  segmentedControl: {
    minHeight: 48,
    flexDirection: 'row',
    gap: spacing[4],
    padding: spacing[4],
    backgroundColor: colors.surface.subtle,
    borderRadius: radii[16],
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    padding: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii[12],
  },
  selectedSegment: { backgroundColor: colors.surface.card },
  segmentLabel: { textAlign: 'center', flexShrink: 1 },
});
