'use client';

// Creative Hub — CREATE HUB (owner, 2026-10-06: "make the app usable like 2K Beats for creators … easier to access and
// set up"). The /create landing: nine tiles, each saying where the work shows up in the game, then My Creations with
// each card's review status. A tile opens the guided three-step flow (/create/<discipline>). The primary/secondary
// picker and the licence tick that lived here moved into the flow's step 2 (one rights tick, the owner's words).

import React from 'react';
import Link from 'next/link';
import { ALL_GUIDES } from '@/lib/create/disciplines';
import { useMyCards } from '@/lib/create/use-my-cards';
import MyCreations from './my-creations';

export default function CreativeHub({ publicCreator }: { publicCreator: boolean }) {
  const { cards, loading } = useMyCards({ publicCreator });
  const pending = cards.filter((c) => c.reviewState === 'pending_review').length;
  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
      <div className="p-5">
        <h1 className="text-3xl font-black">Create</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Make it, set it up in three steps, see where it lands. FEL reviews every public card first, then plays it in the game, credited to you.
        </p>
        {!publicCreator && (
          <p data-qa="private-note" className="mt-3 max-w-2xl rounded-xl bg-neutral-900 p-3 text-xs text-neutral-300">
            Everything you make stays private until your account is a confirmed 18+. You can still make it, keep it and use it yourself.
          </p>
        )}
        {pending > 0 && <p className="mt-3 text-xs text-amber-300">{pending} card{pending === 1 ? '' : 's'} in review. You will see the result here.</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 px-5 pb-8 sm:grid-cols-2 lg:grid-cols-3" data-qa="discipline-grid">
        {ALL_GUIDES.map((g, i) => (
          <Link key={g.id} href={`/create/${g.id}`} data-qa={`tile-${g.id}`}
            className={`group relative flex flex-col rounded-2xl bg-neutral-900 p-4 transition hover:bg-neutral-800 ${i === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
            <span className={`absolute left-0 top-4 h-8 w-1 rounded-r ${g.color}`} aria-hidden />
            <span className="text-lg font-black">{g.label}</span>
            <span className="text-sm text-neutral-400">{g.blurb}</span>
            <span className="mt-3 text-[10px] uppercase tracking-widest text-neutral-500">Shows up in</span>
            <ul className="mt-1 space-y-0.5 text-xs">
              {g.showsUp.map((s) => (
                <li key={s.where} className={s.live ? 'text-neutral-200' : 'text-neutral-500'}>
                  {s.live ? '●' : '○'} {s.where}{s.live ? '' : ' · soon'}
                </li>
              ))}
            </ul>
            <span className="mt-auto pt-4 text-sm font-bold text-amber-300 group-hover:underline">Start →</span>
          </Link>
        ))}
      </div>

      <MyCreations cards={cards} loading={loading} publicCreator={publicCreator} />
    </div>
  );
}
