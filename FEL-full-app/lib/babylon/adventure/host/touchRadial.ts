/**
 * The touch radial (ADVENTURE PLAN "Default controls": "Touch: a stick, jump, dash, attack, and a radial for lock,
 * magic, partner and fuse. Touch is the phone default, so the radial is designed first, not last").
 *
 * The phone's controls are the app's one touch rig (TouchOverlay: the stick, the d-pad, A / B / X / Y as JUMP / DASH /
 * LIGHT / HEAVY from modeVerbs) PLUS this radial: one thumb-sized hub beside the face buttons; a press opens a ring
 * of the verbs a pad keeps on its shoulders and triggers; sliding onto a slice and lifting fires it (a hold slice — guard,
 * slow-time — holds for as long as the thumb rests on it). Every slice emits the SAME FelInput the pad's button does,
 * into the same InputBus, so the mapper and any rebinding treat touch exactly like a pad.
 *
 * Pure: the layout and the slice-under-the-thumb maths. The React overlay (app/dev/adventure) draws it.
 */

import type { FelInput } from '@/lib/babylon/core/InputBus';

export interface RadialSlice {
  id: 'lock' | 'cast' | 'partner' | 'fuse' | 'guard' | 'slow';
  /** What it says on the slice (generic verbs). */
  label: string;
  /** Held while the thumb rests on it (true), or a tap fired on release (false). */
  hold: boolean;
  /** What it sends on press and on release. */
  down: FelInput;
  up: FelInput;
}

/** Clockwise from the top: the most used (lock) under the thumb's natural upward flick. */
export const RADIAL_SLICES: readonly RadialSlice[] = Object.freeze([
  { id: 'lock', label: 'LOCK', hold: false, down: { t: 'button', btn: 'R1', pressed: true }, up: { t: 'button', btn: 'R1', pressed: false } },
  { id: 'cast', label: 'CAST', hold: false, down: { t: 'trigger', side: 'R', value: 1 }, up: { t: 'trigger', side: 'R', value: 0 } },
  { id: 'fuse', label: 'FUSE · RIDE', hold: false, down: { t: 'dpad', dir: 'down', pressed: true }, up: { t: 'dpad', dir: 'down', pressed: false } },
  { id: 'slow', label: 'SLOW', hold: true, down: { t: 'trigger', side: 'L', value: 1 }, up: { t: 'trigger', side: 'L', value: 0 } },
  { id: 'guard', label: 'GUARD', hold: true, down: { t: 'button', btn: 'L1', pressed: true }, up: { t: 'button', btn: 'L1', pressed: false } },
  { id: 'partner', label: 'PARTNER', hold: false, down: { t: 'dpad', dir: 'up', pressed: true }, up: { t: 'dpad', dir: 'up', pressed: false } },
] as RadialSlice[]);

/** The thumb must travel this share of the ring's radius before a slice counts (a still thumb is the hub). [TUNE] */
export const RADIAL_DEADZONE = 0.35;

/**
 * The slice under a thumb at (dx, dy) from the hub's centre, in units of the ring's radius (y down, the screen's way).
 * Null inside the dead zone. Slices are equal wedges, the first centred straight up.
 */
export function sliceAt(dx: number, dy: number, slices: readonly RadialSlice[] = RADIAL_SLICES): RadialSlice | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < RADIAL_DEADZONE) return null;
  const n = slices.length;
  // the angle clockwise from straight up, 0..2π
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += Math.PI * 2;
  const i = Math.floor((a + Math.PI / n) / ((Math.PI * 2) / n)) % n;
  return slices[i];
}

/** Where slice `i` sits on the ring (unit circle, y down), for drawing its label. */
export function slicePos(i: number, n = RADIAL_SLICES.length): { x: number; y: number } {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * A radial gesture: press on the hub, slide, lift. `move` returns the FelInputs to send now (a hold slice presses as
 * the thumb arrives on it and lets go as it leaves); `end` returns the release (and fires a tap slice: down then up).
 */
export class RadialGesture {
  private over: RadialSlice | null = null;

  move(dx: number, dy: number): FelInput[] {
    const s = sliceAt(dx, dy);
    if (s === this.over) return [];
    const out: FelInput[] = [];
    if (this.over?.hold) out.push(this.over.up);
    if (s?.hold) out.push(s.down);
    this.over = s;
    return out;
  }

  end(): FelInput[] {
    const s = this.over;
    this.over = null;
    if (!s) return [];
    return s.hold ? [s.up] : [s.down, s.up];
  }

  get current(): RadialSlice | null { return this.over; }
}
