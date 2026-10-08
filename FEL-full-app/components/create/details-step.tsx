'use client';
// components/create/details-step.tsx — CREATE HUB step 2: title, the discipline's own extras, extra disciplines, who
// can see it, and the rights statement (the owner's exact words, versioned; ticking it is also the card's licence).

import React from 'react';
import { CARD_ALLERGENS, DISCIPLINES, DISCIPLINE_META, type ArtPayloadBody, type CardAllergen, type Discipline } from '@/lib/creator/creative-card-types';
import { MOODS } from '@/lib/creator/creative-card-review';
import { SECONDARY_MAX, SPORTS, TITLE_MAX, needsSport, rightsFor, visibilityNote, type FlowContext, type FlowDraft } from '@/lib/create/flow';

const ALLERGEN_LABEL: Record<CardAllergen, string> = {
  milk: 'Milk', egg: 'Egg', fish: 'Fish', shellfish: 'Shellfish', 'tree-nuts': 'Tree nuts', peanuts: 'Peanuts', wheat: 'Wheat', soy: 'Soy', sesame: 'Sesame',
};
const MOOD_LABEL: Record<string, string> = { menu: 'Menus', bed: 'Under games', hype: 'Hype', chill: 'Chill' };

const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-neutral-100 text-black' : 'bg-neutral-800 text-neutral-300'}`;

export default function DetailsStep({ draft, ctx, onDraft }: { draft: FlowDraft; ctx: FlowContext; onDraft: (patch: Partial<FlowDraft>) => void }) {
  const art = draft.art;
  const setArt = (patch: Record<string, unknown>) => art && onDraft({ art: { ...art, ...patch } as ArtPayloadBody });
  const rights = rightsFor(draft.discipline);
  const toggleSecondary = (d: Discipline) => onDraft({
    secondary: draft.secondary.includes(d) ? draft.secondary.filter((x) => x !== d) : draft.secondary.length < SECONDARY_MAX ? [...draft.secondary, d] : draft.secondary,
  });

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Title</span>
        <input data-qa="title" value={draft.title} maxLength={TITLE_MAX} onChange={(e) => onDraft({ title: e.target.value })}
          className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-100" placeholder="Name it" />
      </label>

      {art?.kind === 'music' && (
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Where should it play?</span>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => {
                const on = (art.moods ?? []).includes(m);
                return <button key={m} className={chip(on)} onClick={() => setArt({ moods: on ? (art.moods ?? []).filter((x) => x !== m) : [...(art.moods ?? []), m] })}>{MOOD_LABEL[m] ?? m}</button>;
              })}
            </div>
          </div>
          {!art.loop && art.durationSec && (
            <div className="text-sm text-neutral-300">
              <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Loop for menus (optional)</span>
              <div className="flex flex-wrap items-center gap-2">
                <button className={chip(false)} onClick={() => setArt({ loop: { startSec: 0, endSec: Math.min(art.durationSec!, 30) } })}>Loop the first 30 s</button>
                <span className="text-xs text-neutral-500">Without a loop, menus play the whole track and fade.</span>
              </div>
            </div>
          )}
          {art.loop && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
              <span className="text-xs uppercase tracking-wide text-neutral-400">Loop</span>
              <input type="number" min={0} step={0.1} value={art.loop.startSec} aria-label="loop start, seconds"
                onChange={(e) => setArt({ loop: { ...art.loop!, startSec: Math.max(0, +e.target.value) } })} className="w-20 rounded bg-neutral-900 px-2 py-1" />
              <span>to</span>
              <input type="number" min={1} step={0.1} value={art.loop.endSec} aria-label="loop end, seconds"
                onChange={(e) => setArt({ loop: { ...art.loop!, endSec: Math.min(art.durationSec ?? 240, +e.target.value) } })} className="w-20 rounded bg-neutral-900 px-2 py-1" />
              <span>s</span>
              {art.origin === 'upload' && <button className="text-xs text-neutral-500 underline" onClick={() => { const { loop: _drop, ...rest } = art; onDraft({ art: rest as ArtPayloadBody }); }}>no loop</button>}
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Cover image link (optional, https)</span>
            <input value={art.coverArtUrl} onChange={(e) => setArt({ coverArtUrl: e.target.value.trim() })} placeholder="https://…"
              className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-100" />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            BPM <input type="number" min={40} max={300} value={art.bpm} onChange={(e) => setArt({ bpm: Math.max(40, Math.min(300, Math.round(+e.target.value || 100))) })} className="w-20 rounded bg-neutral-900 px-2 py-1" />
          </label>
        </div>
      )}

      {art?.kind === 'dance' && (
        <label className="flex items-center gap-3 text-sm text-neutral-300">
          <span className="text-xs uppercase tracking-wide text-neutral-400">Tempo</span>
          <input type="range" min={60} max={140} value={art.bpm ?? 96} onChange={(e) => setArt({ bpm: +e.target.value })} className="w-48" />
          <span className="w-16 font-bold">{art.bpm ?? 96} BPM</span>
        </label>
      )}

      {art?.kind === 'art' && (
        <div>
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Surface</span>
          <div className="flex flex-wrap gap-2">
            {(['board', 'court', 'kit', 'ui'] as const).map((s) => <button key={s} className={chip(art.appliedSurface === s)} onClick={() => setArt({ appliedSurface: s })}>{s}</button>)}
          </div>
        </div>
      )}

      {art?.kind === 'cooking' && (
        <div>
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Contains (pick every allergen in it)</span>
          <div className="flex flex-wrap gap-2">
            {CARD_ALLERGENS.map((a) => {
              const on = (art.allergens ?? []).includes(a);
              return <button key={a} data-qa={`allergen-${a}`} className={chip(on)} onClick={() => setArt({ allergens: on ? (art.allergens ?? []).filter((x) => x !== a) : CARD_ALLERGENS.filter((x) => x === a || (art.allergens ?? []).includes(x)) })}>{ALLERGEN_LABEL[a]}</button>;
            })}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Chef-declared from the ingredients, not tested. Players check their own labels.</p>
        </div>
      )}

      {art?.kind === 'sport' && (
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Signature move (optional)</span>
          <input value={art.signatureMoveId ?? ''} maxLength={40} onChange={(e) => setArt({ signatureMoveId: e.target.value.replace(/[^\w '\-]/g, '').slice(0, 40) || undefined })}
            className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-100" placeholder="e.g. Reverse windmill" />
        </label>
      )}

      <div>
        <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Also counts as (up to {SECONDARY_MAX})</span>
        <div className="flex flex-wrap gap-2">
          {DISCIPLINES.filter((d) => d !== draft.discipline).map((d) => (
            <button key={d} className={chip(draft.secondary.includes(d))} onClick={() => toggleSecondary(d)}>{DISCIPLINE_META[d].label}</button>
          ))}
        </div>
      </div>

      {needsSport(draft) && (
        <div>
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">Sport</span>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => <button key={s} className={`${chip(draft.sport === s)} capitalize`} onClick={() => onDraft({ sport: s })}>{s}</button>)}
          </div>
        </div>
      )}

      <fieldset className="rounded-xl bg-neutral-900 p-4">
        <legend className="px-1 text-xs uppercase tracking-wide text-neutral-400">Who can see it</legend>
        <div className="flex gap-2">
          <button data-qa="vis-public" disabled={!ctx.publicCreator} onClick={() => onDraft({ wantsPublic: true })}
            className={`${chip(ctx.publicCreator && draft.wantsPublic)} disabled:opacity-40`}>Public, after review</button>
          <button data-qa="vis-private" onClick={() => onDraft({ wantsPublic: false })} className={chip(!ctx.publicCreator || !draft.wantsPublic)}>Private</button>
        </div>
        <p className="mt-2 text-xs text-neutral-400" data-qa="vis-note">{visibilityNote(draft, ctx)}</p>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-neutral-900 p-4" data-qa="rights">
        <input type="checkbox" checked={draft.rightsTicked} onChange={(e) => onDraft({ rightsTicked: e.target.checked })} className="mt-1 h-5 w-5 shrink-0" />
        <span className="text-sm text-neutral-200">
          {rights.text}
          <span className="mt-1 block text-[10px] uppercase tracking-wide text-neutral-500">Rights statement {rights.version}</span>
        </span>
      </label>
    </div>
  );
}
