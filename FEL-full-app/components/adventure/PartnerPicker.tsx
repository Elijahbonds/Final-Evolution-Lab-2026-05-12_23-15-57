'use client';

// The first-run partner picker (Phase B; owner: "the partner is BOTH, player's choice — an evolving creature or a second
// built character"). A creature (the Garden's species, each with its element) or a character (one of the player's own
// Creator slots, or the default look for a guest, with an element the player picks). The pick is handed back; the
// stage writes it to the device save under the save policy (lib/babylon/adventure/story/party).
// Species and slot labels are the existing placeholders until the owner names things.

import { useState } from 'react';
import type { Element } from '@/lib/babylon/adventure/contracts';
import { CHARACTER_ELEMENTS, DEFAULT_CHARACTER_SLOT, creatureChoices, type PartnerPick } from '@/lib/babylon/adventure/story/party';
// look pass C2 (story.titleCard): each creature as the silhouette of its in-game body, not a dot
import { CreatureSilhouette, ELEMENT_COLOR } from './CreatureSilhouette';

/** `cards` (story.titleCard, look pass C2): the creatures as silhouette cards. Off = the dots, exactly as before. */
export function PartnerPicker({ slots, onPick, cards = false }: { slots: { id: string; label: string }[]; onPick: (p: PartnerPick) => void; cards?: boolean }) {
  const [kind, setKind] = useState<'creature' | 'character'>('creature');
  const [species, setSpecies] = useState(creatureChoices()[0]?.speciesId ?? '');
  const [slot, setSlot] = useState(slots[0]?.id ?? DEFAULT_CHARACTER_SLOT);
  const [element, setElement] = useState<Element>('light');
  const [name, setName] = useState('');
  const slotList = slots.length ? slots : [{ id: DEFAULT_CHARACTER_SLOT, label: 'DEFAULT LOOK' }];
  const pick = (): PartnerPick => (kind === 'creature'
    ? { kind, speciesId: species, ...(name.trim() ? { name: name.trim() } : {}) }
    : { kind, creatorSlotId: slot, element, ...(name.trim() ? { name: name.trim() } : {}) });
  return (
    <div className="w-full max-w-xl space-y-3 rounded-xl border border-white/10 bg-black/70 p-4 font-sans text-white" data-testid="adventure-partner-picker">
      <p className="text-[12px] font-black tracking-[0.3em] text-white/50">CHOOSE YOUR PARTNER</p>
      <div className="flex gap-2">
        {(['creature', 'character'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-black ${kind === k ? 'bg-[#00E5FF] text-black' : 'bg-white/10'}`}>
            {k === 'creature' ? 'A CREATURE' : 'A CHARACTER'}
          </button>
        ))}
      </div>
      {kind === 'creature' ? (
        <div className="grid grid-cols-3 gap-2">
          {creatureChoices().map((c) => (cards ? (
            <button key={c.speciesId} type="button" onClick={() => setSpecies(c.speciesId)} data-testid={`partner-species-${c.speciesId}`}
              aria-pressed={species === c.speciesId}
              className={`flex min-h-[44px] flex-col items-center overflow-hidden rounded-xl border text-center transition ${species === c.speciesId ? 'border-[#00E5FF] bg-white/10 shadow-[0_0_18px_rgba(0,229,255,0.25)]' : 'border-white/10 bg-white/[0.03]'}`}>
              <span className="flex w-full justify-center pb-1 pt-3" data-testid={`partner-silhouette-${c.speciesId}`}
                style={{ background: `radial-gradient(ellipse at 50% 80%, ${ELEMENT_COLOR[c.element]}40 0%, transparent 70%)` }}>
                <CreatureSilhouette color={ELEMENT_COLOR[c.element]} size={44} />
              </span>
              <span className="block w-full px-1 text-xs font-black tracking-tight [overflow-wrap:anywhere]">{c.speciesId.toUpperCase()}</span>
              <span className="block px-1 pb-2 text-[12px] leading-tight text-white/60">{c.element.toUpperCase()} · RIDE · FLIES LATER</span>
            </button>
          ) : (
            <button key={c.speciesId} type="button" onClick={() => setSpecies(c.speciesId)} data-testid={`partner-species-${c.speciesId}`}
              className={`rounded-lg border p-2 text-left ${species === c.speciesId ? 'border-[#00E5FF] bg-white/10' : 'border-white/10'}`}>
              <span className="block h-6 w-6 rounded-full" style={{ background: ELEMENT_COLOR[c.element] }} />
              <span className="mt-1 block text-xs font-black">{c.speciesId.toUpperCase()}</span>
              <span className="block text-[12px] text-white/60">{c.element.toUpperCase()} · RIDE · FLIES LATER</span>
            </button>
          )))}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-white/70">LOOK
            <select value={slot} onChange={(e) => setSlot(e.target.value)} className="ml-2 rounded bg-white/10 px-2 py-1 text-white">
              {slotList.map((s) => <option key={s.id} value={s.id} className="text-black">{s.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            {CHARACTER_ELEMENTS.map((el) => (
              <button key={el} type="button" onClick={() => setElement(el)}
                className={`rounded px-2 py-1 text-[12px] font-black ${element === el ? 'text-black' : 'bg-white/10'}`}
                style={element === el ? { background: ELEMENT_COLOR[el] } : undefined}>{el.toUpperCase()}</button>
            ))}
          </div>
        </div>
      )}
      <label className="block text-xs text-white/70">NAME
        <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="PARTNER"
          className="ml-2 rounded bg-white/10 px-2 py-1 uppercase text-white" />
      </label>
      <p className="text-[12px] text-white/50">Your partner fights beside you and grows with you. Saved on this device.</p>
      <button type="button" onClick={(e) => { e.currentTarget.blur(); onPick(pick()); }} data-testid="adventure-partner-confirm"
        className="w-full rounded bg-[#00E5FF] px-4 py-2 font-black text-black">THIS IS MY PARTNER</button>
    </div>
  );
}
