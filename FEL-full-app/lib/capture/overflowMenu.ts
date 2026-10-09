// overflowMenu — the three-dot capture menu, as states.
//
// Pure. The HUD (components/capture/capture-hud-view.tsx) applies this and never invents a transition
// of its own, the same rule the recorder machine keeps.
//
//   closed  --trigger-->        open, focus on the first item (a controller's confirm press lands in the menu)
//   open    --trigger-->        closed, focus back on the ⋯ button
//   open    --escape-->         closed, focus back on the ⋯ button
//   open    --outside-tap-->    closed, focus left alone (the pointer went somewhere; don't yank it back)
//   open    --item-activated--> closed, focus back on the ⋯ button
//
// Esc or an outside tap while closed is a no-op — the gameplay keys belong to the game.
//
// hudIndicator is the always-on dot: REC while a take is recording, LIVE while stream mode is on,
// both when both. It answers what the main HUD shows even with the menu closed or the controls hidden.

import type { RecPhase } from './recorderMachine';

export type OverflowEvent =
  | { type: 'trigger' }
  | { type: 'escape' }
  | { type: 'outside-tap' }
  | { type: 'item-activated' }
  | { type: 'close' };

export interface OverflowState {
  open: boolean;
  /** Where keyboard/controller focus goes after the last event; null = leave it where it is. */
  focus: 'trigger' | 'first-item' | null;
}

export const OVERFLOW_CLOSED: OverflowState = { open: false, focus: null };

export function overflowStep(s: OverflowState, e: OverflowEvent): OverflowState {
  switch (e.type) {
    case 'trigger':
      return s.open ? { open: false, focus: 'trigger' } : { open: true, focus: 'first-item' };
    case 'escape':
      return s.open ? { open: false, focus: 'trigger' } : s;
    case 'outside-tap':
      return s.open ? { open: false, focus: null } : s;
    case 'item-activated':
    case 'close':
      return s.open ? { open: false, focus: 'trigger' } : s;
  }
}

export interface HudIndicator {
  rec: boolean;
  live: boolean;
}

export function hudIndicator(phase: RecPhase, streamOn: boolean): HudIndicator {
  return { rec: phase === 'recording', live: streamOn };
}
