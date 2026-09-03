// Court Carnival "night" orchestration — chains several quick mini-game pages
// together into one Mario-Party-style session, tallying a combined score
// across stops. State lives in sessionStorage so it survives the full-page
// navigation between stops (each stop is its own route/GameShell instance).
//
// Reward granting is untouched: every stop still posts to /api/sessions and
// earns its own XP/shards/credits exactly as a standalone play would. This
// module only sequences *which page loads next* and tallies the score for
// the final recap — it never intercepts the economy pipeline.

import { MODE_INFO } from './game-data';

/** Quick, GameShell-scored mini-games with no dedicated "console mode" of
 *  their own — the Court Carnival mini-game pool. Each uses the standard
 *  onEnd(GameResult) contract, confirmed by direct testing. */
export const CARNIVAL_EXTERNAL_POOL = [
  'brainBrawl',
  'bigAir',
  'gymnastics',
  'training',
  'threePoint',
  'whoSceneIt',
  'tiebreak',
  // 'sprint' was a stop — RETIRED from the v1 roster (owner, 2026-09-01, see
  // PHASE2_BENCHMARK_LOCKS.md). A retired stop in the pool deals tonight's
  // lineup a route that redirects away mid-night.
] as const;

export type CarnivalExternalMode = (typeof CARNIVAL_EXTERNAL_POOL)[number];

/** A carnival "stop" is either the native Babylon court-carnival round
 *  (mode key 'carnival' — its own internal 4-of-6 event rotation, reported
 *  as one score) or one of the external mini-game pages above. */
export type CarnivalStop = 'carnival' | CarnivalExternalMode;

const STOPS_PER_NIGHT = 3;
const STORAGE_KEY = 'fel:carnivalRun';

export interface CarnivalStopResult {
  stop: CarnivalStop;
  score: number;
  won: boolean;
}

export interface CarnivalRunState {
  id: string;
  lineup: CarnivalStop[];
  index: number; // which lineup slot is currently in progress
  results: CarnivalStopResult[];
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw a fresh lineup for tonight: a mix of the native carnival round and
 *  external mini-games, native always included so the night still opens
 *  with the flagship 3D experience. */
export function drawCarnivalLineup(count: number = STOPS_PER_NIGHT): CarnivalStop[] {
  const externals = shuffled(CARNIVAL_EXTERNAL_POOL).slice(0, Math.max(0, count - 1));
  return shuffled(['carnival', ...externals]);
}

export function startCarnivalRun(lineup: CarnivalStop[]): CarnivalRunState {
  const run: CarnivalRunState = {
    id: `carnival_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    lineup,
    index: 0,
    results: [],
  };
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  }
  return run;
}

export function getCarnivalRun(): CarnivalRunState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as CarnivalRunState;
    if (!run?.lineup?.length || run.index >= run.lineup.length) return null;
    return run;
  } catch {
    return null;
  }
}

export function currentCarnivalStop(): CarnivalStop | null {
  const run = getCarnivalRun();
  return run ? run.lineup[run.index] : null;
}

/** Same as getCarnivalRun but doesn't discard a just-finished run (index at
 *  the end of the lineup) — for the final recap page to read before it's
 *  cleared. */
export function peekCarnivalRun(): CarnivalRunState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as CarnivalRunState;
    return run?.lineup?.length ? run : null;
  } catch {
    return null;
  }
}

/** Record the just-finished stop's result and advance the run. Returns the
 *  updated run (index already advanced) so the caller can decide whether
 *  another stop remains. */
export function recordCarnivalResult(stop: CarnivalStop, res: { score: number; won: boolean }): CarnivalRunState | null {
  if (typeof window === 'undefined') return null;
  const run = getCarnivalRun();
  if (!run || run.lineup[run.index] !== stop) return null;
  const updated: CarnivalRunState = {
    ...run,
    index: run.index + 1,
    results: [...run.results, { stop, score: res.score, won: res.won }],
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearCarnivalRun(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
}

export function carnivalStopLabel(stop: CarnivalStop): string {
  return MODE_INFO[stop]?.name ?? stop;
}

/** Route for a given stop, with the carnival relay flag appended so
 *  GameShell knows this session is part of a run. */
export function carnivalStopHref(stop: CarnivalStop): string {
  const base = MODE_INFO[stop]?.href ?? '/play/carnival';
  return `${base}${base.includes('?') ? '&' : '?'}carnival=1`;
}

export function carnivalRunTotalScore(run: CarnivalRunState): number {
  return run.results.reduce((sum, r) => sum + r.score, 0);
}
