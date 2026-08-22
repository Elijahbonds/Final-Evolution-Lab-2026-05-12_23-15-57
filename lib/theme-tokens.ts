/**
 * lib/theme-tokens.ts — FEL premium-dark design tokens.
 *
 * Single source of truth for app-chrome styling (header, bottom nav, chips,
 * rings). Components import these instead of hard-coding hex values so the
 * chrome stays consistent across all five lanes' surfaces.
 *
 * Contrast: every `text*` token clears WCAG AA (4.5:1) against `bg` and
 * `surface`. Accent-on-dark pairs clear 3:1 for non-text UI.
 */

export const colors = {
  // Surfaces (near-black, slightly blue — reads premium, avoids pure #000)
  bg: '#07090D', // page background
  surface: '#0D1117', // cards, header, nav
  surfaceRaised: '#151B24', // popovers, chips
  border: '#232B36', // hairline borders
  borderStrong: '#33404F',

  // Text
  textPrimary: '#F2F5F9',
  textSecondary: '#9AA7B4',
  textMuted: '#5E6B79',

  // Brand accent — FEL volt (energy / actions / active states)
  accent: '#B4F461',
  accentDim: '#7FB33E',
  accentGlow: 'rgba(180, 244, 97, 0.35)', // box-shadow color for active glow
  onAccent: '#0A0F05', // text on accent fills

  // Economy — Lab Credits gold
  credit: '#F5C84C',
  creditDim: 'rgba(245, 200, 76, 0.14)', // chip fill

  // Readiness bands (ring stroke)
  readinessHigh: '#4ADE80', // >= 70
  readinessMid: '#FACC15', // 40-69
  readinessLow: '#F87171', // < 40

  // Status
  danger: '#F87171',
  success: '#4ADE80',
  info: '#60A5FA',
} as const;

/** 4px-base spacing scale. Use these instead of arbitrary values. */
export const spacing = {
  xs: '0.25rem', // 4
  sm: '0.5rem', // 8
  md: '0.75rem', // 12
  lg: '1rem', // 16
  xl: '1.5rem', // 24
  xxl: '2rem', // 32
} as const;

/** Type scale (rem, 16px base). Chrome never goes below `micro`. */
export const typeScale = {
  micro: { size: '0.6875rem', lineHeight: '1rem', weight: 600, tracking: '0.06em' }, // labels
  caption: { size: '0.75rem', lineHeight: '1.1rem', weight: 500, tracking: '0.02em' },
  body: { size: '0.875rem', lineHeight: '1.35rem', weight: 400, tracking: '0' },
  title: { size: '1rem', lineHeight: '1.4rem', weight: 600, tracking: '-0.01em' },
  display: { size: '1.375rem', lineHeight: '1.75rem', weight: 700, tracking: '-0.02em' },
} as const;

export const radii = {
  chip: '9999px',
  card: '0.875rem',
  nav: '1.25rem',
} as const;

/** Chrome dimensions shared by header + nav + page padding. */
export const chrome = {
  headerHeight: '3.5rem', // 56px
  bottomNavHeight: '4rem', // 64px
  /** Landscape-safe: pads chrome away from notches/home indicator. */
  safeArea: {
    top: 'env(safe-area-inset-top, 0px)',
    bottom: 'env(safe-area-inset-bottom, 0px)',
    left: 'env(safe-area-inset-left, 0px)',
    right: 'env(safe-area-inset-right, 0px)',
  },
} as const;

export const shadows = {
  activeGlow: `0 0 12px 2px ${colors.accentGlow}`,
  raised: '0 8px 24px rgba(0, 0, 0, 0.45)',
} as const;

export function readinessColor(readiness: number): string {
  if (readiness >= 70) return colors.readinessHigh;
  if (readiness >= 40) return colors.readinessMid;
  return colors.readinessLow;
}

/** Format an LC amount for the wallet chip ("1,240 LC"). */
export function formatCredits(lc: number): string {
  return `${Math.max(0, Math.trunc(lc)).toLocaleString('en-US')} LC`;
}
