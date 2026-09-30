// RESULTS-TRUTH: one place to turn a mode's SessionResult into the GameResult the shell posts.
// The finish POST (score, opponentScore, won, played) must match the end card — same numbers, same verdict.

import type { GameResult } from '@/components/games/game-shell';
import type { SessionResult } from '@/lib/babylon/core/sessionResult';
import { timingWon } from '@/components/games/timing-won';

export function statNum(st: Record<string, number> | undefined, k: string, d = 0): number {
  const v = st?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Opponent tally from the stat keys modes already publish (proof line reads the same fields). */
export function opponentScoreFromStats(st: Record<string, number> | undefined): number {
  if (!st) return 0;
  for (const k of ['theirs', 'themGoals', 'foeScore', 'foeWins', 'rivalPoints', 'p2score']) {
    const v = st[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

export function boardSportWon(outcome: string): boolean {
  return outcome === 'win';
}

export function footballSessionWon(outcome: string): boolean {
  return outcome === 'DRIVES_DONE';
}

export interface GameResultFromSessionOpts {
  headline: string;
  won?: boolean;
  opponentScore?: number;
  maxCombo?: number;
  duration?: number;
  tallies?: GameResult['tallies'];
  detail?: unknown;
}

/** Build the shell payload from the mode's final SessionResult plus the card headline. */
export function gameResultFromSession(r: SessionResult, opts: GameResultFromSessionOpts): GameResult {
  const st = r.stats;
  return {
    score: r.score,
    stats: st,
    outcome: r.outcome,
    opponentScore: opts.opponentScore ?? opponentScoreFromStats(st),
    won: opts.won ?? false,
    duration: opts.duration ?? r.durationSec,
    headline: opts.headline,
    maxCombo: opts.maxCombo,
    tallies: opts.tallies,
    detail: opts.detail ?? r.detail,
  };
}

/** Timing-sports host: won from timingWon; opponent from stats unless overridden (penalty shootout). */
export function timingGameResult(
  r: SessionResult,
  opts: { headline: string; modeKey: string; maxCombo?: number },
): GameResult {
  const st = r.stats ?? {};
  const n = (k: string, d = 0) => statNum(st, k, d);
  const opponentScore = opts.modeKey === 'penalty' ? n('themGoals') : opponentScoreFromStats(st);
  return gameResultFromSession(r, {
    headline: opts.headline,
    won: timingWon(r.outcome, st),
    opponentScore,
    maxCombo: opts.maxCombo,
  });
}

/** Board-sports host: skate / surf / snowboard. */
export function boardGameResult(
  r: SessionResult,
  opts: { headline: string; modeKey: string },
): GameResult {
  const st = r.stats ?? {};
  const combo = statNum(st, 'bestCombo', 1);
  return gameResultFromSession(r, {
    headline: opts.headline,
    won: boardSportWon(r.outcome),
    maxCombo: Math.round(combo),
  });
}

/** Earned board headlines — no LEGENDARY on a ×1 chain with no goals; no EPIC at flow 0. */
export function boardHeadline(modeKey: string, r: SessionResult, won: boolean): string {
  const st = r.stats ?? {};
  const n = (k: string, d = 0) => statNum(st, k, d);
  const combo = Math.max(1, Math.round(n('bestCombo', 1)));
  if (modeKey === 'snowboard_slalom') {
    const stalled = n('stalled') > 0;
    const verdict = stalled ? 'RUN STALLED' : won ? 'GATE CRASHER' : 'RUN FINISHED';
    return `${verdict} · ${n('gatesHit')}/${n('gates', 30)}`;
  }
  if (modeKey === 'surf') {
    const epic = won && (n('bestFlow') > 0 || n('barrels') > 0);
    const title = epic ? 'EPIC SESSION' : won ? 'SOLID SESSION' : 'SESSION OVER';
    return `${title} · ${n('barrels')} BARRELS · ${n('tricksLanded')} TRICKS · ${n('pumps')} PUMPS`;
  }
  const goalsHit = n('goalsHit', n('goalsDone'));
  const legendary = won && (combo >= 3 || goalsHit > 0);
  const title = legendary ? 'LEGENDARY RUN' : won ? 'GREAT RUN' : 'RUN OVER';
  return `${title} · x${combo} BEST CHAIN · ${n('tricksLanded')} TRICKS · ${n('coinsCollected')} COINS`;
}

export function footballHeadline(r: SessionResult, won: boolean): string {
  const yards = statNum(r.stats, 'yards');
  if (won) return `TOUCHDOWN! · ${yards} YD`;
  if (r.outcome === 'DRIVES_DONE') return `TOUCHDOWN! · ${yards} YD`;
  return `TACKLED · ${yards} YD`;
}
