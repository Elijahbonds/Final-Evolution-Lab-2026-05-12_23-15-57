/**
 * lib/feel-panel/knobs.ts — THE FEEL KNOB CATALOGUE (feel-panel lane, owner 2026-10-20: "dev-only sliders for the new numbers. The owner
 * tweaks them on a phone and tells us the values, and we commit them").
 *
 * One row per number the owner can tune from the feel panel. A row is DATA only: the number itself still lives in its own module as
 * a constant (the default everyone plays), and that module reads it each frame through `feel(id, CONSTANT)` (lib/feel-panel/feel.ts),
 * which returns the constant unless this device holds an override AND the panel is open for this user AND the run is an unpaid
 * playtest (lib/feel-panel/sessionGate.ts). How another lane registers a knob: docs/FEEL-PANEL.md.
 *
 * `def` must equal the constant in `source` (knobs.test.ts pins each one), so the panel's "default" is the number that ships.
 * `min` / `max` are the SAFE bounds: no slider, and no hand-edited localStorage, can move a knob outside them (feel.ts clamps on
 * load and on every set). Pure: no DOM, no Babylon.
 */

export interface FeelKnob {
  /** `<area>.<camelName>`, e.g. 'hoops.aiHandRangeM'. The key in localStorage and in the copied JSON. */
  id: string;
  /** What the owner reads on the panel. */
  label: string;
  /** The shipped value: the constant named in `source`. */
  def: number;
  min: number;
  max: number;
  /** The slider's step; values are rounded to it. */
  step: number;
  /** 'm', 's', '' … shown after the value. */
  unit: string;
  /** Panel section. */
  group: string;
  /** Where the constant lives, so a copied value can be committed: 'lib/babylon/core/AiBallHand.ts AI_HAND_RANGE_M'. */
  source: string;
  /** One line: what moving it does. */
  hint: string;
}

/**
 * The catalogue. APPEND rows for a new knob (other lanes: add yours at the end of your group; a merge then only ever adds lines).
 * Bounds are assumptions until the owner has felt them (flagged in the lane report).
 */
export const FEEL_KNOBS: readonly FeelKnob[] = [
  // ── hoops-handle (#375): the 3v3 AI handlers' ball hand, and the hand clearing the ball ──
  {
    id: 'hoops.aiHandRangeM', label: 'AI hand: defender range', def: 2.4, min: 1.0, max: 4.0, step: 0.05, unit: 'm', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_RANGE_M',
    hint: 'A defender inside this decides which hand the 3v3 AI handler keeps the ball in.',
  },
  {
    id: 'hoops.aiHandDwellSec', label: 'AI hand: dwell before crossing', def: 0.35, min: 0.05, max: 1.5, step: 0.01, unit: 's', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_DWELL_SEC',
    hint: 'How long the defender sits on the ball side before the AI handler crosses away from him.',
  },
  {
    id: 'hoops.aiHandGapSec', label: 'AI hand: gap between crossings', def: 0.9, min: 0.2, max: 3.0, step: 0.05, unit: 's', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_GAP_SEC',
    hint: 'No two AI crossings closer together than this.',
  },
  {
    id: 'hoops.handClearM', label: 'Hand clears the ball by', def: 0.01, min: 0, max: 0.05, step: 0.001, unit: 'm', group: 'Hoops · ball hand',
    source: 'lib/babylon/anim/Dribble.ts HAND_CLEAR_M',
    hint: 'How far above the rising ball the dribble hand is held (no hand through the ball).',
  },
  // ── hoops-shot-core: the distance-narrowed green, ELITE's shot clock, a missed dunk off the iron ──
  {
    id: 'hoops.distGreenNearM', label: 'Green: full width inside', def: 2.0, min: 0.5, max: 5.0, step: 0.1, unit: 'm', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_NEAR_M',
    hint: 'A 1v1 / 3v3 jump shot from inside this keeps the whole green.',
  },
  {
    id: 'hoops.distGreenFarM', label: 'Green: narrowest from', def: 7.5, min: 4.0, max: 10.0, step: 0.1, unit: 'm', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_FAR_M',
    hint: 'From this far out the jump shot\'s green is at its narrowest.',
  },
  {
    id: 'hoops.distGreenMaxNarrow', label: 'Green: most it narrows', def: 0.22, min: 0, max: 0.5, step: 0.01, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_MAX_NARROW',
    hint: 'Share of the green taken away at the far distance (0.22 = 22 % narrower, the shootout\'s deepest rack).',
  },
  {
    id: 'hoops.shotClock1v1Sec', label: 'Shot clock 1v1 (ELITE)', def: 12, min: 6, max: 24, step: 1, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotClock.ts SHOT_CLOCK_1V1_SEC',
    hint: 'The player\'s shot clock in 1v1 on ELITE (ROOKIE and PRO are untimed).',
  },
  {
    id: 'hoops.shotClock3v3Sec', label: 'Shot clock 3v3 (ELITE)', def: 14, min: 6, max: 24, step: 1, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotClock.ts SHOT_CLOCK_3V3_SEC',
    hint: 'The player\'s shot clock in 3v3 on ELITE (ROOKIE and PRO are untimed).',
  },
  {
    id: 'hoops.dunkRingQuality', label: 'Dunk miss: spread', def: 0.7, min: 0.3, max: 1.0, step: 0.05, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_RING_QUALITY',
    hint: 'Where a missed dunk catches the iron (higher = misses closer to the rim\'s edge). The make rate does not change.',
  },
  {
    id: 'hoops.dunkShortBias', label: 'Dunk miss: out the front when contested', def: 0.7, min: 0, max: 1.0, step: 0.05, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_SHORT_BIAS',
    hint: 'How much a contest pushes a missed dunk off the front iron, back at the dunker.',
  },
  {
    id: 'hoops.dunkClankMinMps', label: 'Dunk miss: slowest bounce', def: 2.4, min: 1.0, max: 4.0, step: 0.1, unit: 'm/s', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_CLANK_MIN_MPS',
    hint: 'A missed dunk caught near the middle leaves the iron at this speed.',
  },
  {
    id: 'hoops.dunkClankSpanMps', label: 'Dunk miss: extra bounce at the edge', def: 1.6, min: 0, max: 3.0, step: 0.1, unit: 'm/s', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_CLANK_SPAN_MPS',
    hint: 'Added to the slowest bounce for a dunk that catches the far edge of the iron.',
  },
];

export const FEEL_KNOB_BY_ID: ReadonlyMap<string, FeelKnob> = new Map(FEEL_KNOBS.map((k) => [k.id, k]));

/** Decimal places of a step (0.05 → 2, 0.001 → 3, 1 → 0). */
export function stepDecimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** A value made safe for a knob: finite, inside [min, max], on the step grid. null for anything that is not a finite number. */
export function clampKnob(k: FeelKnob, v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const c = Math.min(k.max, Math.max(k.min, v));
  const onGrid = k.min + Math.round((c - k.min) / k.step) * k.step;
  return Number(Math.min(k.max, Math.max(k.min, onGrid)).toFixed(stepDecimals(k.step)));
}
