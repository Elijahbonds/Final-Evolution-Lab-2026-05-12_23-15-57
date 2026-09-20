// palette — the accent colours, in TypeScript, kept equal to app/theme.css by test.
//
// Why both exist: the CSS tokens are what a stylesheet reads, and a lot of this app sets colour from DATA — a
// family's accent, a creator card's accent — where the value is interpolated with an alpha suffix (`${accent}14`).
// A custom property cannot be concatenated like that, so the data side needs real hex. Two sources of the same
// truth is exactly how a palette drifts, so lib/design/palette.test.ts parses theme.css and fails if a value here
// stops matching the token of the same name.
//
// Measured, not chosen: these are the values the tree already used, by a wide margin, before anything was written
// down. See the comment on :root in app/theme.css.

export const PALETTE = {
  cyan: '#00E5FF',
  gold: '#FFD700',
  ember: '#FF7A2F',
  crimson: '#FF3366',
  emerald: '#00FF9D',
  violet: '#A855F7',
  indigo: '#7B61FF',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** The page background everything sits on. */
export const INK = '#050505';

/** The one card material, matching `.fel-card` and `--fel-surface`. */
export const SURFACE = '#0c0c11';
