// padStore — what the Cypher's phone pad is for right now, handed from the room to the pad (lane/dance-extras, 2026-10-14).
//
// The room (DanceMode.ts) knows whether it is on the pick screen, in a song with MATCH on or off, or inside a freestyle section;
// the pad (DancePad.tsx, drawn by TouchOverlay) is a React component two layers away from the room's HUD. A module-level store is
// the thinnest seam between them: the host (components/games/timing-babylon.tsx, which several lanes hold) is not touched, and
// nothing flows BACK — the pad only reads, and sends its presses over the InputBus like a gamepad does. One room per page, the
// same scope the bus itself has.
import { DEFAULT_PAD_STATE, type DancePadState } from './padModel';

let state: DancePadState = DEFAULT_PAD_STATE;
const subs = new Set<() => void>();

const same = (a: DancePadState, b: DancePadState): boolean =>
  a.mode === b.mode && a.matchOn === b.matchOn && JSON.stringify(a.free) === JSON.stringify(b.free);

export const padStore = {
  /** The current state (a stable object until it changes: useSyncExternalStore's contract). */
  get(): DancePadState { return state; },
  /** The server render and the first client render: the default (a song with MATCH off). */
  getServer(): DancePadState { return DEFAULT_PAD_STATE; },
  /** Merge a change in; subscribers hear only a real change. */
  set(next: Partial<DancePadState>): void {
    const merged: DancePadState = { ...state, ...next };
    if (same(state, merged)) return;
    state = merged;
    for (const fn of [...subs]) fn();
  },
  /** The room loaded or went away: back to the default. */
  reset(): void { padStore.set(DEFAULT_PAD_STATE); },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
