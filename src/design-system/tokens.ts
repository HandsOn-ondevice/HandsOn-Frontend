import type { TextStyle, ViewStyle } from 'react-native';

/** Source: Figma HandsOn / Primitives, Semantic and Dimensions (2026-10-26). */
export const palette = {
  white: '#FFFFFF',
  navy900: '#132E52',
  navy700: '#193D72',
  navy500: '#566E8C',
  blue50: '#F1F5FD',
  blue100: '#EAF1FF',
  blue200: '#DCE8FA',
  blue300: '#B8D4FB',
  blue600: '#2265F5',
  blue700: '#1C53C8',
  auroraStart: '#2D55F3',
  auroraMid: '#238EEB',
  auroraEnd: '#37BDDD',
  cyan100: '#E1F7FB',
  green100: '#E1F3EB',
  green700: '#137657',
  amber100: '#FFF1D6',
  amber700: '#925300',
  red100: '#FCE8EC',
  red700: '#B02D43',
  disabled: '#DCE3EF',
  scrim: '#0F2340',
  auroraContrastStart: '#203FA2',
  auroraContrastMid: '#1A5E9E',
  auroraContrastEnd: '#257896',
} as const;

/** Semantic colors preserve the Figma primitive aliases. */
export const colors = {
  surface: {
    canvas: palette.blue50,
    card: palette.white,
    subtle: palette.blue100,
    inverse: palette.navy700,
  },
  text: {
    primary: palette.navy900,
    secondary: palette.navy500,
    inverse: palette.white,
    action: palette.blue700,
  },
  border: {
    default: palette.blue200,
    selected: palette.blue600,
  },
  action: {
    primary: palette.blue700,
    disabled: palette.disabled,
  },
  status: {
    success: palette.green700,
    successBg: palette.green100,
    warning: palette.amber700,
    warningBg: palette.amber100,
    danger: palette.red700,
    dangerBg: palette.red100,
    info: palette.blue700,
    infoBg: palette.blue100,
  },
  overlay: {
    scrim: palette.scrim,
  },
  gradient: {
    start: palette.auroraStart,
    mid: palette.auroraMid,
    end: palette.auroraEnd,
    contrastStart: palette.auroraContrastStart,
    contrastMid: palette.auroraContrastMid,
    contrastEnd: palette.auroraContrastEnd,
  },
} as const;

export const spacing = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  36: 36,
  40: 40,
  48: 48,
  56: 56,
  64: 64,
} as const;

export const radii = {
  0: 0,
  8: 8,
  12: 12,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  28: 28,
  30: 30,
  36: 36,
  999: 999,
} as const;

export const borders = {
  1: 1,
  1.5: 1.5,
  2: 2,
} as const;

export const typography = {
  display: { fontFamily: 'NotoSansKR-Bold', fontSize: 28, lineHeight: 38 },
  heading: { fontFamily: 'NotoSansKR-Bold', fontSize: 24, lineHeight: 34 },
  title: { fontFamily: 'NotoSansKR-Bold', fontSize: 18, lineHeight: 26 },
  body: { fontFamily: 'NotoSansKR-Regular', fontSize: 13, lineHeight: 20 },
  label: { fontFamily: 'NotoSansKR-Medium', fontSize: 13, lineHeight: 20 },
  caption: { fontFamily: 'NotoSansKR-Regular', fontSize: 11, lineHeight: 16 },
  // Android substitution approved by the user; original Figma style is SF Pro.
  measurement: { fontFamily: 'NotoSansKR-SemiBold', fontSize: 27, lineHeight: 34 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const gradients = {
  aurora: [colors.gradient.start, colors.gradient.mid, colors.gradient.end],
  quiet: [colors.surface.subtle, palette.cyan100],
  contrast: [
    colors.gradient.contrastStart,
    colors.gradient.contrastMid,
    colors.gradient.contrastEnd,
  ],
} as const;

export const gradientGeometry = {
  // Inverse of the Figma gradient transform, evaluated at (0, .5) and (1, .5).
  aurora: {
    start: { x: 0.002439, y: 0.178049 },
    end: { x: 0.831707, y: 0.714634 },
    locations: [0, 0.5, 1] as const,
  },
  quiet: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
} as const;

export const shadows = {
  card: { boxShadow: '0px 4px 16px rgba(33, 69, 125, 0.045)' },
  floating: { boxShadow: '0px 10px 24px rgba(33, 69, 125, 0.14)' },
  button: { boxShadow: '0px 6px 14px rgba(33, 69, 125, 0.15)' },
} satisfies Record<string, ViewStyle>;

export const motion = {
  move: { mass: 1, stiffness: 400, damping: 40 },
  sheet: { mass: 1, stiffness: 600, damping: 39 },
  moveResponse: 400,
  sheetResponse: 300,
  reducedCrossfade: 100,
} as const;

export const theme = {
  palette,
  colors,
  spacing,
  radii,
  borders,
  typography,
  gradients,
  shadows,
  motion,
} as const;
export type ThemeTokens = typeof theme;
