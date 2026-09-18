/**
 * lib/feel/cores/dunk-scoring.ts
 * ==============================
 * M-handoff Phase 1 — PURE dunk scoring + feel resolution.
 *
 * This module is deliberately framework-free (NO THREE / DOM / React imports)
 * so both the live component (components/games/dunk-game-3d.tsx) and the headless
 * feel test (scripts/dunk-feel-tests.ts) import the SAME logic. Never fork it.
 *
 * It implements the depth the handoff Dunk gaps 2-5 require:
 *   Gap 2  gather / approach   -> approachMult(distM)   (reward the run-up gather)
 *   Gap 3  zone hold-release   -> gradeZoneRelease(off) (tiered timing windows)
 *   Gap 4  toss select         -> TOSS_MULT             (straight/arc/backboard)
 *   Gap 5  modifier 2nd-touch  -> MODIFIER_MULT         (double / chained clutch)
 *
 * Skill-separation guarantee (asserted by the feel test):
 *   a masher (random GOOD timing, no toss/modifier, short run-up) tops out ~<=10pt,
 *   a skilled player (PERFECT + full hang + gather + arc + double) clears >=40pt,
 *   single-dunk ceiling stays ~<=55pt so "first to 21" keeps meaning.
 */

export type DunkStyle = 'POWER' | 'FLASHY' | 'SIGNATURE';
export type TossType = 'straight' | 'arc' | 'backboard';
export type DunkModifier = 'none' | 'double' | 'chained';
export type TimingGrade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

// ── Feel constants ─────────────────────────────────────────────────────────
// Trick complexity by style. // TUNE(elijah)
export const STYLE_COMPLEXITY: Record<DunkStyle, number> = {
  POWER: 0.9,
  FLASHY: 1.4,
  SIGNATURE: 2.0,
};

// Toss (Gap 4): where the player throws the lob to themselves. // TUNE(elijah)
export const TOSS_MULT: Record<TossType, number> = {
  straight: 1.0,
  arc: 1.05,
  backboard: 1.12,
};

// Modifier (Gap 5): mid-air second touch raises risk & reward. // TUNE(elijah)
export const MODIFIER_MULT: Record<DunkModifier, number> = {
  none: 1.0,
  double: 1.5,
  chained: 1.85,
};

// Zone hold-release windows (Gap 3): |offset| from the ideal release, seconds. // TUNE(elijah)
export const ZONE_WINDOWS = { perfect: 0.02, great: 0.06, good: 0.12 } as const;

// Timing point contribution + gate quality per grade. // TUNE(elijah)
export const TIMING_PTS: Record<TimingGrade, number> = { PERFECT: 1, GREAT: 0.5, GOOD: 0, MISS: -1 };
export const TIMING_QUALITY: Record<TimingGrade, number> = { PERFECT: 1, GREAT: 0.7, GOOD: 0.4, MISS: 0 };

// Final base->points scalar (kept so a plain PERFECT signature ~25pt, matching the
// pre-Phase-1 ceiling; the new multipliers are what let skilled play reach ~50). // TUNE(elijah)
export const DUNK_SCORE_SCALE = 5.2;

/** Gap 3 — grade a zone hold-release by |offset| (seconds) from the ideal moment. */
export function gradeZoneRelease(offsetSec: number): TimingGrade {
  const o = Math.abs(offsetSec);
  if (o <= ZONE_WINDOWS.perfect) return 'PERFECT';
  if (o <= ZONE_WINDOWS.great) return 'GREAT';
  if (o <= ZONE_WINDOWS.good) return 'GOOD';
  return 'MISS';
}

/** Gap 2 — reward the gather: launch from farther back = a bigger, committed dunk. // TUNE(elijah) */
export function approachMult(distM: number): number {
  return Math.min(1.25, Math.max(1.0, 1.0 + 0.12 * Math.max(0, distM - 2)));
}

/** Hang-time points, capped at 2 (~0.9s full hang). // TUNE(elijah) */
export function hangPoints(hangSec: number): number {
  return Math.min(hangSec / 0.9, 2);
}

export interface DunkScoreInput {
  hangSec: number;
  style: DunkStyle;
  timing: TimingGrade;
  approachDistM: number;
  toss: TossType;
  modifier: DunkModifier;
  comboMult: number;
}

export interface DunkScoreResult {
  made: boolean;
  total: number; // rounded 0.1, clamped >= 0
  base: number; // hang + complexity + timing (pre-multiplier)
  timingPts: number;
  quality: number; // 0..1 gate quality
  approachMult: number;
  tossMult: number;
  modifierMult: number;
}

/**
 * The single source of truth for a dunk's score. The live component still runs
 * its make/miss gate (attemptByQuality) and combo registration around this — this
 * function owns the *number*, deterministically, so the feel test can assert it.
 */
export function computeDunkScore(inp: DunkScoreInput): DunkScoreResult {
  const complexity = STYLE_COMPLEXITY[inp.style];
  const hp = hangPoints(inp.hangSec);
  const timingPts = TIMING_PTS[inp.timing];
  const quality = TIMING_QUALITY[inp.timing];
  const made = inp.timing !== 'MISS';
  const base = hp + complexity + timingPts;
  const aMult = approachMult(inp.approachDistM);
  const tMult = TOSS_MULT[inp.toss];
  const mMult = MODIFIER_MULT[inp.modifier];
  // A MISS scores nothing — the finish was blown. Positive base never leaks through.
  const raw = made ? base * aMult * tMult * mMult * inp.comboMult * DUNK_SCORE_SCALE : 0;
  const total = Math.max(Math.round(raw * 10) / 10, 0);
  return { made, total, base, timingPts, quality, approachMult: aMult, tossMult: tMult, modifierMult: mMult };
}

/** Map the component's legacy qteResult string to a TimingGrade ('' -> MISS). */
export function qteResultToGrade(r: string): TimingGrade {
  return r === 'PERFECT' ? 'PERFECT' : r === 'GREAT' ? 'GREAT' : r === 'GOOD' ? 'GOOD' : 'MISS';
}
