'use client';

import { useEffect, useRef, useState } from 'react';

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

/**
 * Counts from `from` to `target` once `active` turns true. `instant` (reduced motion, a skip) shows the target at once —
 * and so does a server render, which never runs the effect: the markup always carries the real number.
 */
export function useCountUp(target: number, opts: { active: boolean; instant: boolean; ms: number; from?: number }): number {
  const from = opts.from ?? 0;
  const [value, setValue] = useState(opts.instant || !opts.active ? (opts.instant ? target : from) : from);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (opts.instant) { setValue(target); return; }
    if (!opts.active) { setValue(from); return; }
    const t0 = performance.now();
    const step = () => {
      const v = countAt(from, target, performance.now() - t0, opts.ms);
      setValue(v);
      if (v !== target) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, opts.active, opts.instant, opts.ms, from]);
  return value;
}
