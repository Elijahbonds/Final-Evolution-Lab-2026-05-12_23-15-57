/**
 * lib/sports/match/tennis-match.ts
 * ================================
 * Tennis match structure: point -> game -> set -> match.
 *
 * RallyCore's `TennisScore` already owns points within a game, including
 * deuce and advantage, and TennisMode is configured "first to 4 games". That
 * is one abbreviated set, which is why the audit still lists tennis as core-
 * only. This adds the levels above it: sets won by two games, a tiebreak when
 * a set reaches 6-6, and a best-of-N match.
 *
 * NOTE ON SHORT CONFIGS: the two-game margin applies at every set target, so
 * a mode configured "first to 4 games" does not end at 4-3 — it plays on to
 * 5-3, or to a tiebreak at 4-4 when one is enabled. That is the rule that
 * makes a set a set rather than a first-to-N counter, and it means a set
 * target of 1 cannot be reached at 1-0. Pick a target of 2 or more.
 *
 * Point scoring is NOT reimplemented here. The game-level rule (4 points, win
 * by 2) is stated once in `awardPoint` and matches TennisScore exactly, so the
 * two cannot drift; everything above the game is new.
 */

import type { MatchEngine, MatchProgress, Side } from './types';
import { other } from './types';

const POINT_NAMES = ['0', '15', '30', '40'];

export interface TennisMatchOptions {
  /** Sets needed to take the match. 2 = best of three. */
  setsToWin?: number;
  /** Games needed to take a set, subject to the two-game margin. */
  gamesPerSet?: number;
  /** Play a tiebreak at gamesPerSet-all instead of playing on indefinitely. */
  tiebreak?: boolean;
  /** Points to take a tiebreak, subject to a two-point margin. */
  tiebreakPoints?: number;
}

export interface CompletedSet {
  games: [number, number];
  /** Tiebreak points, when the set was decided by one. */
  tiebreak?: [number, number];
  winner: Side;
}

export type PointResult = 'point' | 'game' | 'set' | 'match';

export class TennisMatch implements MatchEngine {
  readonly setsToWin: number;
  readonly gamesPerSet: number;
  readonly useTiebreak: boolean;
  readonly tiebreakPoints: number;

  /** Points in the current game (or the current tiebreak). */
  points: [number, number] = [0, 0];
  /** Games in the current set. */
  games: [number, number] = [0, 0];
  /** Sets won. */
  sets: [number, number] = [0, 0];
  /** Finished sets, in order. */
  completedSets: CompletedSet[] = [];
  /** True while the current game is a tiebreak. */
  inTiebreak = false;

  private done = false;
  private winnerSide: Side | null = null;

  constructor(o: TennisMatchOptions = {}) {
    this.setsToWin = Math.max(1, o.setsToWin ?? 2);
    this.gamesPerSet = Math.max(1, o.gamesPerSet ?? 6);
    this.useTiebreak = o.tiebreak ?? true;
    this.tiebreakPoints = Math.max(1, o.tiebreakPoints ?? 7);
  }

  get complete(): boolean {
    return this.done;
  }

  get winner(): Side | null {
    return this.winnerSide;
  }

  /**
   * Award one point. Returns the highest level that closed on this point, so
   * a mode can play the matching beat: a game banner, a set banner, the match
   * whistle. A point awarded after the match is over is ignored.
   */
  awardPoint(side: Side): PointResult {
    if (this.done) return 'match';
    const foe = other(side);
    this.points[side]++;

    const target = this.inTiebreak ? this.tiebreakPoints : 4;
    const won = this.points[side] >= target && this.points[side] - this.points[foe] >= 2;
    if (!won) return 'point';

    // The game (or tiebreak) is taken.
    const tiebreakScore: [number, number] | undefined = this.inTiebreak
      ? [this.points[0], this.points[1]]
      : undefined;
    this.games[side]++;
    this.points = [0, 0];
    this.inTiebreak = false;

    if (!this.setWon(side)) {
      // A set can also reach the tiebreak trigger without being won.
      if (
        this.useTiebreak &&
        this.games[0] === this.gamesPerSet &&
        this.games[1] === this.gamesPerSet
      ) {
        this.inTiebreak = true;
      }
      return 'game';
    }

    this.completedSets.push({
      games: [this.games[0], this.games[1]],
      ...(tiebreakScore ? { tiebreak: tiebreakScore } : {}),
      winner: side,
    });
    this.sets[side]++;
    this.games = [0, 0];

    if (this.sets[side] >= this.setsToWin) {
      this.done = true;
      this.winnerSide = side;
      return 'match';
    }
    return 'set';
  }

  /** Has `side` just taken the current set? */
  private setWon(side: Side): boolean {
    const foe = other(side);
    const mine = this.games[side];
    const theirs = this.games[foe];
    if (mine < this.gamesPerSet) return false;
    if (mine - theirs >= 2) return true;
    // A tiebreak set is won at gamesPerSet+1 games (7-6 in a standard set).
    return this.useTiebreak && mine === this.gamesPerSet + 1 && theirs === this.gamesPerSet;
  }

  /**
   * The umpire's call for the current game from `side`'s perspective:
   * "40-30", "DEUCE", "AD IN" / "AD OUT", or the running tiebreak score.
   */
  callFor(side: Side): string {
    const mine = this.points[side];
    const theirs = this.points[other(side)];
    if (this.inTiebreak) return `TIEBREAK ${mine}-${theirs}`;
    if (mine >= 3 && theirs >= 3) {
      if (mine === theirs) return 'DEUCE';
      return mine > theirs ? 'AD IN' : 'AD OUT';
    }
    return `${POINT_NAMES[Math.min(3, mine)]}-${POINT_NAMES[Math.min(3, theirs)]}`;
  }

  /** Set scores so far, e.g. "6-4 3-6" plus the set in progress. */
  setLine(): string {
    const done = this.completedSets.map((s) =>
      s.tiebreak ? `${s.games[0]}-${s.games[1]}(${Math.min(...s.tiebreak)})` : `${s.games[0]}-${s.games[1]}`,
    );
    if (!this.done) done.push(`${this.games[0]}-${this.games[1]}`);
    return done.join(' ');
  }

  progress(): MatchProgress {
    const setNo = this.completedSets.length + 1;
    return {
      line: this.done ? this.setLine() : this.callFor(0),
      detail: this.done
        ? this.winnerSide === 0
          ? 'MATCH WON'
          : 'MATCH LOST'
        : this.inTiebreak
          ? `Set ${setNo} tiebreak · ${this.games[0]}-${this.games[1]}`
          : `Set ${setNo} · ${this.games[0]}-${this.games[1]}`,
      complete: this.done,
      winner: this.winnerSide,
      summary: this.setLine(),
      // Games are the durable unit of a tennis match: they survive a lost set
      // the way arcade points do not, and they scale the same way across a
      // straight-sets win and a three-setter.
      score: this.totalGames(0) * 10 + this.sets[0] * 50,
    };
  }

  /** Games won by `side` across the whole match, finished sets included. */
  totalGames(side: Side): number {
    return this.completedSets.reduce((n, s) => n + s.games[side], 0) + this.games[side];
  }
}
