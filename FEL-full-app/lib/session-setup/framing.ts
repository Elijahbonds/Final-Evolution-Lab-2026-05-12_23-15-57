// Live framing light for a dunk setup. Wraps the Mirror's checkFraming (side-on approach).
// Green: the first attempt may arm. Yellow: usable but dim or off-centre. Red: fix the shot first.

import { checkFraming, type FramingCheck, type FramingFrame } from '@/lib/mirror/framing';

export type FramingLight = 'green' | 'yellow' | 'red';

export function shotLight(check: FramingCheck): FramingLight {
  if (check.ok) return 'green';
  if (check.worst === 'dim' || check.worst === 'offCentre') return 'yellow';
  return 'red';
}

export function firstAttemptAllowed(light: FramingLight): boolean {
  return light === 'green';
}

/** Side-on: the phone watches the approach, not a face-on squat. */
export function dunkFraming(frame: FramingFrame): FramingCheck {
  return checkFraming(frame, 'side');
}

/**
 * Placement card copy. assumption: the court has no measured marks in this repo, so these are a
 * readable starting guide (side-on, landscape, about waist-to-chest height, far enough back that
 * the approach and the rim both fit). Elijah's eye replaces them if a session shows otherwise.
 */
export const PLACEMENT_LINES = [
  'Landscape. Prop the phone on its side.',
  'Side-on to the approach, about waist to chest height.',
  'Far enough back that the whole run and the rim fit, with both feet in the shot.',
] as const;
