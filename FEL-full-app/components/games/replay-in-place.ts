'use client';

// REPLAY IN PLACE (BRAINBRAWL-RESIDUAL, 2026-09-24) — the Features review's HARD: the shell's REPLAY bumped its game key, so the
// game disposed its whole engine and cold-booted back to TAP TO START. A game that can start a new match on the stage it already
// has registers a restart here; GameShell's replay() calls it and skips the remount when it returns true. A game that registers
// nothing (every other mode) replays exactly as before. The dunk's GO AGAIN (d1ff9d2) is the bar: same page, no splash, round one.
import { createContext, useContext, useEffect } from 'react';

/** Register (or clear, with null) the mounted game's in-place restart. It returns false when it could not restart. */
export type RegisterReplay = (restart: (() => boolean) | null) => void;

export const ReplayInPlaceContext = createContext<RegisterReplay | null>(null);

/** A game's side: while mounted, REPLAY on the shell's end card calls `restart` instead of remounting the game. */
export function useReplayInPlace(restart: () => boolean): void {
  const register = useContext(ReplayInPlaceContext);
  useEffect(() => {
    if (!register) return;
    register(restart);
    return () => register(null);
  }, [register, restart]);
}
