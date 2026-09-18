// D-pad schema — 4-way (optionally 8-way) directional input.
//
// Emits the mode's action with a {dir} payload plus a pressed flag, so a mode
// can treat it as either discrete taps or a held direction without the
// controller page needing to know which.

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface DpadPayload { dir: Dir; pressed: boolean }

/** Screen-space layout used by the controller page, in a 3x3 grid. */
export const DPAD_LAYOUT: { dir: Dir; row: number; col: number }[] = [
  { dir: 'up', row: 1, col: 2 },
  { dir: 'left', row: 2, col: 1 },
  { dir: 'right', row: 2, col: 3 },
  { dir: 'down', row: 3, col: 2 },
];

export function dpadPayload(dir: Dir, pressed: boolean): DpadPayload {
  return { dir, pressed };
}
