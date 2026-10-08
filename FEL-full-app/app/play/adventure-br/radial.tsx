'use client';

// ADVENTURE C (2026-10-07): the BR's copy of A4's touch radial (app/dev's stays the yard's; the layout and the gesture are
// one source: adventure/host/touchRadial). The Adventure's touch radial (adventure/host/touchRadial: the layout and the gesture are pure and tested there). One
// hub above the face diamond; press, slide onto a slice, lift. Hold slices (guard, slow) hold while the thumb rests.

import { useRef, useState } from 'react';
import type { InputBus } from '@/lib/babylon/core/InputBus';
import { RADIAL_SLICES, RadialGesture, slicePos } from '@/lib/babylon/adventure/host/touchRadial';

const RING_PX = 74;

export function AdventureRadial({ bus }: { bus: InputBus }) {
  const gesture = useRef(new RadialGesture());
  const hub = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = hub.current!.getBoundingClientRect();
    return [(e.clientX - (r.left + r.width / 2)) / RING_PX, (e.clientY - (r.top + r.height / 2)) / RING_PX];
  };
  const send = (events: ReturnType<RadialGesture['move']>) => { for (const ev of events) bus.emit(ev); };

  return (
    <div className="pointer-events-auto absolute z-30" style={{ right: 'max(1.5rem, env(safe-area-inset-right))', bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 15rem)' }}>
      <div ref={hub} className="relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-[9px] font-black tracking-widest text-white/70"
        onPointerDown={(e) => { pointer.current = e.pointerId; try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* fine */ } setOpen(true); }}
        onPointerMove={(e) => { if (pointer.current !== e.pointerId) return; const [x, y] = at(e); send(gesture.current.move(x, y)); setOver(gesture.current.current?.id ?? null); }}
        onPointerUp={() => { pointer.current = null; send(gesture.current.end()); setOpen(false); setOver(null); }}
        onPointerCancel={() => { pointer.current = null; send(gesture.current.end()); setOpen(false); setOver(null); }}>
        ◎
        {open && RADIAL_SLICES.map((s, i) => {
          const p = slicePos(i);
          return (
            <span key={s.id} className={`pointer-events-none absolute whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-black ${over === s.id ? 'bg-white text-black' : 'bg-black/70 text-white/80'}`}
              style={{ left: `calc(50% + ${p.x * RING_PX}px)`, top: `calc(50% + ${p.y * RING_PX}px)`, transform: 'translate(-50%, -50%)' }}>
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
