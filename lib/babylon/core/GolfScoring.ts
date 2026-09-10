// GolfScoring — Golf Phases 4+5: scoring on the shared Judge/Scoring
// discipline (scorecard math is data + pure functions, no parallel logic),
// PRQ mapping, and the golf Game-Breaker definition.
//
//   Scorecard — strokes vs par per hole; to-par total; birdie/eagle/ace
//     labels are derived, never hardcoded.
//   PRQ — golf trains PRECISION and CONSISTENCY (low kinetic/combat load):
//     the mapping is a declared, reviewable table, and Influence gain is
//     deliberately capped vs contact modes (a round of golf must not
//     out-earn a fight). [TUNE] all values.
//   Game-Breaker for golf — a golf "highlight" is an eagle-or-better or a
//     clutch long putt: the MomentumBus event is 'big_make' with an
//     eagle/ace weight, and the CameraDirector pulse plays the beat.
//     (Definition confirmed per the prompt's flag: golf has no contact
//     momentum, so the Game-Breaker moment is score-shock, not collision.)

import type { HoleDef } from './GolfCourse';

export interface HoleScore { holeId: string; par: number; strokes: number }

/**
 * The only part of a hole the card needs. Widened from HoleDef so a round can
 * card a hole it knows the par of without carrying the full 3D definition
 * (zones, tee/pin coordinates) — every HoleDef still satisfies it.
 */
export type CardableHole = { id: string; par: number };

export function scoreLabel(par: number, strokes: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'HOLE IN ONE';
  if (d <= -3) return 'ALBATROSS';
  if (d === -2) return 'EAGLE';
  if (d === -1) return 'BIRDIE';
  if (d === 0) return 'PAR';
  if (d === 1) return 'BOGEY';
  if (d === 2) return 'DOUBLE';
  return `+${d}`;
}

export class Scorecard {
  holes: HoleScore[] = [];
  record(hole: CardableHole, strokes: number): HoleScore {
    const s = { holeId: hole.id, par: hole.par, strokes };
    this.holes.push(s);
    return s;
  }
  get toPar(): number { return this.holes.reduce((s, h) => s + h.strokes - h.par, 0); }
  get through(): number { return this.holes.length; }
  get best(): HoleScore | null {
    return this.holes.reduce<HoleScore | null>((b, h) => (!b || h.strokes - h.par < b.strokes - b.par) ? h : b, null);
  }
}

/** Is this score a Game-Breaker beat? (eagle or better, or an ace) */
export function isGameBreaker(par: number, strokes: number): boolean {
  return strokes - par <= -2 || strokes === 1;
}

/** PRQ mapping for golf — declared and reviewable. [TUNE] */
export const GOLF_PRQ = {
  precision: 0.8,        // shot dispersion + putting
  consistency: 0.9,      // score variance across holes
  kinetic: 0.1,          // minimal
  combat: 0.0,
  creativity: 0.2,       // shot shaping
} as const;

/** Influence gain cap relative to contact modes: a great golf round is
 *  worth AT MOST 60% of a great contact-mode session. [TUNE] */
export const GOLF_INFLUENCE_CAP = 0.6;
