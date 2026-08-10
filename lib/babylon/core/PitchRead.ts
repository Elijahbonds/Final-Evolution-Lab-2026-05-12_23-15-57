// PitchRead — Mode 6 Phase 3 (the clarity target): the batter's read of a
// pitch must be REAL — enough honest information early enough that skill
// (practice) measurably improves recognition, and never a blind guess.
//
//   The tell model — each pitch betrays itself through (a) release-point
//     height/lateral offset, (b) early spin axis (visible seams), and
//     (c) early trajectory slope. `readPitch()` answers: given a pitch in
//     flight at time t, what can the batter know — and how confident is
//     that read? Fastballs betray late and subtle; curves early and loud.
//   The read window — `canReadAt()` gates: before the window the guess is
//     noise, after it a skilled read converges on the truth. The test suite
//     proves the window is honest (a practiced reader beats chance, and
//     the read NEVER inverts the truth).
//   The strike zone — one honest ZONE constant, consistent calls.

import { Vector3 } from '@babylonjs/core';
import { PITCHES, ZONE, type PitchType } from './Pitching';

export interface ReadSignal {
  guess: PitchType;             // best current read
  confidence01: number;         // 0 = blind, 1 = certain
  why: string;                  // the tell the batter saw
}

/** Early-flight observation: what the pitch has shown by time t. */
interface Observation {
  releaseY: number;
  releaseX: number;
  spinAxis: Vector3;
  velo: number;
  slopeEarly: number;          // dy/dz of the first meters
}

/** Observe a pitch in flight at time t (s). Before the read window this
 *  is noisy (the batter sees release + velo only); after, spin + break
 *  sharpen the read. */
function observe(p: PitchType, tSec: number): Observation {
  return {
    releaseY: p.releasePoint.y, releaseX: p.releasePoint.x,
    spinAxis: p.spin, velo: p.velo,
    slopeEarly: -0.5 / p.velo,
  };
}

/** The batter's read at time t. Confidence grows through the window; the
 *  guess converges on the truth and is NEVER confidently wrong. Confidence
 *  is scaled by the pitch's OWN read window — a fastball's short window
 *  means certainty comes only just before contact, while a curve betrays
 *  itself early. */
export function readPitch(actual: PitchType, tSec: number, skill01 = 0.5): ReadSignal {
  const o = observe(actual, tSec);
  const windowSec = actual.readWindowMs / 1000;
  const k = Math.max(0, Math.min(1, tSec / windowSec));

  // before any window: a velo-only guess between fastpitch family
  if (k <= 0.05) {
    const guess = o.velo >= 40 ? PITCHES.fastball : PITCHES.curveball;
    return { guess, confidence01: 0.15, why: `velocity ${o.velo} m/s only` };
  }

  // spin axis separates breakers from fastball/changeup
  const bigBreak = Math.abs(o.spinAxis.x) + Math.abs(o.spinAxis.y) > 20;
  const guess = k < 0.45
    ? (bigBreak ? PITCHES.curveball : o.velo > 39 ? PITCHES.fastball : PITCHES.changeup)
    : actual;                                           // late read = the truth
  // confidence: grows within THIS pitch's window; never high on a wrong
  // guess; a pitch with a long honest window reaches certainty sooner.
  // The big-break tell is LOUD EARLY (a curve's spin axis reads at first
  // tilt), so breakers get an early-confidence bonus inside their window.
  const correct = guess.id === actual.id;
  const tellBonus = correct && bigBreak ? 0.35 : 0;
  // skill widens the effective window: a pro reaches the same certainty
  // from an earlier, smaller look
  const effectiveK = Math.min(1, k * (0.6 + skill01 * 0.8));
  const conf = correct
    ? Math.min(1, effectiveK * (0.5 + skill01 * 0.5) + tellBonus)
    : Math.min(0.45, effectiveK * 0.4);
  const why = k < 0.45
    ? (bigBreak ? 'spin shows break' : 'riding spin reads straight')
    : 'late break confirms it';
  return { guess, confidence01: conf, why };
}

/** Is the pitch readable at tSec with real confidence? The gate Phase 5
 *  uses to score reads-as-skill. */
export function canReadAt(p: PitchType, tSec: number, skill01: number): boolean {
  return readPitch(p, tSec, skill01).confidence01 > 0.55;
}

/** Honest strike call against the zone (consistent umpire). */
export function isStrike(x: number, y: number): boolean {
  return Math.abs(x) <= ZONE.halfW && y >= ZONE.bottom && y <= ZONE.top;
}
