/**
 * Palette values that can't be expressed as NativeWind classes: icon and
 * tab-bar colors, SVG fills and gradient stops. Everything else is styled
 * with `className` (tokens live in tailwind.config.js and mirror this file).
 */

import '@/global.css';

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

// Gradient stops, DESIGN.md 2.3 / 17.1. Used through <GradientFill />.
export const Gradient = {
  brand: ['#14CFE0', '#0A8AC8', '#0754A8'],
  brandDark: ['#102B57', '#0754A8', '#14CFE0'],
  hero: ['#18D0DC', '#0A8AC8', '#0754A8', '#071D3D'],
  auth: ['#071D3D', '#0754A8', '#0A8AC8', '#14CFE0'],
} as const;

export const Colors = {
  light: {
    text: Brand.text,
    background: Brand.bg,
    backgroundElement: Brand.card,
    backgroundSelected: Brand.border,
    textSecondary: Brand.textMuted,
    border: Brand.border,
    // rx-deep-blue reads at ~5.4:1 against the light background/card
    // surfaces below; against dark mode's near-black background it drops
    // to ~2.8:1, so dark mode gets rx-cyan instead (same brand family,
    // ~11:1 on black).
    accent: Brand.deepBlue,
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    // Distinct from backgroundSelected — a hairline/input border needs to
    // read against both the pure-black screen background and the
    // backgroundElement card surface, not just double as a selected-state
    // fill.
    border: '#3A3E44',
    accent: Brand.cyan,
  },
} as const;
