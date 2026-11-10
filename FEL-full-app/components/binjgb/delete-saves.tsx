'use client';

// components/binjgb/delete-saves.tsx — BINJGB-SHELF-1 (Cyber G7): the visible "Delete saves" control. It removes the
// fel_binjgb database on this device only; nothing is stored anywhere else.
import { useState } from 'react';
import { deleteAllSaves } from '@/lib/binjgb/savesDb';
import { SAVES_COPY } from '@/lib/binjgb/copy';

export function DeleteSaves() {
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  if (asking) {
    return (
      <div role="alertdialog" aria-labelledby="gb-del-title" aria-describedby="gb-del-body" className="fel-card rounded-xl p-4">
        <p id="gb-del-title" className="text-sm font-semibold text-white">{SAVES_COPY.confirmTitle}</p>
        <p id="gb-del-body" className="mt-1 text-xs text-white/60">{SAVES_COPY.confirmBody}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-lg bg-[#FFD700] px-3 py-2 text-xs font-bold text-black"
            onClick={async () => { await deleteAllSaves(); setAsking(false); setDone(true); }}>
            {SAVES_COPY.confirm}
          </button>
          <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/80" onClick={() => setAsking(false)}>
            {SAVES_COPY.cancel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:text-white"
        onClick={() => { setDone(false); setAsking(true); }}>
        {SAVES_COPY.control}
      </button>
      {done ? <span role="status" className="text-xs text-white/60">{SAVES_COPY.done}</span> : null}
    </div>
  );
}
