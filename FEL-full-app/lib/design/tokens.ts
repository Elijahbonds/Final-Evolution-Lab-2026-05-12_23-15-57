// THE DESIGN TOKENS — one set for the app and the TV HUD (A11-06, lane/a11y-design, 2026-10-25).
//
// Before this there were three places a colour could come from and nothing that said which one was the rule:
//   - app/theme.css's --fel-* custom properties (the console identity, measured and written down 2026-09-20),
//   - lib/design/palette.ts (the same accents as hex, for colours built from data: `${accent}14`),
//   - components/games/tv-hud/tokens.ts's HUD_RGB (the HUD's ten tones, eight of them the theme's accents),
// and, in practice, a fourth: ad-hoc Tailwind on every page (`text-white/35`, `bg-[#050505]`, `border-[#00E5FF]/45`).
// The fourth is where the accessibility audit's contrast misses came from: white at 30–45 % on the page ink is 2.5:1
// to 4.46:1, under the WCAG 1.4.3 floor of 4.5:1 for body text.
//
// This module is the set. It re-exports the palette (unchanged), names the surfaces and a TEXT LADDER whose every step
// clears 4.5:1 on every surface the app draws text on (lib/design/tokens.test.ts measures it), adds the two HUD-only
// reads so the HUD's tones have theme names too, and the focus ring. app/theme.css carries each as a --fel-* property
// (held equal by test) and tailwind.config.ts exposes the colours as `fel-*` classes (text-fel-dim, bg-fel-bg,
// border-fel-cyan/45), so a page sweep is a mechanical replacement with the same hex underneath.
//
// NO SIGNED-OFF VALUE CHANGES HERE. The accents, the ink, the surfaces and the HUD tones are the values the owner has
// seen; the text ladder's quiet/soft steps and the focus ring are new.
import { INK, PALETTE, SURFACE } from './palette';

/** Every colour token, as hex. */
export const COLOR = {
  /** The page ink. --fel-bg */
  bg: INK,
  /** The one card material. --fel-surface */
  surface: SURFACE,
  /** A raised panel, a chip. --fel-surface-2 */
  surface2: '#161d27',
  /** A hairline. --fel-line (a border, never a text background) */
  line: '#232c38',

  // THE TEXT LADDER, brightest first. Every step is at least 4.5:1 on bg, surface and surface-2.
  /** Headings and primary copy. --fel-text */
  text: '#f2f5f9',
  /** Body copy under a heading, a lede. --fel-text-soft (new) */
  textSoft: '#c3cad3',
  /** Secondary reads: a label, a count, a caption. --fel-text-dim */
  textDim: '#8b97a5',
  /** The quietest text that still reads: a footer door, a tab at rest. --fel-text-quiet (new) */
  textQuiet: '#7d8794',

  ...PALETTE,

  /** The rival / away side on the HUD (HUD_RGB.them). --fel-them */
  them: '#facc15',
  /** A quiet secondary HUD read (HUD_RGB.info). --fel-info */
  info: '#9ad7ff',

  /** The keyboard / pad / remote focus ring (the primary-action cyan). --fel-focus (new) */
  focus: PALETTE.cyan,
} as const;

export type ColorToken = keyof typeof COLOR;

/** The CSS custom property that carries each colour token in app/theme.css. */
export const COLOR_VAR: Record<ColorToken, string> = {
  bg: '--fel-bg', surface: '--fel-surface', surface2: '--fel-surface-2', line: '--fel-line',
  text: '--fel-text', textSoft: '--fel-text-soft', textDim: '--fel-text-dim', textQuiet: '--fel-text-quiet',
  cyan: '--fel-cyan', gold: '--fel-gold', ember: '--fel-ember', crimson: '--fel-crimson', emerald: '--fel-emerald',
  violet: '--fel-violet', indigo: '--fel-indigo', them: '--fel-them', info: '--fel-info', focus: '--fel-focus',
};

/** The text steps, in order. */
// (no `satisfies` in this file: tailwind.config.ts imports it through jiti, whose transform predates that syntax)
export const TEXT_LADDER: readonly ColorToken[] = ['text', 'textSoft', 'textDim', 'textQuiet'];

/** The surfaces text is drawn on. */
export const TEXT_SURFACES: readonly ColorToken[] = ['bg', 'surface', 'surface2'];

/** WCAG 1.4.3 for body text. */
export const BODY_CONTRAST_MIN = 4.5;

/**
 * The Tailwind colour family (`fel-*` classes), from the same hex: `text-fel-dim`, `bg-fel-bg`, `border-fel-cyan/45`.
 * Hex rather than var() so Tailwind's opacity modifier (`/45`) keeps working.
 */
export const TAILWIND_FEL = {
  bg: COLOR.bg, surface: COLOR.surface, 'surface-2': COLOR.surface2, line: COLOR.line,
  text: COLOR.text, soft: COLOR.textSoft, dim: COLOR.textDim, quiet: COLOR.textQuiet,
  cyan: COLOR.cyan, gold: COLOR.gold, ember: COLOR.ember, crimson: COLOR.crimson, emerald: COLOR.emerald,
  violet: COLOR.violet, indigo: COLOR.indigo, them: COLOR.them, info: COLOR.info, focus: COLOR.focus,
} as const;

/** The focus ring every keyboard, pad and remote stop draws (2.4.7, and visible on every surface: 1.4.11's 3:1). */
export const FOCUS_RING = { width: 2, offset: 2, color: COLOR.focus } as const;

/** Radii (px). --fel-r-card, --fel-r-pill */
export const RADIUS = { card: 20, pill: 999 } as const;
