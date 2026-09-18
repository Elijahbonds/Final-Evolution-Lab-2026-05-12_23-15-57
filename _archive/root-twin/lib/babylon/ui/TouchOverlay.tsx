'use client';

// TouchOverlay — THE single touch control component. Mounted ONCE by the
// harness route; every legacy in-canvas button set must be deleted.
// Portrait: DS-style bottom deck. Landscape: translucent side overlay.
// Emits FelInput through the SAME bus keyboard/gamepad use; buttons emit
// press AND release; hold buttons stream analog trigger 0→1; the stick
// streams a normalized vector and recenters on lift.

import React, { useEffect, useRef, useState } from 'react';
import type { InputBus } from '../core/InputBus';
import { MODE_VERBS, type VerbButton } from './modeVerbs';

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
      : 'pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[38vh] bg-gradient-to-t from-black/85 to-transparent'}>
      <div className="pointer-events-auto absolute bottom-4 left-4">
        {cfg.stick && <Stick bus={props.bus} />}
      </div>
      <div className="pointer-events-auto absolute bottom-6 right-4 grid grid-cols-2 gap-3">
        {cfg.buttons.map((b) => <Verb key={b.label} bus={props.bus} def={b} />)}
      </div>
    </div>
  );
}

function Stick({ bus }: { bus: InputBus }) {
  const zone = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const setVec = (x: number, y: number) => {
    bus.emit({ t: 'stick', side: 'L', x, y });
    if (knob.current) knob.current.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
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
      onPointerDown={(e) => { active.current = e.pointerId; (e.target as Element).setPointerCapture(e.pointerId); onMove(e); }}
      onPointerMove={onMove}
      onPointerUp={() => { active.current = null; setVec(0, 0); }}
      onPointerCancel={() => { active.current = null; setVec(0, 0); }}
      className="relative h-32 w-32 touch-none rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
      <div ref={knob}
        className="absolute left-1/2 top-1/2 -ml-7 -mt-7 h-14 w-14 rounded-full bg-white/20 shadow-lg transition-transform duration-75" />
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tracking-widest text-white/30">
        MOVE
      </span>
    </div>
  );
}

function Verb({ bus, def }: { bus: InputBus; def: VerbButton }) {
  const holdRaf = useRef(0);
  const downAt = useRef(0);

  const press = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
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
      bus.emit(def.emit);
    }
  };

  const release = () => {
    if (def.hold) {
      cancelAnimationFrame(holdRaf.current);
      bus.emit({ t: 'trigger', side: 'R', value: 0 });   // release = launch
    } else if (def.emit.t === 'button') {
      bus.emit({ ...def.emit, pressed: false });
    }
  };

  return (
    <button
      onPointerDown={press} onPointerUp={release} onPointerCancel={release}
      className="h-[72px] w-[72px] touch-none select-none rounded-full border-2 text-[11px] font-black tracking-wide text-white active:scale-90"
      style={{ borderColor: def.color, background: `${def.color}22`, boxShadow: `0 0 18px ${def.color}44`, transition: 'transform 80ms' }}>
      {def.label}
    </button>
  );
}

// MOUNT (harness route component):
//   <TouchOverlay bus={inputBus} modeId={modeId} visible={phase === 'playing'} />
// DELETE every other on-screen control (grep: PUNCH/HEAVY circle set, PWR/FLSH/
// SIG/CHARGE/SLAM in-canvas set, the old gamepad FAB deck). One overlay. Ever.
