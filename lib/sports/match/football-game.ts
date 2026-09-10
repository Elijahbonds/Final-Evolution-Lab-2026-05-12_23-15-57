/**
 * lib/sports/match/football-game.ts
 * =================================
 * Football game structure: down -> drive -> possession -> game.
 *
 * FootballRushMode already runs real downs (1st and 10, four to convert) and
 * real drives, and its carrier geometry is proven. What it has no notion of is
 * a GAME: a touchdown simply starts another drive, and the session only ends
 * when the player finally fails on downs. There is no opponent, no scoreboard
 * and nothing to win — the audit's "full match mode integration pending".
 *
 * This adds the possession game above the drive: both sides get the same
 * number of possessions, drives resolve into real football points, and the
 * game is decided on the scoreboard. A tie goes to overtime possessions,
 * college style — each side gets the ball, and the first possession pair that
 * separates them ends it.
 *
 * Down-and-distance stays where it is, in the mode. This never touches it.
 */

import type { MatchEngine, MatchProgress, Side } from './types';

/** How a drive ended. Points follow the real game. */
export type DriveOutcome = 'touchdown' | 'field-goal' | 'safety' | 'turnover' | 'downs' | 'punt';

export const DRIVE_POINTS: Record<DriveOutcome, number> = {
  // Touchdown carries the extra point: this mode has no kick minigame, and a
  // 6 that is really always 7 would misreport every score line.
  touchdown: 7,
  'field-goal': 3,
  // A safety scores for the DEFENDING side — handled in `resolveDrive`.
  safety: 2,
  turnover: 0,
  downs: 0,
  punt: 0,
};

export interface FootballGameOptions {
  /** Possessions per side in regulation. */
  possessions?: number;
  /** Play overtime possessions when tied. */
  overtime?: boolean;
  /** Ceiling on overtime rounds so a tie cannot run forever. */
  maxOvertimeRounds?: number;
}

export interface DriveRecord {
  side: Side;
  outcome: DriveOutcome;
  points: number;
  possession: number;
  overtime: boolean;
}

export type DriveResult = 'drive' | 'possession-pair' | 'game';

export class FootballGame implements MatchEngine {
  readonly possessions: number;
  readonly overtime: boolean;
  readonly maxOvertimeRounds: number;

  points: [number, number] = [0, 0];
  used: [number, number] = [0, 0];
  drives: DriveRecord[] = [];
  /** Who has the ball. The player receives first. */
  offense: Side = 0;

  private done = false;
  private winnerSide: Side | null = null;
  private otRounds = 0;

  constructor(o: FootballGameOptions = {}) {
    this.possessions = Math.max(1, o.possessions ?? 3);
    this.overtime = o.overtime ?? true;
    this.maxOvertimeRounds = Math.max(1, o.maxOvertimeRounds ?? 2);
  }

  get complete(): boolean {
    return this.done;
  }

  get winner(): Side | null {
    return this.winnerSide;
  }

  get inOvertime(): boolean {
    return this.otRounds > 0;
  }

  /** Possessions `side` has left in regulation. */
  remaining(side: Side): number {
    return Math.max(0, this.possessions - this.used[side]);
  }

  /**
   * Resolve the drive currently in progress. Returns what it closed, so the
   * mode knows whether to hand the ball over, start the next pair, or end.
   */
  resolveDrive(outcome: DriveOutcome): DriveResult {
    if (this.done) return 'game';
    const side = this.offense;
    const defense = (1 - side) as Side;
    const value = DRIVE_POINTS[outcome];

    // A safety is the one outcome that scores for the side without the ball.
    if (outcome === 'safety') this.points[defense] += value;
    else this.points[side] += value;

    this.used[side]++;
    this.drives.push({
      side,
      outcome,
      points: value,
      possession: this.used[side],
      overtime: this.inOvertime,
    });

    // The player always has the ball first, so a pair closes when side 1 ends.
    if (side === 0) {
      this.offense = 1;
      // Regulation can still be clinched mid-pair: if the opponent cannot
      // catch up even by scoring a touchdown on every possession it has left,
      // there is nothing left to play for.
      if (!this.inOvertime && this.clinched()) {
        this.finish(this.points[0] > this.points[1] ? 0 : 1);
        return 'game';
      }
      return 'drive';
    }

    this.offense = 0;

    if (this.inOvertime) {
      if (this.points[0] !== this.points[1]) {
        this.finish(this.points[0] > this.points[1] ? 0 : 1);
        return 'game';
      }
      if (this.otRounds >= this.maxOvertimeRounds) {
        this.finish(null);
        return 'game';
      }
      this.otRounds++;
      return 'possession-pair';
    }

    if (this.remaining(0) === 0 && this.remaining(1) === 0) {
      if (this.points[0] !== this.points[1]) {
        this.finish(this.points[0] > this.points[1] ? 0 : 1);
        return 'game';
      }
      if (!this.overtime) {
        this.finish(null);
        return 'game';
      }
      this.otRounds = 1;
      return 'possession-pair';
    }

    if (this.clinched()) {
      this.finish(this.points[0] > this.points[1] ? 0 : 1);
      return 'game';
    }
    return 'possession-pair';
  }

  /** Can the trailing side still reach the leader with what it has left? */
  private clinched(): boolean {
    const lead = this.points[0] - this.points[1];
    if (lead === 0) return false;
    const trailing: Side = lead > 0 ? 1 : 0;
    const best = this.remaining(trailing) * DRIVE_POINTS.touchdown;
    return Math.abs(lead) > best;
  }

  private finish(winner: Side | null): void {
    this.done = true;
    this.winnerSide = winner;
  }

  get scoreLine(): string {
    return `${this.points[0]}-${this.points[1]}`;
  }

  progress(): MatchProgress {
    const poss = Math.min(this.used[this.offense] + 1, this.possessions);
    return {
      line: this.scoreLine,
      detail: this.done
        ? this.winnerSide === null
          ? 'TIE GAME'
          : this.winnerSide === 0
            ? 'GAME WON'
            : 'GAME LOST'
        : this.inOvertime
          ? `OVERTIME ${this.otRounds} · ${this.offense === 0 ? 'your ball' : 'their ball'}`
          : `Possession ${poss}/${this.possessions} · ${this.offense === 0 ? 'your ball' : 'their ball'}`,
      complete: this.done,
      winner: this.winnerSide,
      summary: this.done
        ? `${this.scoreLine}${this.inOvertime ? ' (OT)' : ''}`
        : this.scoreLine,
      score: this.points[0] * 8 + (this.winnerSide === 0 ? 60 : 0),
    };
  }
}
