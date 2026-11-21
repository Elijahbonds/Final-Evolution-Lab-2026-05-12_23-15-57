'use client';

// /play/venice, improvement pass phase 9 (finding your way), behind venue.veniceWayfinding (0 = V1: none of this):
//   * the first-visit hint: one line saying what to do, once per device (it goes when you tap it away or reach a court's card);
//   * the mini-map: the four courts (numbered, as the name boards), their gold rings and you, north up, in the top-right corner;
//   * the card's keys: Enter or X (keyboard L, a pad's X) plays, Y (keyboard I, a pad's Y) plays with your party. In Venice X and Y
//     do nothing else (no fights here: VeniceHubMode.walkOnly).

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { hubPos } from '@/lib/adventure/venice/hubUi';
import { v1Area, v1Spots } from '@/lib/adventure/venice/hubWorld';
import { FENCE, RING } from '@/lib/adventure/venice/courtsDressing';
import { COURT_HALF } from '@/lib/adventure/venice/courtsView';
import type { InputBus } from '@/lib/babylon';
import { BOAT_STOP, PIER_SPOT_ID } from '@/lib/adventure/venice/coastDoor';

export { VENICE_WAYFINDING } from '@/lib/adventure/venice/hubUi';
export const HINT_KEY = 'fel-venice-hint-seen';
const MAP_PX = 112;

export function useFirstVisitHint(enabled: boolean, cardUp: boolean): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try { setShow(localStorage.getItem(HINT_KEY) !== '1'); } catch { setShow(true); }
  }, [enabled]);
  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode: once per visit */ }
  }, []);
  useEffect(() => { if (cardUp && show) dismiss(); }, [cardUp, show, dismiss]);
  return [enabled && show, dismiss];
}

export function FirstVisitHint({ onDismiss, touch }: { onDismiss: () => void; touch: boolean }) {
  return (
    <div data-testid="venice-hint" role="status" className="absolute inset-x-4 bottom-[9.5rem] z-10 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
      <p className="flex-1 text-base">{touch ? 'Drag anywhere to walk.' : 'Walk with WASD, the arrows or a stick.'} Step into a court&apos;s gold ring to play.</p>
      <button type="button" onClick={onDismiss} className="min-h-[44px] min-w-[44px] rounded-xl border border-white/25 px-3 text-base font-bold">Got it</button>
    </div>
  );
}

/** Pure: a world point on the map (px), north (−z) up, the sea (−x) on the left. */
export function toMap(x: number, z: number): [number, number] {
  const a = v1Area(), w = a.maxX - a.minX, h = a.maxZ - a.minZ, s = MAP_PX / Math.max(w, h);
  return [(x - a.minX) * s, (z - a.minZ) * s];
}

export function miniMapStatus(active: string | null): string {
  const spots = v1Spots();
  const idx = active ? spots.findIndex((sp) => sp.id === active) : -1;
  if (idx >= 0) return `Venice mini-map: you are at Court ${idx + 1}'s play ring.`;
  if (active === PIER_SPOT_ID) return 'Venice mini-map: you are at the boat to the coast.';
  return 'Venice mini-map: four courts are ahead; step into a gold play ring to choose one.';
}

export function MiniMap({ active, boat = false }: { active: string | null; boat?: boolean }) {
  const me = useSyncExternalStore(hubPos.subscribe, hubPos.getSnapshot, () => null);
  const spots = v1Spots();
  const a = v1Area(), s = MAP_PX / Math.max(a.maxX - a.minX, a.maxZ - a.minZ);
  return (
    <div data-testid="venice-minimap" className="pointer-events-none absolute right-3 top-3 z-10 rounded-xl border border-white/15 bg-black/55 p-1.5 backdrop-blur">
      <p data-testid="venice-minimap-status" className="sr-only" aria-live="polite">{miniMapStatus(active)}</p>
      <svg aria-hidden="true" width={MAP_PX} height={MAP_PX} viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}>
        <rect x={0} y={0} width={MAP_PX} height={MAP_PX} rx={6} fill="#E8D3A8" opacity={0.18} />
        {spots.map((sp, i) => {
          const [x, y] = toMap(sp.at[0] - FENCE.halfW, sp.at[1] - FENCE.halfL);
          const [rx, ry] = toMap(sp.at[0] + COURT_HALF.w + RING.out, sp.at[1]);
          const [cx, cy] = toMap(sp.at[0], sp.at[1]);
          const on = sp.id === active;
          return (
            <g key={sp.id}>
              <rect x={x} y={y} width={2 * FENCE.halfW * s} height={2 * FENCE.halfL * s} rx={2} fill={on ? '#facc15' : '#3B6E8F'} opacity={on ? 0.9 : 0.75} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={on ? '#000' : '#fff'}>{i + 1}</text>
              <circle cx={rx} cy={ry} r={Math.max(2.5, RING.r * s)} fill="none" stroke="#FFD166" strokeWidth={1.5} />
            </g>
          );
        })}
        {boat && (() => {   // the boat to the coast (venue.coastDoor): its ring on the sand's west edge
          const [bx, by] = toMap(BOAT_STOP.x, BOAT_STOP.z);
          return <circle data-testid="venice-minimap-boat" cx={bx} cy={by} r={Math.max(3, RING.r * s)} fill={active === PIER_SPOT_ID ? '#facc15' : '#1F6FB2'} stroke="#FFD166" strokeWidth={1.5} />;
        })()}
        {me && (() => {
          const [px, py] = toMap(me.x, me.z);
          const deg = (Math.atan2(Math.sin(me.yaw), -Math.cos(me.yaw)) * 180) / Math.PI;
          return <path d="M0,-6 L4.5,5 L0,2.5 L-4.5,5 Z" transform={`translate(${px} ${py}) rotate(${deg})`} fill="#fff" stroke="#000" strokeWidth={1} />;
        })()}
        <text x={MAP_PX - 4} y={11} textAnchor="end" fontSize={9} fontWeight={700} fill="#fff" opacity={0.8}>N</text>
      </svg>
    </div>
  );
}

/** The card's keys: Enter / X plays, Y plays with the party. Only while the card is up. */
export function useCardKeys(bus: InputBus | null, up: boolean, play: () => void, party: (() => void) | null): void {
  useEffect(() => {
    if (!up) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat) return;
      if (e.key === 'Enter' && !(t && (t.tagName === 'BUTTON' || t.tagName === 'A'))) { e.preventDefault(); play(); }
    };
    window.addEventListener('keydown', onKey);
    const off = bus?.on((e) => {
      if (e.t !== 'button' || !e.pressed) return;
      if (e.btn === 'X') play();
      else if (e.btn === 'Y' && party) party();
    });
    return () => { window.removeEventListener('keydown', onKey); off?.(); };
  }, [bus, up, play, party]);
}
