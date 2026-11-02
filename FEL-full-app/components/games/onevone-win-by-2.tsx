'use client';
// The 1v1's WIN BY 2 pick on the READY screen (owner 2026-10-06, the moderate option): a player option, OFF by default,
// remembered on this device (onevoneRules WIN_BY_2_KEY). Not drawn at all on a staked or head-to-head run (`?arena=`,
// `?mp=`, `?c=`: onevoneRules.winBy2Offered), where both players play first to 11 and the Arena ceiling stays 13.
// OneVOneMode reads the pick when the run starts (winBy2Requested), so the choice made here is the game that is played.

import React, { useEffect, useState } from 'react';
import { readWinBy2Pick, writeWinBy2Pick, winBy2Offered, WIN_BY_2_CAP } from '@/lib/babylon/modes/onevoneRules';

export function OneVOneWinBy2() {
  const [offered, setOffered] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const ok = typeof window !== 'undefined' && winBy2Offered(window.location.search);
    setOffered(ok);
    setOn(ok && readWinBy2Pick());
  }, []);
  if (!offered) return null;
  const flip = () => { const next = !on; writeWinBy2Pick(next); setOn(next); };
  return (
    <div className="mt-3 flex flex-col items-center gap-1.5" data-onevone-winby2>
      <p className="text-[9px] font-black tracking-[0.3em] text-white/45">RULES</p>
      <button type="button" role="switch" aria-checked={on} onClick={flip}
        aria-label={`Win by 2 — ${on ? 'on' : 'off'}`}
        className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${on ? 'border-[var(--fel-gold)] bg-[var(--fel-gold)] text-black' : 'border-white/30 text-white/80 hover:bg-white/10'}`}>
        WIN BY 2 · {on ? 'ON' : 'OFF'}
      </button>
      <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
        {on ? `To 11, but you must lead by 2 — the first to ${WIN_BY_2_CAP} wins whatever the margin.` : 'First to 11 wins.'}
      </p>
    </div>
  );
}
