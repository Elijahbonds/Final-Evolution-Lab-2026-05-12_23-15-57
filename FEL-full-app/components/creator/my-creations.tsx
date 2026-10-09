'use client';

// My Creations — the player's own creative cards with their review status (lib/create/status.ts): in review, public,
// in the soundtrack rotation, private, or not approved with the approver's note. Round-trip actions stay: apply an ART
// card as a skin, equip a DANCE routine (at the routine's own tempo now; it was always 100).
// CREATE HUB (owner, 2026-10-06): the hub owns the fetch (useMyCards, which also toasts a status change), so this is
// a pure view of the list it is handed.

import React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { CreativeCard } from '@/lib/creator/creative-card-types';
import { DISCIPLINE_META } from '@/lib/creator/creative-card-types';
import { statusOf, type CardStatus } from '@/lib/create/status';
import { applyCardAsSkin } from '@/lib/modes/art/active-skin';
import { setEquippedRoutine } from '@/lib/modes/dance/active-routine';

const CHIP: Record<CardStatus, string> = {
  public: 'bg-emerald-500/20 text-emerald-300',
  pending: 'bg-amber-500/20 text-amber-300',
  rejected: 'bg-red-500/20 text-red-300',
  private: 'bg-neutral-500/20 text-neutral-300',
};

export default function MyCreations({ cards, loading, publicCreator }: { cards: CreativeCard[]; loading: boolean; publicCreator: boolean }) {
  const applyArt = async (id: string) => {
    const surface = await applyCardAsSkin(id);
    toast[surface ? 'success' : 'error'](surface
      ? `Applied to ${surface} on this device.`
      : 'Could not apply this card.');
  };

  const equipDance = (c: CreativeCard) => {
    if (c.art.kind !== 'dance') return;
    setEquippedRoutine({ steps: c.art.sequence, bpm: c.art.bpm ?? 100 });
    toast.success('Routine equipped on this device: dance it as MY ROUTINE on the Dance floor.');   // PIPELINES (2026-10-06)
  };

  return (
    <section className="px-5 pb-10" aria-labelledby="my-creations">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="my-creations" className="text-lg font-black text-neutral-100">My Creations</h2>
        {!loading && cards.length > 0 && <span className="text-xs text-neutral-500">{cards.length} card{cards.length === 1 ? '' : 's'}</span>}
      </div>
      {loading && <p className="text-sm text-neutral-500">Loading your creations…</p>}
      {!loading && cards.length === 0 && (
        <p className="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400">Nothing yet. Pick a tile above: three steps and it is a card.</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const v = statusOf(c, { publicCreator });
          return (
            <article key={c.id} data-qa="creation" className="flex gap-3 rounded-xl bg-neutral-900 p-3">
              {c.art.kind === 'art' && c.art.canvasDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.art.canvasDataUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-neutral-100">{c.title}</div>
                {c.art.kind === 'music' && <div className="truncate text-[11px] text-neutral-400">{c.art.bpm} BPM{c.art.durationSec ? ` · ${Math.round(c.art.durationSec)} s` : ''}{c.art.moods?.length ? ` · ${c.art.moods.join(', ')}` : ''}</div>}
                {c.art.kind === 'dance' && <div className="truncate text-[11px] text-neutral-400">{c.art.sequence.length} steps{c.art.bpm ? ` · ${c.art.bpm} BPM` : ''}</div>}
                {c.art.kind === 'scene' && <div className="truncate text-[11px] text-neutral-400">{c.art.questions.length} question{c.art.questions.length === 1 ? '' : 's'} · {c.art.venueId}</div>}
                {c.art.kind === 'cooking' && <div className="truncate text-[11px] text-neutral-400">{c.art.ingredients.length} ingredients · {c.art.steps.length} steps{c.art.allergens?.length ? ` · contains ${c.art.allergens.join(', ')}` : ''}</div>}
                {c.art.kind === 'fashion' && <div className="truncate text-[11px] text-neutral-400">{c.art.wearableIds.length} pieces{c.art.palette.length ? ` · ${c.art.palette.join(' ')}` : ''}</div>}
                {c.art.kind === 'writing' && <div className="truncate text-[11px] text-neutral-400">{c.art.text.slice(0, 80)}{c.art.text.length > 80 ? '…' : ''}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase text-neutral-500">{DISCIPLINE_META[c.primary]?.label ?? c.primary}</span>
                  <span data-qa="status-chip" className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${CHIP[v.status]}`}>{v.label}</span>
                  {c.primary === 'music' && v.plays > 0 && <span className="text-[10px] text-neutral-400">{v.plays} play{v.plays === 1 ? '' : 's'}</span>}
                </div>
                {(c.remixedFrom || c.remixedBy) && (
                  <p data-qa="remix-credit" className="mt-1 text-[11px] text-violet-300">
                    {c.remixedFrom && <>Remix of “{c.remixedFrom.title}”</>}{c.remixedFrom && c.remixedBy ? ' · ' : ''}
                    {c.remixedBy ? <>Remixed by {c.remixedBy} {c.remixedBy === 1 ? 'card' : 'cards'}</> : null}
                  </p>
                )}
                {v.detail && <p className="mt-1 text-[11px] text-neutral-400">{v.detail}</p>}
                {v.note && <p data-qa="review-note" className="mt-1 rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200"><span className="font-bold">From FEL:</span> {v.note}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                {c.art.kind === 'art' && (
                  <button onClick={() => applyArt(c.id)} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-black">Apply</button>
                )}
                {c.art.kind === 'dance' && (
                  <button onClick={() => equipDance(c)} className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-bold text-black">Equip</button>
                )}
                {v.status === 'rejected' && (
                  <Link href={`/create/${c.primary}`} className="rounded-lg bg-neutral-700 px-3 py-1.5 text-center text-xs font-bold text-neutral-100">Make a new one</Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
