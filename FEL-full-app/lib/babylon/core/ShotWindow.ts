// THE RELEASE WINDOW, READ FINER (lane/hoops-shot-core, owner 2026-10-20).
//
// Two things the 1v1 / 3v3 hero's meter did not do, both PRESENTATION or WINDOW only — SHOT_QUALITY_PCT is untouched:
//
// 1. DISTANCE NARROWS THE GREEN. The shootout already does it (ThreePointMode.distanceContestForRack: the rack's distance is
//    read as contest × 0.4, so the deepest rack's green is up to 22 % narrower). In 1v1 and 3v3 a 2 m jumper and a 7.5 m one
//    had the same window. Here the hero's green is narrowed with the distance to the rim, linearly from DIST_GREEN.nearM
//    (no change) to DIST_GREEN.farM (narrowest), by at most DIST_GREEN.maxNarrow — the shootout's own maximum, 22 %.
//    Only the WIDTH moves: the rise (which paces the release clip) is not shortened, unlike the shootout's contest path,
//    because the 1v1 / 3v3 rise is a tuned timing. Perfect timing pays exactly what it paid (perfect is still 0.97, and the
//    perfect band is still the inner PERFECT_BAND_SHARE of whatever green there is).
//    Finishes (layups, floaters, hooks …) are graded on their own forgiving bars and are not narrowed: distance is a
//    jump shot's problem.
//
// 2. FINER GRADES ON THE BANNER. A release in the green but outside the perfect band ('good', 0.80) said nothing at all;
//    only GREEN / EARLY / LATE / WAY LATE were ever named. It now reads SLIGHTLY EARLY / SLIGHTLY LATE with the miss in ms,
//    so a player can see which way they lean. The grade itself — and so the make odds — is the meter's, unchanged.
//
// Pure: no Babylon, no scene. Gameplay numbers are flagged `TUNED (new)` and routed to the feel panel (lane/feel-panel had not
// landed when this was written — register them as 'hoops.distGreen*' knobs when it does).

import type { ShotQuality, ShotStyle } from './BasketballCore';
import { PERFECT_BAND_SHARE } from './shotBands';

/** TUNED (new): the distance narrowing. Knob candidates: hoops.distGreenNearM, hoops.distGreenFarM, hoops.distGreenMaxNarrow. */
export const DIST_GREEN = {
  /** At or inside this rim distance (m) the green is untouched. */
  nearM: 2.0,
  /** At or beyond this rim distance (m) the green is at its narrowest (a deep three). */
  farM: 7.5,
  /** The most the green narrows: 0.22 = the shootout's own deepest-rack narrowing (0.4 × 0.05 of its 0.09 half-width). */
  maxNarrow: 0.22,
} as const;

/** The styles distance narrows: the jump shots. Every finish keeps the bar it was tuned with. */
const JUMP_SHOTS: ReadonlySet<ShotStyle> = new Set<ShotStyle>(['jumper', 'fadeaway']);

/** The factor (≤ 1) the green half-width is multiplied by for a shot from `distM` metres off the rim. */
export function distanceGreenFactor(distM: number, style: ShotStyle = 'jumper'): number {
  if (!JUMP_SHOTS.has(style) || !Number.isFinite(distM)) return 1;
  const k = Math.max(0, Math.min(1, (distM - DIST_GREEN.nearM) / (DIST_GREEN.farM - DIST_GREEN.nearM)));
  return 1 - DIST_GREEN.maxNarrow * k;
}

/** Below this offset the finer grade is not shown (a release that is "slightly" off by 0 ms is a rounding artefact). */
const MIN_SHOWN_MS = 1;

/**
 * The banner for a GOOD release — inside the green, outside the perfect band: "SLIGHTLY EARLY (−31 ms)" / "SLIGHTLY LATE (+28 ms)".
 * Null for every other grade (they keep their own words) and for an offset that does not fit a good release (a non-meter
 * release path that graded 'good' on its own: the meter's number would describe a different shot, so nothing is claimed).
 */
export function releaseGradeLabel(quality: ShotQuality, offsetSec: number, greenHalfSec: number): string | null {
  if (quality !== 'good' || !Number.isFinite(offsetSec) || !(greenHalfSec > 0)) return null;
  const a = Math.abs(offsetSec);
  if (a > greenHalfSec * 1.0001 || a < greenHalfSec * PERFECT_BAND_SHARE * 0.9999) return null;
  const ms = Math.round(a * 1000);
  if (ms < MIN_SHOWN_MS) return null;
  return offsetSec < 0 ? `SLIGHTLY EARLY (−${ms} ms)` : `SLIGHTLY LATE (+${ms} ms)`;
}

/** The HUD's perfect band (lane/hoops-shot-core): the perfect half-width on the 0..1 bar, published as `shotMeterPerfect` beside the
 *  green ("center,half") so the HUD bar draws exactly the band release() grades. A dunk's bar has no such band: it publishes ''. */
export function perfectHud(greenHalfWidth01: number): string {
  return (greenHalfWidth01 * PERFECT_BAND_SHARE).toFixed(3);
}
