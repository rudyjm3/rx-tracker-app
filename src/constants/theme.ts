/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// RxTracker brand tokens — single source of truth for the palette, ported
// from the reference PHP app's assets/css/rxtracker-brand-tokens.css.
export const Brand = {
  cyan: '#14CFE0',
  blue: '#0A8AC8',
  deepBlue: '#0754A8',
  navy: '#102B57',
  darkNavy: '#071D3D',
  bg: '#EAF4FF',
  card: '#FFFFFF',
  border: '#D7E6F8',
  text: '#172033',
  textMuted: '#60708A',
  success: '#18BFA6',
  warning: '#F5A524',
  danger: '#E5484D',
  gradient: ['#14CFE0', '#0A8AC8', '#0754A8'] as const,
  gradientDark: ['#102B57', '#0754A8', '#14CFE0'] as const,
  gradientHero: ['#071D3D', '#0754A8', '#0A8AC8', '#14CFE0'] as const,
} as const;

export const BorderRadius = {
  sm: 10,
  md: 18,
  lg: 28,
} as const;

export const Colors = {
  light: {
    text: Brand.text,
    background: Brand.bg,
    backgroundElement: Brand.card,
    backgroundSelected: Brand.border,
    textSecondary: Brand.textMuted,
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
