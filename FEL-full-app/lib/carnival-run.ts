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
import { isUnlistedMode } from './unlisted-modes';

/** Quick, GameShell-scored mini-games with no dedicated "console mode" of
 *  their own — the Court Carnival mini-game pool. Each uses the standard
 *  onEnd(GameResult) contract, confirmed by direct testing. */
export const CARNIVAL_EXTERNAL_POOL = [
  'brainBrawl',
  'bigAir',
  'freerun',
  'sprint',     // retired 2026-09-01, revived by the owner (see MODE_INFO): a live /play/sprint stop again
  'training',   // parked (IRON-PARADISE-OUT, lib/unlisted-modes.ts): kept in the pool, never dealt while unlisted
  'threePoint',
  'whoSceneIt',
  'tiebreak',
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

/** The external stops a night can deal: the pool minus any parked mode. IRON-PARADISE-OUT (2026-10-03) parked
 *  'training' everywhere a mode is OFFERED, but the lineup kept dealing it, and /play/training redirects to /train —
 *  the mid-night redirect this pool's old retirement note warned about. Filtering on isUnlistedMode keeps that
 *  decision's one switch: un-park the mode and it comes back here too. (PR #140, 2026-10-08) */
export function dealableCarnivalStops(): CarnivalExternalMode[] {
  return CARNIVAL_EXTERNAL_POOL.filter((stop) => !isUnlistedMode(stop));
}

/** Draw a fresh lineup for tonight: a mix of the native carnival round and
 *  external mini-games, native always included so the night still opens
 *  with the flagship 3D experience. */
export function drawCarnivalLineup(count: number = STOPS_PER_NIGHT): CarnivalStop[] {
  const externals = shuffled(dealableCarnivalStops()).slice(0, Math.max(0, count - 1));
  // ARENA-10PHASE P7 (2026-09-07): the comment above promised the night OPENS with the 3D round, but the whole lineup was
  // shuffled — two nights in three, START THE NIGHT left /play/carnival for a mini-game page and Court Carnival's own canvas
  // never mounted (playtest d3d4a93: "GAME NIGHT lobby 90 s+, no canvas"). Native first, the externals shuffled behind it.
  return ['carnival', ...externals];
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

/** The night's own title. Stop 1 used to borrow it, so the lineup and the night said the same name. */
export const CARNIVAL_NIGHT_NAME = 'Game Night';
/** The native stop — the court the night is played on — named apart from the night. */
export const CARNIVAL_NATIVE_STOP_NAME = 'Court Carnival';

export function carnivalStopLabel(stop: CarnivalStop): string {
  if (stop === 'carnival') return CARNIVAL_NATIVE_STOP_NAME;
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
