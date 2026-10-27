'use client';

// HandTimer — the hand-timed stations (COMBINE-DAY, 2026-10-25): sprint and agility. The COACH times it: a big
// start/stop stopwatch on this phone, or a time typed from their own watch. It says "hand-timed" wherever it shows a
// time, and the camera plays no part here. SPRINT-SPEED (2026-10-25): a station the coach sets to the camera uses
// components/sprint/camera-sprint-timer.tsx instead, for a verified adult; this stopwatch stays the default and the fallback.
import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { HAND_TIME_RANGE } from '@/lib/combine/catalogue';
import { HAND_TIMED_LINE } from '@/lib/combine/copy';

const fmt = (ms: number) => (ms / 1000).toFixed(2);

export function HandTimer({ kind, onTime, now = () => performance.now() }: { kind: 'sprint' | 'agility'; onTime: (seconds: number) => void; now?: () => number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const [stopped, setStopped] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [why, setWhy] = useState<string | null>(null);
  const raf = useRef(0);
  const [lo, hi] = HAND_TIME_RANGE[kind];

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => { setShown(now() - startedAt); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [startedAt, now]);

  const tap = () => {
    if (startedAt === null) { setStopped(null); setWhy(null); setShown(0); setStartedAt(now()); return; }
    const ms = now() - startedAt;
    setStartedAt(null); setShown(ms); setStopped(ms);
  };
  const take = (s: number) => {
    if (!Number.isFinite(s) || s < lo || s > hi) { setWhy(`A ${kind} time is between ${lo} and ${hi} seconds.`); return; }
    setWhy(null); setStopped(null); setShown(0); setTyped('');
    onTime(Math.round(s * 100) / 100);
  };

  const running = startedAt !== null;
  return (
    <div className="space-y-3" data-combine-timer={running ? 'running' : stopped !== null ? 'stopped' : 'ready'}>
      <button type="button" onClick={tap} data-combine-stopwatch
        className={`flex min-h-[112px] w-full flex-col items-center justify-center rounded-2xl text-black ${running ? 'bg-[#FF4D8D]' : 'bg-fel-emerald'}`}>
        <span className="font-mono text-5xl font-black tabular-nums" aria-live="off">{fmt(shown)}</span>
        <span className="mt-1 text-sm font-black uppercase tracking-wider">{running ? 'Tap to stop' : stopped !== null ? 'Tap to time again' : 'Tap to start'}</span>
      </button>
      {stopped !== null && !running && (
        <button type="button" onClick={() => take(stopped / 1000)} data-combine-keep-time className="min-h-12 w-full rounded-xl bg-white font-black text-black">
          Record {fmt(stopped)} s
        </button>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); take(Number(typed.replace(',', '.'))); }}>
        <label className="sr-only" htmlFor={`combine-type-${kind}`}>Type a time in seconds</label>
        <input id={`combine-type-${kind}`} inputMode="decimal" placeholder="or type it: 4.82" value={typed} onChange={(e) => setTyped(e.target.value)} data-combine-typed
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 text-lg text-white placeholder:text-white/30" />
        <button type="submit" disabled={!typed.trim()} className="min-h-12 rounded-xl border border-white/25 px-4 font-bold text-white disabled:opacity-40">Record</button>
      </form>
      {why && <p role="alert" className="text-sm text-[#FFB020]">{why}</p>}
      <p className="flex items-center gap-1.5 text-[11px] text-fel-dim"><Timer className="h-3.5 w-3.5" /> {HAND_TIMED_LINE}</p>
    </div>
  );
}
