'use client';

// Creative Hub — one entry for all five disciplines: primary + up to 2 secondary,
// sport designation when sport is involved, license gate (also server-enforced).

import React, { useState } from 'react';
import type { Discipline, SportDesignation } from '@/lib/creator/creative-card-types';

const DISCIPLINES: { id: Discipline; label: string; blurb: string; color: string }[] = [
  { id: 'sport', label: 'Sport', blurb: 'Routines, signature moves, highlight reels', color: 'bg-orange-500' },
  { id: 'music', label: 'Music', blurb: 'Build a beat, perform it live', color: 'bg-emerald-500' },
  { id: 'art', label: 'Art', blurb: 'Paint courts, boards, kits, UI', color: 'bg-sky-500' },
  { id: 'dance', label: 'Dance', blurb: 'Choreograph routines and celebrations', color: 'bg-fuchsia-500' },
  { id: 'acting', label: 'Acting', blurb: 'Record commentary and callouts', color: 'bg-amber-500' },
];

const SPORTS: SportDesignation[] = [
  'basketball', 'football', 'soccer', 'baseball', 'tennis', 'golf', 'skate', 'snowboard', 'karate',
];

export default function CreativeHub({ onEnter }: {
  onEnter: (primary: Discipline, secondary: Discipline[], licensed: boolean, sport?: SportDesignation) => void;
}) {
  const [primary, setPrimary] = useState<Discipline | null>(null);
  const [secondary, setSecondary] = useState<Discipline[]>([]);
  const [sport, setSport] = useState<SportDesignation>('basketball');
  const [licensed, setLicensed] = useState(false);

  const needsSport = primary === 'sport' || secondary.includes('sport');
  const canProceed = primary !== null && licensed && (!needsSport || !!sport);

  const toggleSecondary = (d: Discipline) => {
    if (d === primary) return;
    setSecondary((s) => s.includes(d) ? s.filter((x) => x !== d) : s.length < 2 ? [...s, d] : s);
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-5 text-neutral-100">
      <h1 className="mb-1 text-3xl font-black">Create a Card</h1>
      <p className="mb-6 text-sm text-neutral-400">Pick what you make. Everything you build becomes playable.</p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DISCIPLINES.map((d) => (
          <button key={d.id} data-test-ignore="sets-primary-mode" onClick={() => { setPrimary(d.id); setSecondary((s) => s.filter((x) => x !== d.id)); }}
            className={`rounded-2xl p-4 text-left transition-all ${
              primary === d.id ? `${d.color} scale-[1.02] text-black` : 'bg-neutral-900 hover:bg-neutral-800'}`}>
            <div className="text-lg font-bold">{d.label}</div>
            <div className="text-sm opacity-80">{d.blurb}</div>
          </button>
        ))}
      </div>

      {primary && (
        <>
          <div className="mb-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Secondary (up to 2)</div>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINES.filter((d) => d.id !== primary).map((d) => (
                <button key={d.id} onClick={() => toggleSecondary(d.id)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    secondary.includes(d.id) ? 'bg-neutral-100 text-black' : 'bg-neutral-800'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {needsSport && (
            <div className="mb-5">
              <div className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Sport designation</div>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((s) => (
                  <button key={s} onClick={() => setSport(s)}
                    className={`rounded-lg px-3 py-2 text-sm capitalize ${
                      sport === s ? 'bg-orange-500 text-black' : 'bg-neutral-800'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl bg-neutral-900 p-4">
            <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0" />
            <span className="text-sm text-neutral-300">
              This is my original work. I grant Final Evolution Lab a license to display
              and use it in-game, and I confirm it contains no third-party music, footage,
              likenesses, or trademarks I don&apos;t own.
            </span>
          </label>

          <button disabled={!canProceed}
            onClick={() => onEnter(primary, secondary, licensed, needsSport ? sport : undefined)}
            className="w-full rounded-xl bg-amber-400 py-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-30">
            Start Creating
          </button>
        </>
      )}
    </div>
  );
}
