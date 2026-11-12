// COLOUR-BLIND-SAFE CUES — the HUD's tones under a colour-vision setting (A11-03, lane/a11y-design, 2026-10-25).
//
// Owner (QUALITY, 2026-10-20): "games: colour-blind-safe cues". The HUD speaks in colour: the shot meter's GOOD band is
// green with a gold PERFECT band inside it, a lost line is crimson, your side is cyan and theirs is yellow. About 1 in 12
// men has a red-green deficiency. Measured (lib/a11y/colorVision.test.ts; simulated with Machado, Oliveira & Fernandes
// 2009, severity 1; ΔE CIE76), the default palette's worst critical pair is 24 ΔE under deuteranopia — the GOOD green
// against the crimson of a miss — and 22 ΔE under tritanopia — a streak's ember against danger — both under the 30 the
// tests ask for; under protanopia the PERFECT gold inside the GOOD green is 42 ΔE, the narrowest pair it has.
//
// THE SETTING: off (the default, the palette the owner signed off — unchanged), deuteranopia, protanopia, tritanopia.
// Each swaps the HUD's tones for ones the tests hold apart (ΔE ≥ CUE_MIN_DELTA_E on every critical pair, simulated for
// that deficiency) and turns on SHAPE cues beside the colour (components/games/tv-hud/meter.tsx: the PERFECT band hatched,
// the GOOD band edged), so a cue never rests on colour alone (WCAG 1.4.1).
//
// COLOURS AND SHAPES ONLY. No timing window, meter size, band width or score changes — those are the modes' numbers and
// the tv-hud components only draw them. The off palette is byte-identical to before (tokens.test.ts holds HUD_RGB).
//
// Stored like reduced motion (lib/a11y/reducedMotion.ts): one localStorage key, every read and write wrapped, a private
// window keeps the choice for the session.

export type ColorVision = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export const COLOR_VISIONS: readonly ColorVision[] = ['off', 'deuteranopia', 'protanopia', 'tritanopia'];
export const COLOR_VISION_KEY = 'fel-color-vision';

export type Rgb = readonly [number, number, number];

export const isColorVision = (v: unknown): v is ColorVision => typeof v === 'string' && (COLOR_VISIONS as readonly string[]).includes(v);

// ── simulation (pure) ────────────────────────────────────────────────────────────────────────────────────────────────

/** Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB. */
const MACHADO: Record<Exclude<ColorVision, 'off'>, readonly number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};

const toLin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => { const c = Math.max(0, Math.min(1, v)); return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255); };

/** How a colour looks to someone with this deficiency ('off' returns it unchanged). */
export function simulate(rgb: Rgb, kind: ColorVision): Rgb {
  if (kind === 'off') return rgb;
  const m = MACHADO[kind];
  const [r, g, b] = rgb.map(toLin);
  return [toSrgb(m[0] * r + m[1] * g + m[2] * b), toSrgb(m[3] * r + m[4] * g + m[5] * b), toSrgb(m[6] * r + m[7] * g + m[8] * b)];
}

/** CIE L*a*b* (D65). */
export function toLab(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(toLin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE (CIE76) between two colours. */
export function deltaE(a: Rgb, b: Rgb): number {
  const p = toLab(a), q = toLab(b);
  return Math.round(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 10) / 10;
}

/** ΔE between two colours as this deficiency sees them. */
export const seenDeltaE = (a: Rgb, b: Rgb, kind: ColorVision): number => deltaE(simulate(a, kind), simulate(b, kind));

/** Two cues the player must tell apart need at least this ΔE as THEY see them (≈ "clearly different" at a glance). */
export const CUE_MIN_DELTA_E = 30;

// ── the HUD's tones per setting ──────────────────────────────────────────────────────────────────────────────────────

/** The tone names (components/games/tv-hud/tokens.ts HudTone), kept here so lib does not import a component. */
export type CueTone = 'you' | 'score' | 'good' | 'danger' | 'heat' | 'power' | 'text' | 'ink' | 'them' | 'info';

/**
 * The pairs a player must never confuse, and why:
 *   good / danger   the GOOD band or a made shot vs a miss, a lost line, the last seconds
 *   good / score    the GOOD band vs the PERFECT band inside it (the shot meter)
 *   score / danger  a celebration vs a warning
 *   you / them      your side vs the rival's (team colours, scorebug)
 *   you / danger    your fill vs a danger read on the same bar
 *   heat / danger   a streak vs a warning
 */
export const CRITICAL_PAIRS: readonly (readonly [CueTone, CueTone])[] = [
  ['good', 'danger'], ['good', 'score'], ['score', 'danger'], ['you', 'them'], ['you', 'danger'], ['heat', 'danger'],
];

/**
 * The swaps, per setting. Only the tones that collide change; text, ink and the rest keep the signed-off values.
 * Built on the blue / orange axis every dichromat keeps (the Okabe–Ito / Wong set's sky blue, blue, orange, yellow,
 * vermillion), with lightness pulled apart where hue alone is not enough.
 */
export const CUE_SWAPS: Record<Exclude<ColorVision, 'off'>, Partial<Record<CueTone, Rgb>>> = {
  // red-green: green → sky blue, crimson → a dark vermillion, gold → a light yellow, the rival → orange
  deuteranopia: { good: [86, 180, 233], danger: [213, 94, 0], score: [255, 236, 120], them: [230, 159, 0], heat: [255, 170, 120] },
  // protan sees red dark already, so crimson stays: green → sky blue, gold → a light yellow, the rival → orange
  protanopia: { good: [86, 180, 233], score: [255, 236, 120], them: [230, 159, 0] },
  // blue-yellow: the crimson's blue half is what tells it from ember for this player, so danger → a pure red and the
  // streak's ember → a light peach (the rest already reads: cyan vs the yellow rival is 76 ΔE as a tritanope sees it)
  tritanopia: { danger: [204, 0, 0], heat: [255, 170, 120] },
};

/** The tones in force for a setting, over the base palette. */
export function cuePalette<T extends Record<CueTone, Rgb>>(base: T, kind: ColorVision): T {
  if (kind === 'off') return base;
  return { ...base, ...CUE_SWAPS[kind] } as T;
}

/** Shape cues beside colour (the meter's hatch and edges) are on for every setting but off. */
export const shapeCues = (kind: ColorVision): boolean => kind !== 'off';

// ── the runtime ─────────────────────────────────────────────────────────────────────────────────────────────────────

let sessionOnly: ColorVision | null = null;
const listeners = new Set<() => void>();

export function readColorVision(): ColorVision {
  if (sessionOnly) return sessionOnly;
  try {
    if (typeof window !== 'undefined') {
      const v = window.localStorage?.getItem(COLOR_VISION_KEY);
      if (isColorVision(v)) return v;
    }
  } catch { /* storage blocked: the default */ }
  return 'off';
}

export function writeColorVision(v: ColorVision): void {
  try { window.localStorage.setItem(COLOR_VISION_KEY, v); sessionOnly = null; } catch { sessionOnly = v; }
  for (const fn of [...listeners]) { try { fn(); } catch { /* one bad listener never blocks the rest */ } }
}

export function onColorVisionChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
