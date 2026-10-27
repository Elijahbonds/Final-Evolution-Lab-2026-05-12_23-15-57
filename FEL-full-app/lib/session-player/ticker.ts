// lib/session-player/ticker.ts — PLAT-P01 (2026-10-27): the player's clock. It hands the machine the time that really
// passed between beats (a throttled background tab beats slowly; the countdowns stay true to the wall clock).
//
// Client-safe: the clock and the timer are handed in (tests run them by hand).

/** How often the player's countdowns move. Four beats a second keeps a seconds display honest. (new) */
export const BEAT_MS = 250;

export interface Clock {
  now(): number;
  every(ms: number, f: () => void): () => void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  every: (ms, f) => { const id = setInterval(f, ms); return () => clearInterval(id); },
};

/** Calls `onDt(ms since the last beat)` every beat until the returned stop is called. */
export function startTicker(onDt: (dtMs: number) => void, clock: Clock = realClock, beatMs = BEAT_MS): () => void {
  let last = clock.now();
  return clock.every(beatMs, () => {
    const t = clock.now();
    const dt = t - last;
    last = t;
    if (dt > 0) onDt(dt);
  });
}
