// PAD MERGE — two controllers, one hero, no tug of war (CONTROLLER-UNIVERSAL-MULTI, 2026-09-14).
//
// InputBus holds up to four local pads now, and every mode in the tree still reads ONE unslotted FelInput stream.
// On a single-player mode (the dunk contest, a pass-the-pad carnival night) every pad in the room should drive that
// one hero — whoever picks a controller up can play — but the naive way to do that is a fight: a centred pad emits
// (0, 0) and a released trigger emits 0, so the pad nobody is holding cancels the one somebody is.
//
// The rules that make it not a fight:
//   • STICKS — the pad pushed furthest wins, per stick. A resting pad (0 after its deadzone) can never beat a push.
//   • TRIGGERS — the deepest pull wins.
//   • BUTTONS and D-PAD — held on ANY pad is held. A release on one pad is not a release while the other still holds.
// With one pad connected, every rule returns that pad's own values, so the single-pad path is unchanged.
//
// Pure: canonical pads in, one canonical pad out. Multi-local modes do not read this — they subscribe to the
// slot-tagged stream (InputBus.onSlot), where each pad is its own player.

import type { CanonicalPad, PadButton, PadDir } from './profiles';

const BUTTONS: readonly PadButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS'];
const DIRS: readonly PadDir[] = ['up', 'down', 'left', 'right'];

export const IDLE_PAD: CanonicalPad = {
  lx: 0, ly: 0, rx: 0, ry: 0,
  triggers: { L: 0, R: 0 },
  buttons: { A: false, B: false, X: false, Y: false, L1: false, R1: false, SELECT: false, START: false, LS: false, RS: false },
  dpad: { up: false, down: false, left: false, right: false },
};

/** Merge the pads in slot order. Ties (equal push) go to the lower slot, so P1 leads when both push the same. */
export function mergePads(pads: readonly CanonicalPad[]): CanonicalPad {
  if (pads.length === 0) return IDLE_PAD;
  if (pads.length === 1) return pads[0];
  let L = pads[0], R = pads[0];
  for (const p of pads) {
    if (Math.hypot(p.lx, p.ly) > Math.hypot(L.lx, L.ly)) L = p;
    if (Math.hypot(p.rx, p.ry) > Math.hypot(R.rx, R.ry)) R = p;
  }
  const buttons = { ...IDLE_PAD.buttons };
  for (const b of BUTTONS) buttons[b] = pads.some((p) => p.buttons[b]);
  const dpad = { ...IDLE_PAD.dpad };
  for (const d of DIRS) dpad[d] = pads.some((p) => p.dpad[d]);
  return {
    lx: L.lx, ly: L.ly, rx: R.rx, ry: R.ry,
    triggers: { L: Math.max(...pads.map((p) => p.triggers.L)), R: Math.max(...pads.map((p) => p.triggers.R)) },
    buttons, dpad,
  };
}
