// Prove It rotation (SESSION-SETUP-V1). Round-robin, one dunk at a time, then the next name.
// After a landing the next attempt arms itself once a countdown ends. No tap between attempts.
// Pause holds the countdown; the camera moving is the only reason to calibrate the floor again.

import type { Athlete } from './roster';

/** Elijah, 6:13 PM PT Oct 3: re-arm after a 3-second "Next up" countdown. */
export const REARM_MS = 3000;

export interface Board {
  players: Athlete[];
  dunksEach: number;
  counts: number[];
  index: number;
}

export function freshBoard(players: readonly Athlete[], dunksEach: number): Board {
  return {
    players: players.map((p) => ({ ...p })),
    dunksEach,
    counts: players.map(() => 0),
    index: 0,
  };
}

/** The next player who still has dunks left, starting after `from` and wrapping. Null when the session is over. */
export function nextIndex(counts: readonly number[], dunksEach: number, from: number): number | null {
  const n = counts.length;
  if (n === 0) return null;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (counts[i] < dunksEach) return i;
  }
  return null;
}

export interface DunkAdvance {
  board: Board;
  done: boolean;
  /** Who is up next, when the session is not over. Spoken as "Next up: <name>". */
  next: { index: number; name: string } | null;
}

/** Record the dunk that just landed and point the board at whoever is next. */
export function recordDunk(board: Board): DunkAdvance {
  const counts = board.counts.slice();
  counts[board.index] = (counts[board.index] ?? 0) + 1;
  const nxt = nextIndex(counts, board.dunksEach, board.index);
  if (nxt === null) {
    return { board: { ...board, counts, index: board.index }, done: true, next: null };
  }
  return {
    board: { ...board, counts, index: nxt },
    done: false,
    next: { index: nxt, name: board.players[nxt]?.name ?? '' },
  };
}

export type LivePhase = 'setup' | 'framing' | 'watching' | 'countdown' | 'paused' | 'final';

/**
 * What the screen does after a measured dunk, with no tap.
 * Pause holds. Otherwise a countdown, then the next attempt arms itself.
 */
export function phaseAfterDunk(paused: boolean, done: boolean): LivePhase {
  if (done) return 'final';
  if (paused) return 'paused';
  return 'countdown';
}

export function phaseAfterCountdown(paused: boolean, done: boolean, framingOk: boolean): LivePhase {
  if (done) return 'final';
  if (paused) return 'paused';
  if (!framingOk) return 'framing';
  return 'watching';
}

/** A full rotation with zero taps between dunks. Returns how many attempts armed themselves. */
export function runRotationUntapped(players: readonly Athlete[], dunksEach: number): { attempts: number; autoArms: number; final: boolean } {
  let board = freshBoard(players, dunksEach);
  let attempts = 0;
  let autoArms = 0;
  const total = players.length * dunksEach;
  while (attempts < total + 2) {
    attempts += 1;
    const adv = recordDunk(board);
    board = adv.board;
    const phase = phaseAfterDunk(false, adv.done);
    if (phase === 'final') return { attempts, autoArms, final: true };
    const armed = phaseAfterCountdown(false, adv.done, true);
    if (armed !== 'watching') return { attempts, autoArms, final: false };
    autoArms += 1;
  }
  return { attempts, autoArms, final: false };
}
