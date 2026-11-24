'use client';

// The upright hoops HUD's zones in React (look-screens phase A2; the rules and the measurements are in lib/ui/hudZones.ts):
// whether the zones are up, and the two slots pieces move into — the "⋯" menu's (rendered by the shell's menu on an upright
// phone) and the touch deck's (rendered by TouchOverlay where a ghost d-pad was). Each slot registers itself in a tiny store,
// so a piece finds it wherever both are mounted, with no prop threaded through the shell or the host.
import { useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getFeelState, getServerFeelState, subscribeFeel } from '@/lib/feel-panel/feel';
import { DECK_SLOT_ATTR, hudZonesUpright, MENU_SLOT_ATTR, ZONES_QUERY } from '@/lib/ui/hudZones';

const noSub = () => () => {};
function subscribeUpright(fn: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(ZONES_QUERY);
  mq.addEventListener?.('change', fn);
  return () => mq.removeEventListener?.('change', fn);
}
const uprightNow = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(ZONES_QUERY).matches);

/** The zones are up: the knob is on and the phone is held upright (false on the server and in the first client render). */
export function useUprightZones(): boolean {
  useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);   // re-read the knob when the feel panel opens
  const on = hudZonesUpright();
  return useSyncExternalStore(on ? subscribeUpright : noSub, uprightNow, () => false) && on;
}

// ── the slots ───────────────────────────────────────────────────────────────────────────────────────────────────────────
type SlotName = 'menu' | 'deck';
const slots: Record<SlotName, HTMLElement | null> = { menu: null, deck: null };
const listeners = new Set<() => void>();
function setSlot(name: SlotName, el: HTMLElement | null): void {
  if (slots[name] === el) return;
  slots[name] = el;
  for (const l of listeners) l();
}
const subscribeSlots = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The slot element, or null while it is not mounted. */
export function useSlot(name: SlotName): HTMLElement | null {
  return useSyncExternalStore(subscribeSlots, () => slots[name], () => null);
}

/** A slot's element: spread its ref and attribute on the box pieces portal into. */
export function useSlotRef(name: SlotName): { ref: (el: HTMLElement | null) => void; attr: Record<string, string> } {
  const mine = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    // a slot unmounting clears only itself (a newer one may already have registered)
    if (el) { mine.current = el; setSlot(name, el); }
    else { if (slots[name] === mine.current) setSlot(name, null); mine.current = null; }
  }, [name]);
  return { ref, attr: { [name === 'menu' ? MENU_SLOT_ATTR : DECK_SLOT_ATTR]: '' } };
}

/** Draw `children` in the slot when the zones are up and the slot is mounted; otherwise `fallback` (today's place). */
export function InSlot({ name, children, fallback }: { name: SlotName; children: ReactNode; fallback: ReactNode }) {
  const zones = useUprightZones();
  const el = useSlot(name);
  return zones && el ? createPortal(children, el) : <>{fallback}</>;
}

/** Tests only. */
export function resetSlotsForTests(): void { slots.menu = null; slots.deck = null; }
