'use client';

// "PLAY AS …" on a game's start screen (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a). The owner: "1 slot that looks like
// me, then switch to another character I made". A compact row of the player's saved characters; tapping one makes it
// the character every mode spawns, then reloads the mode so the hero on the court is that character.
//
// Read: GET /api/v1/closet?for=slots (labels, bodies and colour chips only). Write: POST /api/v1/closet/active, which
// moves only the pointer. A player whose look is device-only (under 18 / unknown age, LOOK PRIVACY) switches the DEVICE
// copy instead and nothing is sent (resolveIdentity reads that copy in every mode: TEEN_DEVICE_LOOK_EVERYWHERE). Shown
// only to a signed-in player with two or more characters; a guest, a failed read or one character renders nothing.
// No Babylon here: the mode reloads, so the next spawn resolves the identity afresh.

import { useEffect, useState } from 'react';
import { readLocalLook, writeLocalLook } from '@/lib/creator/localLook';
import { activeSlotId, slotSummaries, switchActive, type SlotSummary } from '@/lib/creator/look/slots';

interface SlotsAnswer { slots: SlotSummary[]; activeSlot: string | null; lookLocal: boolean }

/** What the switcher shows: the server's list, or the device's for a device-only look. Pure (tests drive it). */
export function switcherSlots(answer: SlotsAnswer | null, deviceFace: unknown): { slots: SlotSummary[]; active: string | null; local: boolean } | null {
  if (!answer) return null;
  if (answer.lookLocal) {
    const slots = slotSummaries(deviceFace);
    return { slots, active: activeSlotId(deviceFace), local: true };
  }
  return { slots: answer.slots ?? [], active: answer.activeSlot ?? null, local: false };
}

export function PlayAsSwitcher({ tint = '#00E5FF', reload = () => window.location.reload() }: { tint?: string; reload?: () => void }) {
  const [state, setState] = useState<ReturnType<typeof switcherSlots>>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/v1/closet?for=slots')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SlotsAnswer | null) => { if (live) setState(switcherSlots(j, readLocalLook()?.face)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!state || state.slots.length < 2) return null;

  const pick = async (id: string) => {
    if (busy || id === state.active) return;
    setBusy(id);
    try {
      if (state.local) {
        // device only: nothing leaves the phone
        const local = readLocalLook();
        const next = local?.face ? switchActive(local.face, id, true) : null;
        if (!next) { setBusy(null); return; }
        writeLocalLook({ ...local, face: next.face as never, ...(next.equipped ? { equipped: { ...(local?.equipped ?? {}), ...next.equipped } } : {}) });
      } else {
        const r = await fetch('/api/v1/closet/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId: id }) });
        if (!r.ok) { setBusy(null); return; }
      }
      reload();
    } catch { setBusy(null); }
  };

  return (
    <div className="mt-2 flex flex-col items-center gap-1.5" aria-label="Play as">
      <p className="text-[9px] font-black tracking-[0.3em] text-white/45">PLAY AS</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {state.slots.map((s) => {
          const on = s.id === state.active;
          return (
            <button key={s.id} type="button" onClick={() => void pick(s.id)} aria-pressed={on} disabled={!!busy}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wider transition ${on ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
              style={on ? { background: tint, borderColor: tint } : { borderColor: 'rgba(255,255,255,0.2)' }}>
              <span aria-hidden className="flex -space-x-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/30" style={{ background: s.chips.skin }} />
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/30" style={{ background: s.chips.hair }} />
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/30" style={{ background: s.chips.accent }} />
              </span>
              {busy === s.id ? 'SWITCHING…' : s.label || '—'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
