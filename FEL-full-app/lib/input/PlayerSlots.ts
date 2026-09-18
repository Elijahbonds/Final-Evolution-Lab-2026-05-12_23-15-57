// PLAYER SLOTS — four controllers, four players, one couch (2026-09-13).
//
// Mission Phase A.6, and the owner's own ask: "allow for multiple controllers too — for multiplayer."
//
// What was there: InputBus adopts exactly ONE pad (`padIndex`), the first live slot it finds, and every
// other controller in the room is invisible. Local multiplayer with two physical pads was not partially
// supported, it was structurally impossible — there is nowhere in the old code to put a second player.
//
// THE JOIN RULE. A gamepad is invisible to the browser until a button is pressed on it, which is a privacy
// feature and also exactly the join gesture we want: you take a controller, you press a button, you are
// player 2. No menu, no pairing screen, no "how many players?" — the room fills up as people pick pads up.
//
// THE DISCONNECT RULE. A pad that leaves mid-run PAUSES rather than dropping the run. Someone tripped over a
// cable or a battery died; ending their game for them is the wrong answer, and so is carrying on without
// them while their character stands still. The slot is held open, the mode is told to pause, and the same
// controller (or any controller) reclaims it. This is the mission's "Do not drop the run", and it is the
// behaviour the old single-pad path could not express either: it cleared its latches and kept playing.
//
// Pure: no browser API, no timers. A caller polls with the pads it has and this returns the new state.

import { profileFor, anyPressed, readPad, type ControllerProfile, type PadLike, type CanonicalPad } from './profiles';

export const MAX_SLOTS = 4;
export type SlotIndex = 0 | 1 | 2 | 3;

export interface Slot {
  /** Which gamepad index owns this slot, or null when the slot is empty. */
  padIndex: number | null;
  /** The pad's own id, kept so a reconnecting controller can be recognised as the same one. */
  padId: string | null;
  profile: ControllerProfile | null;
  /** The pad vanished mid-run and we are holding the slot for it. */
  awaitingReconnect: boolean;
}

export const EMPTY_SLOT: Slot = { padIndex: null, padId: null, profile: null, awaitingReconnect: false };

export interface SlotsState {
  slots: Slot[];
  /** True while any joined slot is waiting for its controller to come back. */
  paused: boolean;
}

export function freshSlots(): SlotsState {
  return { slots: Array.from({ length: MAX_SLOTS }, () => ({ ...EMPTY_SLOT })), paused: false };
}

export interface SlotEvent {
  kind: 'join' | 'leave' | 'reconnect';
  slot: SlotIndex;
  padId: string | null;
  profile: ControllerProfile | null;
}

/**
 * One poll.
 *
 * `pads` is `navigator.getGamepads()` — a sparse array whose indices are the browser's slot numbers, not
 * ours. `allowJoins` is false once a mode is past its join screen if the mode wants a fixed roster; most
 * modes should leave it true, because a controller picked up mid-game is a person who wants to play.
 *
 * Returns the new state plus the events that happened, so a caller can pause a mode, show a prompt, or emit
 * a "player 2 joined" banner without diffing anything itself.
 */
export function pollSlots(
  state: SlotsState,
  pads: readonly (PadLike & { index?: number; connected?: boolean } | null)[],
  allowJoins = true,
): { state: SlotsState; events: SlotEvent[] } {
  const events: SlotEvent[] = [];
  const slots = state.slots.map((s) => ({ ...s }));
  const live = new Map<number, PadLike & { index?: number; connected?: boolean }>();
  pads.forEach((p, i) => { if (p && p.connected !== false) live.set(p.index ?? i, p); });

  // 1. a joined pad that is no longer live: HOLD the slot and pause. The run is not dropped.
  slots.forEach((s, i) => {
    if (s.padIndex === null || s.awaitingReconnect) return;
    if (!live.has(s.padIndex)) {
      s.awaitingReconnect = true;
      events.push({ kind: 'leave', slot: i as SlotIndex, padId: s.padId, profile: s.profile });
    }
  });

  // 2. a held slot whose controller is back — by id where we can match it, otherwise any unclaimed pad.
  //    Matching by id first matters on a couch: two people reconnecting should not swap players.
  const claimed = new Set(slots.map((s) => s.padIndex).filter((x): x is number => x !== null && !slots[slots.findIndex((s) => s.padIndex === x)]?.awaitingReconnect));
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.awaitingReconnect) continue;
    let found: number | null = null;
    for (const [idx, p] of live) {
      if (claimed.has(idx)) continue;
      if (s.padId && (p.id ?? '') === s.padId) { found = idx; break; }
    }
    if (found === null) {
      for (const [idx, p] of live) {
        if (claimed.has(idx)) continue;
        if (!anyPressed(p)) continue;                 // a silent pad is not a person reclaiming a seat
        found = idx; break;
      }
    }
    if (found !== null) {
      const p = live.get(found)!;
      s.padIndex = found; s.padId = p.id ?? null; s.profile = profileFor(p); s.awaitingReconnect = false;
      claimed.add(found);
      events.push({ kind: 'reconnect', slot: i as SlotIndex, padId: s.padId, profile: s.profile });
    }
  }

  // 3. an unclaimed pad with a button down is somebody joining.
  if (allowJoins) {
    const taken = new Set(slots.map((s) => s.padIndex).filter((x): x is number => x !== null));
    for (const [idx, p] of live) {
      if (taken.has(idx)) continue;
      if (!anyPressed(p)) continue;                   // THE JOIN GESTURE: press any button
      const free = slots.findIndex((s) => s.padIndex === null && !s.awaitingReconnect);
      if (free < 0) break;                            // the couch is full
      slots[free] = { padIndex: idx, padId: p.id ?? null, profile: profileFor(p), awaitingReconnect: false };
      taken.add(idx);
      events.push({ kind: 'join', slot: free as SlotIndex, padId: slots[free].padId, profile: slots[free].profile });
    }
  }

  const paused = slots.some((s) => s.awaitingReconnect);
  return { state: { slots, paused }, events };
}

/** How many people are actually playing. */
export function playerCount(state: SlotsState): number {
  return state.slots.filter((s) => s.padIndex !== null || s.awaitingReconnect).length;
}

/** Read one slot's controller in canonical terms, or null when that seat is empty or waiting. */
export function readSlot(
  state: SlotsState, slot: SlotIndex,
  pads: readonly (PadLike & { index?: number } | null)[],
): CanonicalPad | null {
  const s = state.slots[slot];
  if (!s || s.padIndex === null || s.awaitingReconnect || !s.profile) return null;
  const pad = pads.find((p, i) => p && (p.index ?? i) === s.padIndex);
  return pad ? readPad(pad, s.profile) : null;
}

/** What to tell the room when a controller goes. Names the slot, because four people need to know whose. */
export function reconnectPrompt(slot: SlotIndex): string {
  return `PLAYER ${slot + 1} — CONTROLLER DISCONNECTED. Press any button to rejoin.`;
}

export function joinPrompt(filled: number): string {
  return filled === 0 ? 'PRESS ANY BUTTON TO PLAY' : `PLAYER ${filled + 1} — PRESS ANY BUTTON TO JOIN`;
}
