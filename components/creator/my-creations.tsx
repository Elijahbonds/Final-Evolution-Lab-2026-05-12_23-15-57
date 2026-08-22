'use client';

// My Creations — lists the player's published creative cards and exposes the
// round-trip actions: apply an ART card to the venue, equip a DANCE routine as a
// dunk celebration. Music/acting cards show their review state.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CreativeCard } from '@/lib/creator/creative-card-types';
import { applyCardAsSkin } from '@/lib/modes/art/active-skin';
import { setEquippedRoutine } from '@/lib/modes/dance/active-routine';

const BADGE: Record<string, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300',
  pending_review: 'bg-amber-500/20 text-amber-300',
  rejected: 'bg-red-500/20 text-red-300',
};

export default function MyCreations({ refreshKey }: { refreshKey?: number }) {
  const [cards, setCards] = useState<CreativeCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/creative-card?mine=1');
      if (res.ok) { const { cards } = await res.json(); setCards(cards ?? []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const applyArt = async (id: string) => {
    const surface = await applyCardAsSkin(id);
    toast[surface ? 'success' : 'error'](surface
      ? `Applied to ${surface} — enter a board mode to see it in-game.`
      : 'Could not apply this card.');
  };

  const equipDance = (c: CreativeCard) => {
    if (c.art.kind !== 'dance') return;
    setEquippedRoutine({ steps: c.art.sequence, bpm: 100 });
    toast.success('Routine equipped — land a dunk to see it celebrate.');
  };

  if (loading) return <p className="px-5 py-4 text-sm text-neutral-500">Loading your creations…</p>;
  if (!cards.length) return null;

  return (
    <div className="px-5 pb-10">
      <h2 className="mb-3 text-lg font-black text-neutral-100">My Creations</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl bg-neutral-900 p-3">
            {c.art.kind === 'art' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.art.canvasDataUrl} alt={c.title} className="h-14 w-14 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-neutral-100">{c.title}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] uppercase text-neutral-500">{c.primary}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${BADGE[c.reviewState] ?? ''}`}>
                  {c.reviewState.replace('_', ' ')}
                </span>
              </div>
            </div>
            {c.art.kind === 'art' && (
              <button onClick={() => applyArt(c.id)} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-black">Apply</button>
            )}
            {c.art.kind === 'dance' && (
              <button onClick={() => equipDance(c)} className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-bold text-black">Equip</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
