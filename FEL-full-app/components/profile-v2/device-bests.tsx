'use client';

// Personal bests for an account whose bests are NOT kept on the server: under 18 or an unknown age (owner decision
// 2026-10-06: "teens stay per device"). The end card keeps them on this phone (components/games/end-screen/records.ts);
// this reads that store and says so. Nothing is sent.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadRecords } from '@/components/games/end-screen/records';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';

interface Row { mode: string; name: string; href: string | null; best: number; runs: number }

export function DeviceBests() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const r = loadRecords();
    setRows(Object.entries(r.modes)
      .filter(([, m]) => m.runs > 0)
      .map(([k, m]) => { const info = MODE_INFO[canonicalModeKey(k)]; return { mode: k, name: info?.name ?? k, href: info?.href ?? null, best: m.best, runs: m.runs }; })
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 6));
  }, []);
  if (rows === null) return <p className="text-[12px] text-fel-quiet">Reading this phone’s records…</p>;
  if (!rows.length) {
    return (
      <p className="text-[14px] text-white/50">
        No bests on this phone yet. <Link href="/play" className="font-bold text-fel-cyan underline-offset-2 hover:underline">Play a mode →</Link>
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-white/[0.06]">
        {rows.map((r) => (
          <li key={r.mode} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate text-[14px] font-semibold text-white/85">{r.name}</span>
            <span className="shrink-0 text-right">
              <span className="fel-heading text-[16px] font-black text-fel-gold tabular-nums">{r.best.toLocaleString('en-US')}</span>
              <span className="ml-2 font-sans text-[12px] text-fel-quiet">{r.runs} run{r.runs === 1 ? '' : 's'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-fel-quiet">On this phone only. Under-18 bests are never kept on the server.</p>
    </>
  );
}
