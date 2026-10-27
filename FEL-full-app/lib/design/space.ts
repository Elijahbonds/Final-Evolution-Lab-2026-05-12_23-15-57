// SPACE, RADIUS, ELEVATION (lane/premium-ui, 2026-10-27; docs/PLAN-UI-10PHASE.md P1).
//
// "Boxes on boxes" was the owner's second reason the app feels cheap: every card a 1 px white/8 border on a white/2 fill,
// each page inventing its own padding. One 4-px rhythm, three radii and three surfaces — and a surface is a LIGHT, not a
// border: a soft top highlight and a gradient, so a card reads as lifted off the ink rather than outlined on it.

/** The 4-px rhythm, as Tailwind steps (1 = 4 px). */
export const SPACE = { xs: 1, sm: 2, md: 3, lg: 4, xl: 6, '2xl': 8, '3xl': 12 } as const;

/** Page gutter and section gap, in px. */
export const LAYOUT = { gutter: 20, sectionGap: 32, column: 1080 } as const;

/** Radii (px). `card` is the existing --fel-r-card. */
export const RADII = { sm: 12, md: 16, card: 20, xl: 28, pill: 999 } as const;

/**
 * The three surfaces, darkest to brightest, as CSS custom properties in app/theme.css. Each is drawn over the ink
 * (--fel-bg); the composite colours are what text sits on, and lib/design/premium.test.ts measures the text ladder on
 * each of them.
 */
export const ELEVATION = {
  /** a card on the page */
  raised: { var: '--fel-elev-1', composite: '#12161c' },
  /** a sheet, a menu, the tab bar (glass where the device can afford it) */
  overlay: { var: '--fel-elev-2', composite: '#141a22' },
  /** a pressed or selected card */
  lit: { var: '--fel-elev-3', composite: '#161d27' },
} as const;
