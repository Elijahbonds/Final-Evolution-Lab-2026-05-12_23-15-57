// TV HUD TOKENS (A9.13, lane/tv-hud, 2026-10-13) — the one palette, the 10-foot type scale, the safe frame and the motion
// the shared HUD pieces (scorebug, banner, meter, frame) draw with. Pure: no React, no DOM, so every rule is tested
// without a browser.
//
// Owner, after playing on a TV (2026-10-06): "all modes are going to need dense visual passes to make it feel more like a
// Polished AAA Title." The audit (docs/VISUAL-PASS-PLAN.md A7) found 21 hand-built host bezels, 127 uses of
// text-[9px]/[10px]/[11px], `font-display` used 0 times, and a hex palette of up to 15 colours per host.
//
// HOW THE SIZES WORK WITH CONSOLE VIEW. GameShell already scales every host's HUD with the screen's HEIGHT
// (lib/ui/consoleView.ts: CSS `zoom: var(--fel-hud-zoom)`, 1 on a phone, HUD_ZOOM_MAX = 2.25 at 1080 px) and draws it
// inside a 5 % title-safe frame on a TV. So a HUD size here is a DESIGN pixel that the zoom multiplies. A plain 10 px
// caption drew at 22.5 px on a 1080p TV — under the 10-foot floor of 24 px — while the same 10 px is right on a phone.
// Each step below is therefore `phone px + (zoom - 1) × growth`: exactly today's size on a phone (zoom 1, so a phone
// layout covers no more of the play area than it did), and at least TV_MIN_READ_PX once the 1080p zoom applies.
import { HUD_ZOOM_MAX, TV_SAFE } from '@/lib/ui/consoleView';

// ── Palette ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE palette. Every colour a migrated host draws comes from here (a scan test holds them to it). The first seven match
 * app/theme.css's --fel-* tokens exactly (a test reads that file), so the HUD and the app speak one colour language;
 * `them` and `info` are the two reads the hosts needed that the theme has no token for (the rival's side, and a quiet
 * secondary read such as a rally multiplier or rings).
 */
export const HUD_RGB = {
  /** The player's side, primary reads, focus. --fel-cyan */
  you: [0, 229, 255],
  /** Score, currency, celebration, "perfect". --fel-gold */
  score: [255, 215, 0],
  /** Success, ready, PRQ up. --fel-emerald */
  good: [0, 255, 157],
  /** Danger, KO, last seconds, a lost line. --fel-crimson */
  danger: [255, 51, 102],
  /** Heat, momentum, a streak. --fel-ember */
  heat: [255, 122, 47],
  /** Power, chi, a special. --fel-violet */
  power: [168, 85, 247],
  /** Body text. --fel-text */
  text: [242, 245, 249],
  /** The rival / away side (yellow, kept apart from the score's gold). */
  them: [250, 204, 21],
  /** A quiet secondary read (sky). */
  info: [154, 215, 255],
} as const satisfies Record<string, readonly [number, number, number]>;

export type HudTone = keyof typeof HUD_RGB;
export const HUD_TONES = Object.keys(HUD_RGB) as HudTone[];

/** The theme token each palette entry mirrors (null: HUD-only). */
export const HUD_THEME_VAR: Record<HudTone, string | null> = {
  you: '--fel-cyan', score: '--fel-gold', good: '--fel-emerald', danger: '--fel-crimson', heat: '--fel-ember',
  power: '--fel-violet', text: '--fel-text', them: null, info: null,
};

/** A tone as a CSS colour, at an alpha (1 = solid). rgba() rather than color-mix() so an older TV browser draws it. */
export function hudColor(tone: HudTone, alpha = 1): string {
  const [r, g, b] = HUD_RGB[tone];
  const a = Math.max(0, Math.min(1, alpha));
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** Text alphas for the body colour: secondary and tertiary reads (labels, units, the "·" between). */
export const HUD_TEXT_ALPHA = { muted: 0.78, faint: 0.55 } as const;

/** The plate every HUD readout sits on: dark glass, a hairline edge, legible over snow, sun and floodlit grass. */
export const HUD_PLATE = {
  background: 'rgba(6, 9, 14, 0.66)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  /** Design px (the console zoom scales it with everything else). */
  radius: 8,
  shadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
} as const;

/** The text shadow on HUD text that sits on the scene without a plate (a combo pot, a cue label). */
export const HUD_TEXT_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 0, 0, 0.45)';

// ── The 10-foot type scale ───────────────────────────────────────────────────────────────────────────────────────────

/** The 10-foot floor: anything the player must read draws at least this many px on a 1080p TV. */
export const TV_MIN_READ_PX = 24;
/** The console zoom at 1080p (consoleView's cap, reached at 1080 px tall). */
export const TV_ZOOM = HUD_ZOOM_MAX;

export interface HudTypeStep {
  /** The size on a phone (zoom 1): today's size for the role, so a phone layout does not grow. */
  phone: number;
  /** Extra design px per unit of zoom above 1. */
  growth: number;
  /** Line height. */
  leading: number;
  /** Letter spacing, em. */
  tracking: number;
  /** Font weight. */
  weight: number;
}

/**
 * The steps, smallest first. `caption` is the floor: no readable HUD text is smaller. Rendered px at 1080p (zoom 2.25)
 * in brackets: caption 10 → 24.3, label 11 → 27.6, body 12 → 30.4, value 14 → 36, stat 18 → 46.1, score 24 → 60.8,
 * banner 24 → 65.3, hero 30 → 81.
 */
export const HUD_TYPE = {
  /** A unit, a tick label, a chip's small print. */
  caption: { phone: 10, growth: 0.64, leading: 1.15, tracking: 0.06, weight: 600 },
  /** A chip's label (HR, OUTS, FLOW), a meter's name. */
  label: { phone: 11, growth: 1, leading: 1.15, tracking: 0.08, weight: 700 },
  /** A readout line (PIN 142m · WIND 3), a hint. */
  body: { phone: 12, growth: 1.2, leading: 1.2, tracking: 0.03, weight: 600 },
  /** A chip's value. */
  value: { phone: 14, growth: 1.6, leading: 1.1, tracking: 0.02, weight: 700 },
  /** A secondary number (the rival's total, a pot's line). */
  stat: { phone: 18, growth: 2, leading: 1, tracking: 0.01, weight: 800 },
  /** The scorebug's main numbers. */
  score: { phone: 24, growth: 2.4, leading: 1, tracking: 0, weight: 800 },
  /** A banner (GOAL!, ROUND 2, a distance). */
  banner: { phone: 24, growth: 4, leading: 1.05, tracking: 0.02, weight: 800 },
  /** The one huge number (a combo pot). */
  hero: { phone: 30, growth: 4.8, leading: 1, tracking: 0, weight: 800 },
} as const satisfies Record<string, HudTypeStep>;

export type HudSize = keyof typeof HUD_TYPE;
export const HUD_SIZES = Object.keys(HUD_TYPE) as HudSize[];

/** Design px of a step at a given console zoom (before the zoom multiplies it). */
export function hudDesignPx(size: HudSize, zoom: number): number {
  const s = HUD_TYPE[size];
  const z = Number.isFinite(zoom) && zoom > 1 ? zoom : 1;
  return s.phone + (z - 1) * s.growth;
}

/** What the screen actually draws: the design px times the zoom. */
export function hudRenderedPx(size: HudSize, zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 1 ? zoom : 1;
  return hudDesignPx(size, z) * z;
}

/** The CSS font-size for a step: the same rule as hudDesignPx, evaluated against the stage's live --fel-hud-zoom. */
export function hudFontSize(size: HudSize): string {
  const s = HUD_TYPE[size];
  return `calc(${s.phone}px + (var(--fel-hud-zoom, 1) - 1) * ${s.growth}px)`;
}

/** Inline style for HUD text at a step, in the display face. */
export function hudType(size: HudSize): { fontSize: string; lineHeight: number; letterSpacing: string; fontWeight: number } {
  const s = HUD_TYPE[size];
  return { fontSize: hudFontSize(size), lineHeight: s.leading, letterSpacing: `${s.tracking}em`, fontWeight: s.weight };
}

/** The display face (Tailwind `font-display`: --font-display, Barlow Condensed) — numbers and calls, per A9.13. */
export const HUD_FONT_CLASS = 'font-display';

// ── Safe frame ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The title-safe margin on a TV, as a fraction of the screen (consoleView's TV_SAFE: the host box IS this frame). */
export const HUD_SAFE = TV_SAFE;

// ── Meter geometry ───────────────────────────────────────────────────────────────────────────────────────────────────

/** 0..1, with NaN and junk as 0. */
export function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** A value on a 0..max scale as a CSS percentage string (clamped). */
export function meterPct(value: unknown, max = 1): string {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const n = typeof value === 'number' ? value : Number(value);
  return `${Math.round(clamp01((Number.isFinite(n) ? n : 0) / m) * 10000) / 100}%`;
}

// ── Motion ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A banner or a chip arriving: a short pop. Reduced motion: no movement, a quick fade only. */
export function hudEnter(reduced: boolean) {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
      initial: { opacity: 0, scale: 0.86, y: -6 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.96, transition: { duration: 0.14 } },
      transition: { type: 'spring' as const, damping: 18, stiffness: 420, mass: 0.6 },
    };
}

/** A number changing on the scorebug: a brief swell. Reduced motion: none. */
export function hudPop(reduced: boolean) {
  return reduced
    ? { initial: false as const, animate: { scale: 1 } }
    : { initial: { scale: 1.22 }, animate: { scale: 1 }, transition: { type: 'spring' as const, damping: 14, stiffness: 520 } };
}

// ── End-card hand-off ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * When the run's end card is up (GameShell renders <EndScreen> — `data-end-screen` — as a sibling of the host inside
 * the stage), the HUD under it bows out, so the card's own score slam is the only score on the screen. CSS, not state:
 * a host does not know when the shell's card mounts or (dance's GO AGAIN in place) unmounts, and the stage does.
 */
export const END_CARD_ATTR = 'data-end-screen';
