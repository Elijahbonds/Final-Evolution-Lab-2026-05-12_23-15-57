// consoleView — how a game lays itself out on a screen held SIDEWAYS: a phone in landscape, the same phone mirrored to a
// TV, or a laptop / console browser on a 16:9 TV (console-view lane, 2026-10-06).
//
// Owner, verbatim: "Let's fix how it looks when it's horizontal, it looks bad when you screen mirror. We need it not to
// look squished. It needs to feel like a console game."
//
// WHAT WAS MEASURED (scripts/probes/_console-view-probe.mts, the real /play routes, before this file):
//   - Only a landscape PHONE (height <= 520, `isLandscapePhone`) got the whole screen. Every other sideways screen — a
//     laptop or console browser on a TV at 1920x1080 or 1280x720 — kept the page layout: the 52 px header, a 1200 px
//     max-width column, and the hosts' 16:10 / `100dvh - 3.25rem` boxes, so the game was a framed window with black
//     around it and the page scrolled.
//   - The HUD is drawn in fixed CSS pixels (text-[10px], text-xs, 96 px sticks). At 1080 px tall that is 1 % of the
//     screen height — a caption you cannot read from a couch — while the same pixels on a 390 px phone are 2.6 %.
//   - The HUD and the touch deck were anchored 12 px from the edge: under a landscape iPhone's notch, and inside the
//     strip a TV overscans off the picture.
//
// THE RULES, all pure so they are tested without a browser:
//   1. Sideways is console view. Any landscape screen (wider than CONSOLE_MIN_ASPECT) gets the full-bleed stage.
//   2. The HUD scales with the screen's HEIGHT, the way a console game's does: 1x on a phone (where it was designed),
//      growing linearly from HUD_DESIGN_HEIGHT, clamped at HUD_ZOOM_MAX so a 4K window is not all HUD.
//   3. The HUD sits inside a title-safe frame: 5 % each side on a TV-sized screen (overscan), and on a short phone a
//      little less vertically, where every pixel of height is play — the notch inset is added by CSS (env()).

/** Wider than this is "sideways". 1.2 keeps a near-square tablet (1024x900) on the page layout. */
export const CONSOLE_MIN_ASPECT = 1.2;

/** The screen height the HUD's pixel sizes were drawn for. At or below it the HUD is 1:1. */
export const HUD_DESIGN_HEIGHT = 480;

/** The HUD never grows past this. 2.25 at 1080 px: a 10 px caption draws at 22.5 px, a 12 px one at 27 px. */
export const HUD_ZOOM_MAX = 2.25;

/** A sideways screen this short is a phone (shared with lib/ui/fullscreen's LANDSCAPE_MAX_HEIGHT). */
export const PHONE_MAX_HEIGHT = 520;

/** Title-safe margins, as a fraction of the screen's width / height. */
export const TV_SAFE = { x: 0.05, y: 0.05 } as const;
/** A phone does not overscan; its sides still lose the notch (CSS adds env(safe-area-inset-*)) and its top and bottom
 *  are the scarcest pixels it has. */
export const PHONE_SAFE = { x: 0.03, y: 0.03 } as const;

export interface ConsoleLayout {
  /** Full-bleed console view (sideways). False keeps the page layout (portrait). */
  console: boolean;
  /** Multiplier for every HUD pixel. 1 in portrait and on phones. */
  hudZoom: number;
  /** Title-safe inset, in CSS px, before any notch inset. 0 when not in console view. */
  safeX: number;
  safeY: number;
}

export function consoleLayout(width: number, height: number): ConsoleLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  if (w === 0 || h === 0 || w / h < CONSOLE_MIN_ASPECT) return { console: false, hudZoom: 1, safeX: 0, safeY: 0 };
  const hudZoom = Math.round(Math.min(HUD_ZOOM_MAX, Math.max(1, h / HUD_DESIGN_HEIGHT)) * 100) / 100;
  const safe = h <= PHONE_MAX_HEIGHT ? PHONE_SAFE : TV_SAFE;
  return { console: true, hudZoom, safeX: Math.round(w * safe.x), safeY: Math.round(h * safe.y) };
}

/** The stage's inline custom properties: what app/game-surface.css reads under [data-fel-console]. */
export function consoleStageVars(l: ConsoleLayout): Record<string, string> {
  return {
    '--fel-hud-zoom': String(l.hudZoom),
    '--fel-safe-x': `${l.safeX}px`,
    '--fel-safe-y': `${l.safeY}px`,
  };
}

/**
 * How the touch deck lays itself out.
 *
 *   'portrait'  — the DS-style bottom deck (unchanged).
 *   'landscape' — sticks and buttons stacked up the two sides (unchanged on a tall landscape screen, a tablet).
 *   'compact'   — a SHORT landscape screen, a phone held sideways. Stacked, the right side was boost pill 46 + diamond
 *                 148 + stick 96 + gaps = 318 px of a 390 px screen — the controls were a wall up both edges of the
 *                 picture the TV shows. Compact puts each stick BESIDE its buttons (the right stick inboard of the
 *                 diamond, as on a console pad's right half; the d-pad inboard of the left stick), so each side is about
 *                 half as tall. Same controls, same places relative to each other — only the stacking changes.
 */
export type TouchDeckLayout = 'portrait' | 'landscape' | 'compact' | 'none';

/**
 * `touch` false — a screen with no touch at all (a laptop or a console browser on a TV, driven by keyboard or pad) —
 * is 'none': two 96 px thumbsticks and a 148 px button diamond that nothing can press were drawn over the picture
 * (at 1080p, with the HUD zoom, they would be 216 px and 333 px). A connected pad already hid them; a keyboard did not.
 */
export function touchDeckLayout(width: number, height: number, touch = true): TouchDeckLayout {
  if (!touch) return 'none';
  if (!(width > height)) return 'portrait';
  return height <= PHONE_MAX_HEIGHT ? 'compact' : 'landscape';
}
