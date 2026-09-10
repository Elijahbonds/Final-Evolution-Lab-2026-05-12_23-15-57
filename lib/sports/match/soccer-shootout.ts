/**
 * lib/sports/match/soccer-shootout.ts
 * ===================================
 * Soccer shootout structure: kick -> round -> shootout.
 *
 * PenaltyMode plays a fixed five kicks and totals goals plus style points, so
 * it never clinches early and never goes to sudden death — the two things that
 * make a shootout a shootout. The kick mechanic itself (feints, keeper commit)
 * is proven and untouched here.
 *
 * The real rules this adds:
 *   - Kicks alternate; the player goes first.
 *   - A shootout ENDS the moment one side cannot be caught, even mid-round.
 *     That is the tension the fixed-five loop had no way to express.
 *   - Level after the regulation rounds goes to sudden death, decided on the
 *     first round where one side scores and the other does not.
 */

import type { MatchEngine, MatchProgress, Side } from './types';
import { other } from './types';

export interface ShootoutOptions {
  /** Kicks each before sudden death. Five is the laws-of-the-game number. */
  rounds?: number;
  /** Ceiling on sudden-death rounds so a session cannot run forever. */
  maxSuddenDeath?: number;
}

export interface Kick {
  side: Side;
  scored: boolean;
  round: number;
  suddenDeath: boolean;
}

export type KickResult = 'kick' | 'round' | 'shootout';

export class SoccerShootout implements MatchEngine {
  readonly rounds: number;
  readonly maxSuddenDeath: number;

  goals: [number, number] = [0, 0];
  taken: [number, number] = [0, 0];
  kicks: Kick[] = [];
  /** Whose turn it is. The player always kicks first. */
  turn: Side = 0;
  /** 1-based round; rounds beyond `rounds` are sudden death. */
  round = 1;

  private done = false;
  private winnerSide: Side | null = null;

  constructor(o: ShootoutOptions = {}) {
    this.rounds = Math.max(1, o.rounds ?? 5);
    this.maxSuddenDeath = Math.max(1, o.maxSuddenDeath ?? 5);
  }

  get complete(): boolean {
    return this.done;
  }

  get winner(): Side | null {
    return this.winnerSide;
  }

  get inSuddenDeath(): boolean {
    return this.round > this.rounds;
  }

  /** Kicks `side` has left in regulation. Zero once sudden death begins. */
  remaining(side: Side): number {
    return Math.max(0, this.rounds - this.taken[side]);
  }

  /**
   * Can `side` still be caught? A shootout is decided the moment the trailing
   * side cannot reach the leader even by scoring every kick it has left.
   */
  private clinched(): Side | null {
    if (this.inSuddenDeath) return null;
    for (const s of [0, 1] as Side[]) {
      const foe = other(s);
      if (this.goals[s] > this.goals[foe] + this.remaining(foe)) return s;
    }
    return null;
  }

  /** Take the next kick for whoever is on. Returns what it closed. */
  take(scored: boolean): KickResult {
    if (this.done) return 'shootout';
    const side = this.turn;
    this.taken[side]++;
    if (scored) this.goals[side]++;
    this.kicks.push({ side, scored, round: this.round, suddenDeath: this.inSuddenDeath });

    const decided = this.clinched();
    if (decided !== null) {
      this.finish(decided);
      return 'shootout';
    }

    // Second kicker of the round just went.
    if (side === 1) {
      const suddenDeath = this.inSuddenDeath;
      this.round++;
      this.turn = 0;

      if (suddenDeath) {
        // Sudden death is decided on any round the sides split.
        if (this.goals[0] !== this.goals[1]) {
          this.finish(this.goals[0] > this.goals[1] ? 0 : 1);
          return 'shootout';
        }
        if (this.round > this.rounds + this.maxSuddenDeath) {
          this.finish(null); // still level at the ceiling
          return 'shootout';
        }
      } else if (this.round > this.rounds) {
        // Regulation is over. A difference here would already have clinched.
        if (this.goals[0] !== this.goals[1]) {
          this.finish(this.goals[0] > this.goals[1] ? 0 : 1);
          return 'shootout';
        }
      }
      return 'round';
    }

    this.turn = 1;
    return 'kick';
  }

  private finish(winner: Side | null): void {
    this.done = true;
    this.winnerSide = winner;
  }

  get scoreLine(): string {
    return `${this.goals[0]}-${this.goals[1]}`;
  }

  progress(): MatchProgress {
    return {
      line: this.scoreLine,
      detail: this.done
        ? this.winnerSide === null
          ? 'LEVEL — NO WINNER'
          : this.winnerSide === 0
            ? 'SHOOTOUT WON'
            : 'SHOOTOUT LOST'
        : this.inSuddenDeath
          ? `SUDDEN DEATH · round ${this.round - this.rounds}`
          : `Round ${this.round}/${this.rounds} · ${this.turn === 0 ? 'your kick' : 'keeper up'}`,
      complete: this.done,
      winner: this.winnerSide,
      summary: this.done
        ? `${this.scoreLine}${this.inSuddenDeath ? ' (sudden death)' : ''}`
        : this.scoreLine,
      score: this.goals[0] * 20 + (this.winnerSide === 0 ? 60 : 0),
    };
  }
}
