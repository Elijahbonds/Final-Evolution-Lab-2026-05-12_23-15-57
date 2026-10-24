'use client';

// TurboPad — R2 ON A PHONE (owner 2026-10-23, hoops round 2: "Touch R2: add a TURBO pad"). The hoops touch deck had the Pro Stick
// (DRIBBLE) but no R2, so the R2 escapes — the snatch-back (R2 + DOWN), the momentum cross, the momentum wrap, the steezo roll — had
// no button of their own on a phone (only the move stick's full-deflection fallback, PlayerSlot's `turboSeen`, until any trigger
// reports).
//
// Holding TURBO is EXACTLY a controller's R2 held: the same InputBus event a pad's right trigger sends (`{ t: 'trigger', side: 'R' }`,
// value 1 down, 0 up), read by the same LocalInputSource as `turbo` / `sprint` — no move logic of its own, no mode reads it by name.
// Letting go (or the pointer cancelled, or the deck unmounting under the thumb) releases R2.
//
// Shown only where modeVerbs says the mode spends R2 (`turbo`: 1v1, 3v3) and only on the touch deck, which itself never draws on a
// screen with no touch or while a pad is held (TouchOverlay). Reduced motion: no press scale, no transition (the colour still says
// "held").

import React, { useEffect, useRef, useState } from 'react';
import type { FelInput, InputBus } from '../core/InputBus';

/** What a pad's R2 sends when pulled all the way, and when let go — the turbo pad sends nothing else. */
export const TURBO_DOWN: FelInput = { t: 'trigger', side: 'R', value: 1 };
export const TURBO_UP: FelInput = { t: 'trigger', side: 'R', value: 0 };

/** The pad's two edges, pure (the component and the tests share them): press → R2 pulled; release → R2 let go, once. */
export function turboControl(bus: Pick<InputBus, 'emit'>): { press(): void; release(): void; held(): boolean } {
  let down = false;
  return {
    press() { if (down) return; down = true; bus.emit(TURBO_DOWN); },
    release() { if (!down) return; down = false; bus.emit(TURBO_UP); },
    held: () => down,
  };
}

const COLOR = '#f43f5e';

/** `shape`: 'pill' above the face diamond (sideways and tablet decks), 'round' beside it (the portrait deck, which has no height to
 *  spare: its right column is already scaled to fit a phone's stage — TouchOverlay.fitDeck). Both stay ≥ 44 px after the deck's scale. */
export function TurboPad({ bus, shape }: { bus: InputBus; shape: 'pill' | 'round' }) {
  const ctl = useRef(turboControl(bus));
  const [held, setHeld] = useState(false);
  useEffect(() => { const c = ctl.current; return () => c.release(); }, []);   // the deck went away under the thumb: R2 let go
  const down = (e: React.PointerEvent) => {
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* the session already ended: the press still counts */ }
    navigator.vibrate?.(12);
    ctl.current.press(); setHeld(true);
  };
  const up = () => { ctl.current.release(); setHeld(false); };
  const size = shape === 'round' ? 'h-14 w-14 rounded-full text-[10px]' : 'h-[52px] w-[104px] rounded-full text-[12px]';
  return (
    <button data-turbo-pad aria-label="Turbo (R2), hold" aria-pressed={held}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()}
      className={`${size} touch-none select-none border-2 font-black tracking-[0.18em] text-white transition-transform duration-75 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100`}
      style={{ borderColor: COLOR, background: held ? `${COLOR}cc` : `${COLOR}26`, boxShadow: held ? `0 0 22px ${COLOR}` : `0 0 12px ${COLOR}55` }}>
      TURBO
    </button>
  );
}
