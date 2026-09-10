/**
 * lib/sports/match/golf-round.ts
 * ==============================
 * Golf round structure: stroke -> hole -> nine -> round.
 *
 * GolfScoring already has a `Scorecard` (strokes vs par, to-par, derived
 * labels) and it is verified — but the live GolfMode never used it. The mode
 * plays three one-shot "holes" and awards arcade points by proximity, so a
 * player cannot take three strokes to reach a green, cannot card a bogey, and
 * never finishes a round. That is the whole of the audit's "full 18-hole round
 * mode pending".
 *
 * This wraps Scorecard in the missing round structure: a course of holes
 * played in order, strokes accumulating per hole, a stroke cap so a disastrous
 * hole cannot stall the session, front/back nine splits, and a finished round
 * that reports to par.
 */

import { Scorecard, scoreLabel, isGameBreaker, type HoleScore } from '@/lib/babylon/core/GolfScoring';
import type { MatchEngine, MatchProgress } from './types';

/** The minimum a hole needs to be playable here: an id and a par. */
export interface RoundHole {
  id: string;
  par: number;
}

export interface GolfRoundOptions {
  /** Holes in order. 9 or 18 in practice; any length works. */
  holes: RoundHole[];
  /**
   * Strokes after which a hole is picked up and carded. Real golf has no cap,
   * but an unbounded hole can strand a session — a triple-bogey ceiling keeps
   * a bad hole bad without letting it become endless. Relative to par.
   */
  maxOverPar?: number;
}

export type StrokeResult = 'stroke' | 'holed' | 'picked-up' | 'round-complete';

export class GolfRound implements MatchEngine {
  readonly holes: RoundHole[];
  readonly maxOverPar: number;
  readonly card = new Scorecard();

  /** Index of the hole being played. */
  holeIndex = 0;
  /** Strokes taken on the current hole. */
  strokes = 0;
  /** Set on the stroke that finished a hole, for the mode's banner. */
  lastHole: (HoleScore & { label: string; gameBreaker: boolean }) | null = null;

  private done = false;

  constructor(o: GolfRoundOptions) {
    if (o.holes.length === 0) throw new Error('GolfRound needs at least one hole');
    this.holes = o.holes;
    this.maxOverPar = Math.max(1, o.maxOverPar ?? 3);
  }

  get complete(): boolean {
    return this.done;
  }

  /** The hole being played, or the last hole once the round is over. */
  get hole(): RoundHole {
    return this.holes[Math.min(this.holeIndex, this.holes.length - 1)];
  }

  /** Strokes at which the current hole is picked up. */
  get pickUpAt(): number {
    return this.hole.par + this.maxOverPar;
  }

  /**
   * Record one stroke. `holed` says whether the ball finished in the cup.
   * Returns what the stroke did, so the mode can play the right beat and know
   * whether to set up the next hole.
   */
  stroke(holed: boolean): StrokeResult {
    if (this.done) return 'round-complete';
    this.strokes++;

    if (!holed && this.strokes < this.pickUpAt) return 'stroke';

    // The hole is finished: either holed out, or picked up at the cap. A
    // picked-up hole cards the cap itself, which is the score the player
    // actually took to that point.
    const par = this.hole.par;
    const score = this.card.record({ id: this.hole.id, par }, this.strokes);
    this.lastHole = {
      ...score,
      label: scoreLabel(par, this.strokes),
      gameBreaker: holed && isGameBreaker(par, this.strokes),
    };
    const result: StrokeResult = holed ? 'holed' : 'picked-up';

    this.holeIndex++;
    this.strokes = 0;
    if (this.holeIndex >= this.holes.length) {
      this.done = true;
      return 'round-complete';
    }
    return result;
  }

  /** Total par for the holes carded so far. */
  get parThrough(): number {
    return this.card.holes.reduce((n, h) => n + h.par, 0);
  }

  /** Total strokes carded so far. */
  get totalStrokes(): number {
    return this.card.holes.reduce((n, h) => n + h.strokes, 0);
  }

  /** To-par over the first nine carded holes (or fewer, mid-round). */
  get frontNine(): number {
    return this.card.holes.slice(0, 9).reduce((n, h) => n + h.strokes - h.par, 0);
  }

  /** To-par over holes 10-18. */
  get backNine(): number {
    return this.card.holes.slice(9, 18).reduce((n, h) => n + h.strokes - h.par, 0);
  }

  /** "-2", "E", "+5" — the way a leaderboard prints it. */
  static toParLabel(toPar: number): string {
    if (toPar === 0) return 'E';
    return toPar > 0 ? `+${toPar}` : `${toPar}`;
  }

  progress(): MatchProgress {
    const toPar = this.card.toPar;
    const label = GolfRound.toParLabel(toPar);
    const holeNo = Math.min(this.holeIndex + 1, this.holes.length);
    return {
      line: this.done
        ? `${this.totalStrokes} (${label})`
        : `THRU ${this.card.through} · ${label}`,
      detail: this.done
        ? `Round complete · ${this.holes.length} holes`
        : `Hole ${holeNo} · Par ${this.hole.par} · stroke ${this.strokes + 1}`,
      complete: this.done,
      // A round is played against the course, not an opponent.
      winner: null,
      summary: this.done ? `${this.totalStrokes} (${label}) thru ${this.holes.length}` : `THRU ${this.card.through} ${label}`,
      // Par is the reference point, so par scores near 100 and every stroke
      // saved is worth more than any proximity bonus could be.
      score: Math.max(0, 100 - toPar * 8),
    };
  }
}
