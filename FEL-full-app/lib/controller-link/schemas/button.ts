// Button schema — on-screen action buttons.
//
// There is deliberately no game logic here. A mode supplies {action,label} and
// the controller page renders them; the action string is the mode's OWN
// vocabulary and is passed through untouched to sendInput(). That is what lets
// a new mode add buttons without anyone editing this file.

import type { ButtonSpec } from '../types';

/** Fixed slot colours so a button means the same thing across every mode. */
export const BUTTON_COLORS = ['#22d3ee', '#ff6b3d', '#a78bfa', '#ffd75e'] as const;

export function colorFor(spec: ButtonSpec, index: number): string {
  return spec.color ?? BUTTON_COLORS[index % BUTTON_COLORS.length];
}

/** Press/release action names for a hold button. */
export function holdActions(spec: ButtonSpec): { down: string; up: string } {
  return { down: `${spec.action}:down`, up: `${spec.action}:up` };
}
