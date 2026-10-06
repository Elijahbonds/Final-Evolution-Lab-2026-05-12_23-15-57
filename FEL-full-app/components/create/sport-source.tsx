'use client';
// components/create/sport-source.tsx — CREATE HUB step 1 for sport: pick a run you already played (your personal
// bests, wins and signature attempts, GET /api/v1/card/highlights). No video leaves the device: a sport card names the run.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { HighlightCandidate } from '@/lib/creator/card-stats';
import type { MadeThing } from './types';

export default function SportSource({ onMade }: { onMade: (m: MadeThing) => void }) {
  const [list, setList] = useState<HighlightCandidate[] | null>(null);
  useEffect(() => {
    fetch('/api/v1/card/highlights').then((r) => (r.ok ? r.json() : null)).then((j) => setList(j?.candidates ?? [])).catch(() => setList([]));
  }, []);
  if (list === null) return <p className="text-sm text-neutral-500">Loading your runs…</p>;
  if (!list.length) return (
    <div className="rounded-2xl bg-neutral-900 p-5 text-sm text-neutral-300">
      <p>No runs yet. Play a mode, then come back and turn your best one into a card.</p>
      <Link href="/play" className="mt-3 inline-flex rounded-lg bg-orange-500 px-4 py-2 font-bold text-black">Open Play</Link>
    </div>
  );
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {list.slice(0, 24).map((h) => (
        <li key={h.id}>
          <button data-qa="pick-run" onClick={() => onMade({ art: { kind: 'sport', routineId: h.id }, title: `${h.mode} ${h.kind === 'signature' ? 'signature' : 'best'}: ${h.score}` })}
            className="w-full rounded-xl bg-neutral-900 p-3 text-left transition hover:bg-neutral-800">
            <div className="text-sm font-bold capitalize text-neutral-100">{h.mode.replace(/_/g, ' ')}</div>
            <div className="text-[11px] text-neutral-400">{h.kind} · {h.score} pts{h.won ? ' · won' : ''} · {new Date(h.at).toLocaleDateString()}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
