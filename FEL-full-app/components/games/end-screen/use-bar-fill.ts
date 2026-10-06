'use client';

// The fill of a bar that can cross its end — the season pass bar and (IMPROVE 2026-10-06) the player level bar. For each
// segment it jumps to `from`, glides to `to`, and, when the segment crossed, flashes and calls `onCross` near its end;
// the next segment starts again from 0. Instant (reduced motion, a skip): the last segment's end, no travel, no flash.
// (Moved out of season-card.tsx unchanged so both bars play the same way.)

import { useEffect, useRef, useState } from 'react';
import { pct } from './season-bar';

export interface FillSegment {
  from: number;
  to: number;
  need: number;
  crossed: boolean;
}

export function useBarFill(segments: readonly FillSegment[], o: { active: boolean; instant: boolean; ms: number; onCross?: (index: number) => void }) {
  const { active, instant, ms } = o;
  const last = segments.length - 1;
  const [seg, setSeg] = useState(instant ? last : 0);
  const [width, setWidth] = useState(instant ? pct(segments[last].to, segments[last].need) : pct(segments[0].from, segments[0].need));
  const [glide, setGlide] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const crossRef = useRef(o.onCross);
  crossRef.current = o.onCross;

  useEffect(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    if (instant) { setSeg(last); setGlide(false); setWidth(pct(segments[last].to, segments[last].need)); setFlash(null); return; }
    if (!active) return;
    const per = Math.max(120, Math.floor(ms / segments.length));
    let at = 0;
    segments.forEach((s, i) => {
      timers.current.push(setTimeout(() => { setSeg(i); setGlide(false); setWidth(pct(s.from, s.need)); }, at));
      timers.current.push(setTimeout(() => { setGlide(true); setWidth(pct(s.to, s.need)); }, at + 30));
      if (s.crossed) {
        timers.current.push(setTimeout(() => { setFlash(i); crossRef.current?.(i); }, at + per - 40));
      }
      at += per;
    });
    return () => { for (const t of timers.current) clearTimeout(t); };
  }, [active, instant, ms, segments, last]);

  const glideMs = Math.max(100, Math.floor(ms / segments.length) - 80);
  return { seg, width, glide, flash, glideMs };
}
