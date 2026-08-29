'use client';

// TouchOverlay — THE single touch control component. Mounted ONCE by the
// harness route; every legacy in-canvas button set must be deleted.
// Portrait: DS-style bottom deck. Landscape: translucent side overlay.
// Emits FelInput through the SAME bus keyboard/gamepad use; buttons emit
// press AND release; hold buttons stream analog trigger 0→1; sticks stream
// a normalized vector and recenter on lift.
//
// UNIFORM CONTROLLER LAYOUT — every mode renders the exact same rig: left
// stick + d-pad on the left, right stick + A/B/X/Y diamond on the right.
// Modes differ only in what each control DOES (modeVerbs.ts), never in
// which controls are on screen — the console-emulator feel the whole point
// of this file is to guarantee. A slot a given mode has no use for is still
// drawn and still pressable; it just has nothing listening on the other end.

import React, { useEffect, useRef, useState } from 'react';
import type { InputBus } from '../core/InputBus';
import { MODE_VERBS, type VerbButton } from './modeVerbs';

// setPointerCapture throws NotFoundError if the browser has already dropped
// the pointer session by the time the handler runs (seen on some mobile
// WebViews on a fast tap-and-release) — capture is a nice-to-have (keeps the
// drag tracking a finger that slides off the control), never a precondition
// for the input itself, so a failure here must never block the emit below it.
function safeCapture(el: Element, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* session already gone — fine */ }
}

export function TouchOverlay(props: { bus: InputBus; modeId: string; visible: boolean }) {
  const cfg = MODE_VERBS[props.modeId] ?? MODE_VERBS.default;
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const onR = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  if (!props.visible || props.bus.gamepadActive) return null;

  return (
    <div className={landscape
      ? 'pointer-events-none absolute inset-0 z-30'
      : 'pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[44vh] bg-gradient-to-t from-black/85 to-transparent'}>
      <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-col items-center gap-2">
        <DPad bus={props.bus} />
        <AnalogStick bus={props.bus} side="L" label="MOVE" />
      </div>
      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-center gap-2">
        <ButtonDiamond bus={props.bus} buttons={cfg.buttons} />
        <AnalogStick bus={props.bus} side="R" label="LOOK" />
      </div>
    </div>
  );
}

function AnalogStick({ bus, side, label }: { bus: InputBus; side: 'L' | 'R'; label: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const setVec = (x: number, y: number) => {
    bus.emit({ t: 'stick', side, x, y });
    if (knob.current) knob.current.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
  };

  const onMove = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !zone.current) return;
    const r = zone.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    setVec(dx * k, dy * k);
  };

  return (
    <div ref={zone}
      onPointerDown={(e) => { active.current = e.pointerId; safeCapture(e.target as Element, e.pointerId); onMove(e); }}
      onPointerMove={onMove}
      onPointerUp={() => { active.current = null; setVec(0, 0); }}
      onPointerCancel={() => { active.current = null; setVec(0, 0); }}
      className="relative h-24 w-24 touch-none rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
      <div ref={knob}
        className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full bg-white/20 shadow-lg transition-transform duration-75" />
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black tracking-widest text-white/30">
        {label}
      </span>
    </div>
  );
}

function DPad({ bus }: { bus: InputBus }) {
  const press = (dir: 'up' | 'down' | 'left' | 'right') => () => bus.emit({ t: 'dpad', dir, pressed: true });
  const release = (dir: 'up' | 'down' | 'left' | 'right') => () => bus.emit({ t: 'dpad', dir, pressed: false });
  const seg = 'absolute flex touch-none select-none items-center justify-center border border-white/15 bg-white/8 text-[10px] text-white/50 active:bg-white/25 active:text-white';
  return (
    <div className="relative h-[72px] w-[72px]">
      <button
        className={`${seg} left-1/2 top-0 h-6 w-6 -translate-x-1/2 rounded-t-md`}
        onPointerDown={press('up')} onPointerUp={release('up')} onPointerCancel={release('up')} onPointerLeave={release('up')}
      >▲</button>
      <button
        className={`${seg} bottom-0 left-1/2 h-6 w-6 -translate-x-1/2 rounded-b-md`}
        onPointerDown={press('down')} onPointerUp={release('down')} onPointerCancel={release('down')} onPointerLeave={release('down')}
      >▼</button>
      <button
        className={`${seg} left-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-l-md`}
        onPointerDown={press('left')} onPointerUp={release('left')} onPointerCancel={release('left')} onPointerLeave={release('left')}
      >◀</button>
      <button
        className={`${seg} right-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-r-md`}
        onPointerDown={press('right')} onPointerUp={release('right')} onPointerCancel={release('right')} onPointerLeave={release('right')}
      >▶</button>
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/5" />
    </div>
  );
}

// Fixed Xbox-style diamond: Y top, X left, B right, A bottom. Position and
// per-slot color are ALWAYS the same across every mode — only the label and
// what pressing it does change. A slot a mode leaves unassigned still shows
// its bare letter, muted, and simply does nothing when pressed.
const SLOT_POS: Record<'A' | 'B' | 'X' | 'Y', string> = {
  Y: 'left-1/2 top-0 -translate-x-1/2',
  X: 'left-0 top-1/2 -translate-y-1/2',
  B: 'right-0 top-1/2 -translate-y-1/2',
  A: 'left-1/2 bottom-0 -translate-x-1/2',
};
const SLOT_ORDER: Array<'A' | 'B' | 'X' | 'Y'> = ['Y', 'X', 'B', 'A'];

function ButtonDiamond({ bus, buttons }: { bus: InputBus; buttons: [VerbButton, VerbButton, VerbButton, VerbButton] }) {
  const bySlot: Record<'A' | 'B' | 'X' | 'Y', VerbButton> = { A: buttons[0], B: buttons[1], X: buttons[2], Y: buttons[3] };
  return (
    <div className="relative h-[148px] w-[148px]">
      {SLOT_ORDER.map((slot) => (
        <div key={slot} className={`absolute ${SLOT_POS[slot]}`}>
          <Verb bus={bus} def={bySlot[slot]} slot={slot} />
        </div>
      ))}
    </div>
  );
}

function Verb({ bus, def, slot }: { bus: InputBus; def: VerbButton; slot: 'A' | 'B' | 'X' | 'Y' }) {
  const holdRaf = useRef(0);
  const downAt = useRef(0);
  const inert = def.emit === null;

  const press = (e: React.PointerEvent) => {
    if (inert) return;
    safeCapture(e.target as Element, e.pointerId);
    navigator.vibrate?.(10);
    if (def.hold) {
      downAt.current = performance.now();
      const stream = () => {
        const v = Math.min(1, (performance.now() - downAt.current) / 1100);
        bus.emit({ t: 'trigger', side: 'R', value: Math.max(0.01, v) });
        holdRaf.current = requestAnimationFrame(stream);
      };
      stream();
    } else {
      bus.emit(def.emit!);
    }
  };

  const release = () => {
    if (inert) return;
    if (def.hold) {
      cancelAnimationFrame(holdRaf.current);
      bus.emit({ t: 'trigger', side: 'R', value: 0 });   // release = launch
    } else if (def.emit!.t === 'button') {
      bus.emit({ ...def.emit!, pressed: false });
    }
  };

  const color = inert ? '#4b5563' : def.color;
  return (
    <button
      onPointerDown={press} onPointerUp={release} onPointerCancel={release}
      className={`h-[64px] w-[64px] touch-none select-none rounded-full border-2 text-[10px] font-black tracking-wide text-white transition-transform duration-75 ${inert ? 'opacity-45' : 'active:scale-90'}`}
      style={{ borderColor: color, background: `${color}22`, boxShadow: inert ? 'none' : `0 0 18px ${color}44` }}>
      {def.label || slot}
    </button>
  );
}

// MOUNT (harness route component):
//   <TouchOverlay bus={inputBus} modeId={modeId} visible={phase === 'playing'} />
// DELETE every other on-screen control (grep: PUNCH/HEAVY circle set, PWR/FLSH/
// SIG/CHARGE/SLAM in-canvas set, the old gamepad FAB deck). One overlay. Ever.
