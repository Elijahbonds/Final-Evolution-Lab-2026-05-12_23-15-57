'use client';

// CardSlot — the start screen's CREATOR CARD slot and the equipped card's button map (FINISH-RELEASE, 2026-09-15).
// Sits in BootSplash beside the setting and item pickers, on every mode. See lib/creator/cardSlot.ts for the decisions.
//
// The card row appears only for a signed-in player with at least one card (a slot with nothing to pick is a hollow
// picker). Equipping reloads the route, like a venue pick: the hero's look is applied when the rig spawns, and a card
// equipped under a spawned hero would change nothing you can see until the next load.
// The BUTTONS map shows for everyone, collapsed to one line until opened, so it never pushes START off a phone.

import { useEffect, useMemo, useState } from 'react';
import { buttonMap, type SlotCard } from '@/lib/creator/cardSlot';

export function CardSlot({ modeId }: { modeId: string }) {
  const [cards, setCards] = useState<SlotCard[]>([]);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => buttonMap(modeId), [modeId]);

  useEffect(() => {
    let live = true;
    fetch('/api/v1/card-slot').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !j) return;
      setCards(Array.isArray(j.cards) ? j.cards : []);
      setEquipped(typeof j.equipped === 'string' ? j.equipped : null);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const equip = async (id: string | null) => {
    if (busy || id === equipped) return;
    setBusy(true);
    const ok = await fetch('/api/v1/card-slot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      .then((r) => r.ok).catch(() => false);
    if (!ok) { setBusy(false); return; }
    setEquipped(id);
    window.location.reload();
  };

  const on = cards.find((c) => c.id === equipped) ?? null;
  const verbs = rows.filter((r) => r.group !== 'move');
  const moves = rows.filter((r) => r.group === 'move');

  return (
    <div className="mt-3 flex flex-col items-center gap-1.5" data-testid="card-slot">
      {cards.length > 0 && (
        <>
          <p className="text-[9px] font-black tracking-[0.3em] text-white/45">CREATOR CARD</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => equip(null)} aria-pressed={equipped === null} disabled={busy}
              className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${equipped === null ? 'bg-white text-black' : 'border-white/30 text-white/80 hover:bg-white/10'}`}>
              BASE
            </button>
            {cards.map((c) => (
              <button key={c.id} type="button" onClick={() => equip(c.id)} aria-pressed={c.id === equipped} disabled={busy}
                title={`${c.rarity.toUpperCase()}${c.signatureMove ? ` · ${c.signatureMove}` : ''}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${c.id === equipped ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                style={c.id === equipped ? { background: c.accent, borderColor: c.accent } : { borderColor: `${c.accent}88` }}>
                <span aria-hidden className="inline-block h-2.5 w-2 rounded-[2px]" style={{ background: c.accent, boxShadow: `0 0 6px ${c.accent}aa` }} />
                {c.name.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
            {on ? `${on.rarity.toUpperCase()} · your look${on.signatureMove ? ` · signature ${on.signatureMove}` : ''}` : 'no card — the base athlete'}
          </p>
        </>
      )}

      {rows.length > 0 && (
        <div className="mt-1 flex flex-col items-center">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="rounded-full border border-white/20 px-3 py-0.5 text-[9px] font-black tracking-[0.3em] text-white/60 hover:bg-white/10">
            BUTTONS {open ? '▲' : '▼'}
          </button>
          {open && (
            // the splash starts the game on a pointer-down anywhere that is not a button — reading the map must not
            <div onPointerDown={(e) => e.stopPropagation()} className="mt-1.5 max-h-40 w-[min(26rem,90vw)] overflow-y-auto rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-left">
              {[verbs, moves].filter((g) => g.length).map((g, gi) => (
                <div key={gi} className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${gi ? 'mt-1.5 border-t border-white/10 pt-1.5' : ''}`}>
                  {g.map((r) => (
                    <div key={`${r.input}-${r.action}`} className="contents">
                      <span className="font-mono text-[10px] font-black text-[#22d3ee]">{r.input}</span>
                      <span className="font-mono text-[10px] text-white/80">{r.action}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
