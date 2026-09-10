/**
 * lib/sports/match/baseball-game.ts
 * =================================
 * Baseball game structure: plate appearance -> out -> half-inning -> inning ->
 * game.
 *
 * The live baseball route runs DerbyMode: swing at N pitches, count the home
 * runs. Batting, ContactSystem and PitchRead are all proven — what is missing
 * is the game around them, which is why the audit lists baseball as "core
 * (PCI + explained contact)" with "full game-loop integration pending".
 *
 * This owns the structure only: who is batting, outs, innings, runs, and the
 * rules that actually decide a baseball game — a home team that does not bat
 * in the bottom of the last inning when it is already ahead, a walk-off that
 * ends the game the instant the run scores, and extra innings on a tie.
 *
 * Sides follow the house convention: 0 is the player, 1 is the opponent. The
 * player is the HOME side, so the player bats in the bottom half and gets the
 * walk-off.
 */

import type { MatchEngine, MatchProgress, Side } from './types';

export type Half = 'top' | 'bottom';

export interface BaseballGameOptions {
  /** Regulation innings. 9 in the real game; 3 makes a session-length game. */
  innings?: number;
  /** Outs per half-inning. */
  outsPerHalf?: number;
  /** Play extra innings when tied after regulation. */
  extraInnings?: boolean;
  /** Hard ceiling on innings so a tie cannot run forever. */
  maxInnings?: number;
}

export type PlayResult = 'play' | 'half-inning' | 'inning' | 'game';

/** What a plate appearance produced. */
export type HitType = 'single' | 'double' | 'triple' | 'homer';

/** How many bases each hit advances every runner, and the batter. */
const ADVANCE: Record<HitType, number> = { single: 1, double: 2, triple: 3, homer: 4 };

export class BaseballGame implements MatchEngine {
  readonly regulation: number;
  readonly outsPerHalf: number;
  readonly extraInnings: boolean;
  readonly maxInnings: number;

  /** 1-based inning number. */
  inning = 1;
  half: Half = 'top';
  outs = 0;
  /** Runs by side; 0 = player (home), 1 = opponent (away). */
  runs: [number, number] = [0, 0];
  /** Runs per half-inning, in order, for a line score. */
  lineScore: { inning: number; half: Half; runs: number }[] = [];
  /**
   * Occupied bases: [first, second, third]. Runners are what make outs cost
   * something and make a hit worth more than the last one — without them a
   * "game" is just a counter with innings drawn on it.
   */
  bases: [boolean, boolean, boolean] = [false, false, false];

  private done = false;
  private winnerSide: Side | null = null;
  private walkOff = false;

  constructor(o: BaseballGameOptions = {}) {
    this.regulation = Math.max(1, o.innings ?? 3);
    this.outsPerHalf = Math.max(1, o.outsPerHalf ?? 3);
    this.extraInnings = o.extraInnings ?? true;
    this.maxInnings = Math.max(this.regulation, o.maxInnings ?? this.regulation + 3);
  }

  get complete(): boolean {
    return this.done;
  }

  get winner(): Side | null {
    return this.winnerSide;
  }

  /** True when the game ended on a walk-off run. */
  get wonOnWalkOff(): boolean {
    return this.walkOff;
  }

  /** The side currently batting. Away (1) bats the top, home (0) the bottom. */
  get batting(): Side {
    return this.half === 'top' ? 1 : 0;
  }

  private halfRuns = 0;

  /**
   * Score `n` runs for the batting side. Returns 'game' if this ended it —
   * a walk-off is checked the moment the run crosses, before any out.
   */
  score(n = 1): PlayResult {
    if (this.done || n <= 0) return this.done ? 'game' : 'play';
    const side = this.batting;
    this.runs[side] += n;
    this.halfRuns += n;

    // Walk-off: home takes the lead in the bottom of the last (or an extra)
    // inning and the game stops there.
    if (
      this.half === 'bottom' &&
      this.inning >= this.regulation &&
      this.runs[0] > this.runs[1]
    ) {
      this.closeHalf();
      this.walkOff = true;
      this.finish(0);
      return 'game';
    }
    return 'play';
  }

  /**
   * A hit by the batting side. Runners advance by the hit's bases, anyone
   * past third scores, and the batter takes the base they earned. Returns the
   * runs it drove in and what, if anything, it closed — a walk-off ends the
   * game on the hit itself.
   */
  hit(type: HitType): { runs: number; result: PlayResult } {
    if (this.done) return { runs: 0, result: 'game' };
    const advance = ADVANCE[type];
    let scored = 0;

    // Walk the bases from third down so runners never overwrite each other.
    for (let base = 2; base >= 0; base--) {
      if (!this.bases[base]) continue;
      this.bases[base] = false;
      const to = base + advance;
      if (to >= 3) scored++;
      else this.bases[to] = true;
    }
    // The batter ends up on the base the hit was worth; a homer scores.
    if (advance >= 4) scored++;
    else this.bases[advance - 1] = true;

    const result = scored > 0 ? this.score(scored) : 'play';
    return { runs: scored, result };
  }

  /** Runners currently on base. */
  get runnersOn(): number {
    return this.bases.filter(Boolean).length;
  }

  /** Record an out. Returns the highest level that closed. */
  out(): PlayResult {
    if (this.done) return 'game';
    this.outs++;
    if (this.outs < this.outsPerHalf) return 'play';
    return this.endHalf();
  }

  /** Close the current half-inning and decide what comes next. */
  private endHalf(): PlayResult {
    this.closeHalf();
    this.outs = 0;

    if (this.half === 'top') {
      // Home does not bat in the bottom of the last inning when already ahead.
      if (this.inning >= this.regulation && this.runs[0] > this.runs[1]) {
        this.finish(0);
        return 'game';
      }
      this.half = 'bottom';
      return 'half-inning';
    }

    // Bottom half just ended.
    if (this.inning >= this.regulation && this.runs[0] !== this.runs[1]) {
      this.finish(this.runs[0] > this.runs[1] ? 0 : 1);
      return 'game';
    }
    if (this.inning >= this.regulation && !this.extraInnings) {
      this.finish(null); // a tie, when extras are off
      return 'game';
    }
    if (this.inning >= this.maxInnings) {
      this.finish(this.runs[0] === this.runs[1] ? null : this.runs[0] > this.runs[1] ? 0 : 1);
      return 'game';
    }
    this.inning++;
    this.half = 'top';
    return 'inning';
  }

  private closeHalf(): void {
    this.lineScore.push({ inning: this.inning, half: this.half, runs: this.halfRuns });
    this.halfRuns = 0;
    // Runners do not carry across a half-inning.
    this.bases = [false, false, false];
  }

  private finish(winner: Side | null): void {
    this.done = true;
    this.winnerSide = winner;
  }

  /** "3-2", the way a final reads. Player's runs first. */
  get scoreLine(): string {
    return `${this.runs[0]}-${this.runs[1]}`;
  }

  progress(): MatchProgress {
    const arrow = this.half === 'top' ? '▲' : '▼';
    return {
      line: this.scoreLine,
      detail: this.done
        ? this.winnerSide === null
          ? 'TIE GAME'
          : this.walkOff
            ? 'WALK-OFF WIN'
            : this.winnerSide === 0
              ? 'GAME WON'
              : 'GAME LOST'
        : `${arrow} ${this.inning} · ${this.outs} out${this.outs === 1 ? '' : 's'}${
            this.runnersOn ? ` · ${this.runnersOn} on` : ''
          }`,
      complete: this.done,
      winner: this.winnerSide,
      summary: this.done
        ? `${this.scoreLine}${this.walkOff ? ' (walk-off)' : ''} in ${this.inning}`
        : `${this.scoreLine} ${arrow}${this.inning}`,
      // Runs are the sport's own unit; the win bonus is what makes a 2-1 game
      // worth more than a 6-8 loss.
      score: this.runs[0] * 15 + (this.winnerSide === 0 ? 60 : 0),
    };
  }
}
