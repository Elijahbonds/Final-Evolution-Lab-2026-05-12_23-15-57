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
import { HudText, hudColor, hudType } from './tv-hud';   // WAVE 3 (lane/w3-present): the options are on the TV HUD scale (10 px was a 22 px label on a 1080p TV) and the one palette

/** A pill: the label step (so it is readable at the couch), gold when on, a hairline when off. */
const pillClass = 'rounded-full border px-3 py-1 transition';
const pill = (on: boolean) => ({
  className: pillClass,
  style: { ...hudType('label'), letterSpacing: '0.08em', fontWeight: 800, ...(on ? { borderColor: hudColor('score'), background: hudColor('score'), color: hudColor('ink') } : { borderColor: hudColor('text', 0.3), color: hudColor('text', 0.8) }) },
});
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
      <HudText as="div" size="caption" alpha={0.5} style={{ fontWeight: 800, letterSpacing: '0.3em' }}>{rules ? 'CONTEST' : 'SHOT'}</HudText>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); flipShot(); }}
          aria-label={`Shot input — ${shot === 'hold-release' ? 'hold and release' : 'tap on time'}`} {...pill(true)}>
          SHOT · {shot === 'hold-release' ? 'HOLD & RELEASE' : 'TAP ON TIME'}
        </button>
        {rules && (
          <button type="button" role="switch" aria-checked={practice} onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); flipPractice(); }}
            aria-label={`Practice rack — ${practice ? 'on' : 'off'}`} {...pill(practice)}>
            PRACTICE RACK · {practice ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
      {rules && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Money rack">
          <HudText size="caption" alpha={0.5} style={{ fontWeight: 800, letterSpacing: '0.2em' }}>MONEY RACK</HudText>
          {[NO_MONEY_RACK, ...Array.from({ length: TP_RACKS }, (_, i) => i)].map((r) => (
            <button key={r} type="button" role="radio" aria-checked={moneyRack === r} onMouseDown={noFocus}
              onClick={(e) => { e.currentTarget.blur(); pickRack(r); }}
              aria-label={r < 0 ? 'No money rack' : `Money rack ${r + 1}`} {...pill(moneyRack === r)}>
              {r < 0 ? 'OFF' : r + 1}
            </button>
          ))}
        </div>
      )}
      <p className="max-w-[24rem] text-center" style={{ ...hudType('caption'), color: hudColor('text', 0.55) }}>
        {shot === 'hold-release' ? 'Hold to rise, let go at the top of the green.' : 'One tap when the bar is in the green.'}
        {rules && practice ? ' A no-clock rack first, to learn the window.' : ''}
        {rules && moneyRack >= 0 ? ` Every ball of rack ${moneyRack + 1} is worth 2.` : ''}
        {variant === 'pause' ? ' From the next ball.' : ''}
      </p>
    </div>
  );
}
