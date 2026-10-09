'use client';
// The 3-Point Contest's options (IMPROVE 2026-10-06, the threepoint items the owner picked):
//   #6 PRACTICE RACK — a no-clock, no-field rack before qualifying, to learn the window (off unless turned on);
//   #5 MONEY RACK    — one rack where all five balls are money balls, as the modern contest has (off: the 2009 format);
//   #8 SHOT          — hold-and-release or tap-on-time, shown before the first press (it was a setting nothing on screen named).
// The first two are rules: on the READY screen only, remembered on this device, and not drawn at all on a staked or
// head-to-head run (`?arena=`, `?mp=`, `?c=`: threePointRules.optionsOffered) — both shooters shoot the same contest there and
// the Arena ceiling stays 30. ThreePointMode reads them on the run's first frame. SHOT is an input preference, offered
// everywhere, and also on the pause screen (`variant="pause"`): the mode takes a switch from the next ball, never inside one.

import React, { useEffect, useState } from 'react';
import {
  optionsOffered, readPracticePick, writePracticePick, readMoneyRackPick, writeMoneyRackPick, NO_MONEY_RACK, TP_RACKS,
} from '@/lib/babylon/modes/threePointRules';
import { readShotInputMode, setShotInputMode, type ShotInputMode } from '@/lib/babylon/core/ShotInputMode';

const pill = (on: boolean): string =>
  `rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${on ? 'border-[var(--fel-gold)] bg-[var(--fel-gold)] text-black' : 'border-white/30 text-white/80 hover:bg-white/10'}`;
/** A click never leaves focus on a pill: Space is SHOOT, and a focused button answers Space with a click. */
const noFocus = (e: React.MouseEvent): void => e.preventDefault();

export function ThreePointOptions({ variant = 'ready' }: { variant?: 'ready' | 'pause' }) {
  const [offered, setOffered] = useState(false);
  const [practice, setPractice] = useState(false);
  const [moneyRack, setMoneyRack] = useState(NO_MONEY_RACK);
  const [shot, setShot] = useState<ShotInputMode>('hold-release');
  useEffect(() => {
    const ok = typeof window !== 'undefined' && optionsOffered(window.location.search);
    setOffered(ok);
    setPractice(ok && readPracticePick());
    setMoneyRack(ok ? readMoneyRackPick() : NO_MONEY_RACK);
    setShot(readShotInputMode());
  }, []);
  const rules = offered && variant === 'ready';
  const flipShot = () => { const next: ShotInputMode = shot === 'hold-release' ? 'tap-timing' : 'hold-release'; setShotInputMode(next); setShot(next); };
  const flipPractice = () => { const next = !practice; writePracticePick(next); setPractice(next); };
  const pickRack = (r: number) => { writeMoneyRackPick(r); setMoneyRack(r); };
  return (
    <div className={`flex flex-col items-center gap-1.5 ${variant === 'ready' ? 'mt-3' : ''}`} data-threepoint-options={variant}
      onPointerDown={(e) => e.stopPropagation()}>
      <p className="text-[9px] font-black tracking-[0.3em] text-white/45">{rules ? 'CONTEST' : 'SHOT'}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); flipShot(); }}
          aria-label={`Shot input — ${shot === 'hold-release' ? 'hold and release' : 'tap on time'}`} className={pill(true)}>
          SHOT · {shot === 'hold-release' ? 'HOLD & RELEASE' : 'TAP ON TIME'}
        </button>
        {rules && (
          <button type="button" role="switch" aria-checked={practice} onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); flipPractice(); }}
            aria-label={`Practice rack — ${practice ? 'on' : 'off'}`} className={pill(practice)}>
            PRACTICE RACK · {practice ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
      {rules && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Money rack">
          <span className="text-[9px] font-black tracking-[0.2em] text-white/45">MONEY RACK</span>
          {[NO_MONEY_RACK, ...Array.from({ length: TP_RACKS }, (_, i) => i)].map((r) => (
            <button key={r} type="button" role="radio" aria-checked={moneyRack === r} onMouseDown={noFocus}
              onClick={(e) => { e.currentTarget.blur(); pickRack(r); }}
              aria-label={r < 0 ? 'No money rack' : `Money rack ${r + 1}`} className={pill(moneyRack === r)}>
              {r < 0 ? 'OFF' : r + 1}
            </button>
          ))}
        </div>
      )}
      <p className="max-w-[24rem] text-center text-[9px] leading-tight tracking-wide text-white/40">
        {shot === 'hold-release' ? 'Hold to rise, let go at the top of the green.' : 'One tap when the bar is in the green.'}
        {rules && practice ? ' A no-clock rack first, to learn the window.' : ''}
        {rules && moneyRack >= 0 ? ` Every ball of rack ${moneyRack + 1} is worth 2.` : ''}
        {variant === 'pause' ? ' From the next ball.' : ''}
      </p>
    </div>
  );
}
