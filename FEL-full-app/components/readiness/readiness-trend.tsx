'use client';

// ReadinessTrend — the daily jump check's line: each day's best, coloured by its band (COACH-READINESS, 2026-10-25).
// Adults only: the server sends a trend only for a verified adult, and a phone-kept history only exists for one (the
// check page refuses everyone else). ReadinessTrendCard is the self-fetching version for the progress card's page.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { localDayKey } from '@/lib/health/readiness';
import { BAND_LABEL } from '@/lib/coach/readiness/copy';
import { deviceStorage, readDeviceHistory } from '@/lib/coach/readiness/deviceHistory';
import type { ReadinessBand } from '@/lib/coach/readiness/types';
import type { TrendPoint } from '@/lib/coach/readiness/view';

const DOT: Record<ReadinessBand, string> = { ready: '#00FF9D', normal: '#00E5FF', low: '#FFB020', building: 'rgba(255,255,255,0.5)' };

export function ReadinessTrend({ points, title = 'Your readiness' }: { points: readonly TrendPoint[]; title?: string }) {
  if (points.length < 2) return null;
  const W = 320, H = 96, P = 10;
  const ys = points.map((p) => p.bestCm);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = Math.max(hi - lo, 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.bestCm).toFixed(1)}`).join(' ');
  const lows = points.filter((p) => p.band === 'low').length;
  return (
    <div className="fel-card space-y-2 rounded-xl p-4" data-readiness-trend>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-white/40">{title}</div>
        <div className="text-[11px] text-white/45">{points.length} checks · {lows} Low</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`Best jump on ${points.length} daily checks, from ${(lo / 2.54).toFixed(1)} to ${(hi / 2.54).toFixed(1)} inches; ${lows} read Low.`}>
        <path d={path} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.bestCm)} r={3.5} fill={DOT[p.band]}><title>{`${p.day}: ${(p.bestCm / 2.54).toFixed(1)} in, ${BAND_LABEL[p.band]}`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[11px] text-white/40"><span>{points[0].day}</span><span>{points[points.length - 1].day}</span></div>
    </div>
  );
}

/** The trend for the progress card's page: the saved history, else the phone's; nothing for anyone the check refuses. */
export function ReadinessTrendCard({ api = '/api/readiness/check' }: { api?: string }) {
  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  useEffect(() => {
    fetch(`${api}?day=${localDayKey(new Date())}`).then((r) => r.json()).then((j: { ok?: boolean; trend?: TrendPoint[] | null }) => {
      if (!j?.ok) { setPoints([]); return; }
      setPoints(j.trend ?? readDeviceHistory(deviceStorage()).slice().reverse().map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band })));
    }).catch(() => setPoints([]));
  }, [api]);
  if (!points || points.length < 2) return null;
  return (
    <div className="mt-4 space-y-1">
      <ReadinessTrend points={points} title="Readiness this month" />
      <p className="px-1 text-xs text-white/40"><Link href="/train/readiness" className="underline">Today&apos;s jump check</Link></p>
    </div>
  );
}
