'use client';

// DancePad — the Cypher's phone pad (data and the why: ./padModel.ts). Mounted by TouchOverlay in place of its generic rig
// when the mode is 'dance'; it is the same overlay (same bus, same safe-area and fit rules), not a second one.
//
// Two thumb pairs in the bottom corners, A B under the left thumb and X Y under the right, in the TV HUD's palette (a dark
// glass plate, the slot colour on the rim, the display face for the letter). Every press is the event MODE_VERBS.dance names
// and every lift is that event released, so a held freeze is a held finger. Pointer-captured per button, so the two thumbs
// are independent and a finger that slides off its button still releases it.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import type { FelInput, InputBus } from '../../core/InputBus';
import { HUD_FONT_CLASS, HUD_PLATE, hudColor, hudType } from '@/components/games/tv-hud/tokens';
import {
  PAD_BUTTON, PAD_GAP_PX, PICK_KEY, PICK_KEYS, PICK_RAISE_PX, PAD_LEFT, padButtons, pickEvent, type DancePadState, type PadButton, type PadDeck,
} from './padModel';
import { padStore } from './padStore';

// setPointerCapture throws NotFoundError when the browser already dropped the pointer (a fast tap on some WebViews):
// capture is a nicety, never a precondition for the input itself (TouchOverlay.safeCapture, the same rule).
function safeCapture(el: Element, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* session already gone */ }
}

export interface PadFit { lift: number; left: number; right: number }

export function DancePad({ bus, state: given, deck, fit, leftRef, rightRef }: {
  bus: InputBus;
  /** Tests only: a state to draw. In the app it is the room's, from padStore. */
  state?: DancePadState;
  deck: PadDeck;
  /** TouchOverlay.fitDeck, per side: lift the pairs into the visible stage and scale them to fit it. */
  fit: PadFit;
  leftRef: RefObject<HTMLDivElement>;
  rightRef: RefObject<HTMLDivElement>;
}) {
  const live = useSyncExternalStore(padStore.subscribe, padStore.get, padStore.getServer);
  const state = given ?? live;
  const buttons = padButtons(state);
  const b = PAD_BUTTON[deck];
  const pick = state.mode === 'pick';
  const side = (end: 'left' | 'right', k: number, origin: string): CSSProperties => ({
    [end]: `max(${12}px, env(safe-area-inset-${end}))`,
    bottom: `calc(max(12px, env(safe-area-inset-bottom)) + ${fit.lift}px)`,
    transform: `scale(${k})`, transformOrigin: origin,
  });
  const pair = (slots: readonly string[]) => buttons.filter((x) => slots.includes(x.slot));
  const left = pair(PAD_LEFT), right = buttons.filter((x) => !PAD_LEFT.includes(x.slot));
  return (
    <div data-touch-deck data-dance-pad={state.mode} className="pointer-events-none absolute inset-0 z-30">
      <div ref={leftRef} data-pad-pair="left" className="pointer-events-auto absolute flex flex-col items-start" style={{ ...side('left', fit.left, 'bottom left'), gap: PAD_GAP_PX }}>
        {pick && <div className="flex" style={{ gap: PAD_GAP_PX, marginBottom: PICK_RAISE_PX[deck] }}>{PICK_KEYS.filter((k) => k.dir === 'left' || k.dir === 'right').map((k) => <PickKey key={k.dir} bus={bus} k={k} />)}</div>}
        <div className="flex" style={{ gap: PAD_GAP_PX }}>{left.map((x) => <PadKey key={x.slot} bus={bus} btn={x} w={b.w} h={b.h} />)}</div>
      </div>
      <div ref={rightRef} data-pad-pair="right" className="pointer-events-auto absolute flex flex-col items-end" style={{ ...side('right', fit.right, 'bottom right'), gap: PAD_GAP_PX }}>
        {pick && <div className="flex" style={{ gap: PAD_GAP_PX, marginBottom: PICK_RAISE_PX[deck] }}>{PICK_KEYS.filter((k) => k.dir === 'down' || k.dir === 'up').map((k) => <PickKey key={k.dir} bus={bus} k={k} />)}</div>}
        <div className="flex" style={{ gap: PAD_GAP_PX }}>{right.map((x) => <PadKey key={x.slot} bus={bus} btn={x} w={b.w} h={b.h} />)}</div>
      </div>
    </div>
  );
}

/** One press, held by one finger: down emits the verb's event, up emits it released — once, whatever ends the touch. */
function useHeldVerb(bus: InputBus) {
  const held = useRef<FelInput | null>(null);
  const [down, setDown] = useState(false);
  const press = (e: React.PointerEvent, ev: FelInput, up: FelInput) => {
    if (held.current) return;
    safeCapture(e.currentTarget, e.pointerId);
    if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
    held.current = up;
    setDown(true);
    bus.emit(ev);
  };
  const lift = () => {
    const up = held.current;
    if (!up) return;
    held.current = null;
    setDown(false);
    bus.emit(up);
  };
  // a pad that unmounts under a finger (the song ends) must not leave the verb down
  useEffect(() => () => { const up = held.current; held.current = null; if (up) bus.emit(up); }, [bus]);
  return { down, press, lift };
}

export function PadKey({ bus, btn, w, h }: { bus: InputBus; btn: PadButton; w: number; h: number }) {
  const { down, press, lift } = useHeldVerb(bus);
  if (!btn.live || !btn.down || !btn.up) {
    // an empty socket: the slot keeps its place so the live ones never move, but it is not a control (modeVerbs' rule)
    return <div aria-hidden="true" data-pad-socket={btn.slot} className="pointer-events-none rounded-2xl border border-dashed border-white opacity-30" style={{ width: w, height: h }} />;
  }
  const word = btn.label.length > 1;
  const lines = btn.sub.split(' · ');
  return (
    <button
      type="button"
      data-pad-key={btn.slot}
      aria-label={`${btn.slot} ${btn.label}${btn.sub && word ? '' : btn.sub ? ` ${btn.sub}` : ''}`}
      onPointerDown={(e) => press(e, btn.down!, btn.up!)} onPointerUp={lift} onPointerCancel={lift}
      className="flex touch-none select-none flex-col items-center justify-center rounded-2xl text-center transition-transform duration-75 active:scale-95"
      style={{
        width: w, height: h, color: hudColor('text'),
        background: down ? hudColor('ink', 0.5) : HUD_PLATE.background,
        border: `2px solid ${btn.color}`,
        boxShadow: down ? `0 0 0 2px ${btn.color}, 0 0 22px ${btn.color}aa, inset 0 0 18px ${btn.color}66` : `0 0 14px ${btn.color}44, ${HUD_PLATE.shadow}`,
      }}
    >
      <span className={HUD_FONT_CLASS} style={{ ...hudType(word ? 'value' : 'stat'), color: word ? hudColor('text') : btn.color }}>{btn.label}</span>
      {btn.sub && (word
        ? <span style={{ ...hudType('caption'), color: btn.color }}>{btn.sub}</span>
        : lines.map((l) => <span key={l} style={{ ...hudType('caption'), opacity: 0.85 }}>{l}</span>))}
    </button>
  );
}

export function PickKey({ bus, k }: { bus: InputBus; k: (typeof PICK_KEYS)[number] }) {
  const { down, press, lift } = useHeldVerb(bus);
  return (
    <button
      type="button"
      data-pick-key={k.dir}
      aria-label={`${k.label} ${k.dir}`}
      onPointerDown={(e) => press(e, pickEvent(k.dir, true), pickEvent(k.dir, false))} onPointerUp={lift} onPointerCancel={lift}
      className="flex touch-none select-none flex-col items-center justify-center rounded-xl text-center transition-transform duration-75 active:scale-95"
      style={{
        width: PICK_KEY.w, height: PICK_KEY.h, color: hudColor('text'),
        background: down ? hudColor('you', 0.3) : HUD_PLATE.background, border: `1px solid ${hudColor('you', 0.5)}`, boxShadow: HUD_PLATE.shadow,
      }}
    >
      <span style={{ ...hudType('value'), lineHeight: 1 }}>{k.glyph}</span>
      <span style={{ ...hudType('caption'), opacity: 0.75 }}>{k.label}</span>
    </button>
  );
}
