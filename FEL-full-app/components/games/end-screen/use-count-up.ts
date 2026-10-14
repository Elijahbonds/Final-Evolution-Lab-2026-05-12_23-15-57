'use client';

import { useEffect, useState } from 'react';

/** easeOutCubic: fast off the mark, settling into the number. */
export function easeOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 3;
}

/** PURE: the number on screen `elapsed` ms into a count from `from` to `to` over `ms`. */
export function countAt(from: number, to: number, elapsed: number, ms: number): number {
  if (!(ms > 0) || elapsed >= ms) return to;
  return from + (to - from) * easeOut(elapsed / ms);
}

/** How long past `ms` a count may run before it is forced onto its target (NB-2). */
export const SETTLE_SLACK_MS = 120;

/** The timers a count uses (the browser's by default; a test passes its own). */
export interface CountClock {
  raf: (cb: () => void) => number;
  caf: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
}
const browserClock = (): CountClock => ({
  raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms), clearTimeout: (id) => window.clearTimeout(id),
  now: () => performance.now(),
});

/**
 * PURE DRIVER: count `from` → `target` over `ms`, calling `set` on each animation frame, and ALWAYS land on `target` by
 * `ms + SETTLE_SLACK_MS` even if animation frames stall. NB-2 (hoops grade 0d16f5dd): on a busy phone / software GL the
 * game's render loop starved the card's frames, and the 3v3 card read "0 SCORE" against an 8–10 board in 4/4 games.
 * Returns the cancel.
 */
export function runCount(from: number, target: number, ms: number, set: (v: number) => void, clock: CountClock = browserClock()): () => void {
  const t0 = clock.now();
  let frame = 0;
  const step = () => {
    const v = countAt(from, target, clock.now() - t0, ms);
    set(v);
    if (v !== target) frame = clock.raf(step);
  };
  frame = clock.raf(step);
  const settle = clock.setTimeout(() => { clock.caf(frame); set(target); }, Math.max(0, ms) + SETTLE_SLACK_MS);
  return () => { clock.caf(frame); clock.clearTimeout(settle); };
}

/**
 * Counts from `from` to `target` once `active` turns true. `instant` (reduced motion, a skip) shows the target at once —
 * and so does a server render, which never runs the effect: the markup always carries the real number. The count always
 * settles on `target` (runCount), stalled frames or not.
 */
export function useCountUp(target: number, opts: { active: boolean; instant: boolean; ms: number; from?: number }): number {
  const from = opts.from ?? 0;
  const [value, setValue] = useState(opts.instant || !opts.active ? (opts.instant ? target : from) : from);
  useEffect(() => {
    if (opts.instant) { setValue(target); return; }
    if (!opts.active) { setValue(from); return; }
    return runCount(from, target, opts.ms, setValue);
  }, [target, opts.active, opts.instant, opts.ms, from]);
  return value;
}
