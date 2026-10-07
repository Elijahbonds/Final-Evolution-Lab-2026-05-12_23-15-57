// Live framing light for a dunk setup. Wraps the Mirror's checkFraming (side-on approach).
// Green: the first attempt may arm. Yellow: usable but dim or off-centre. Red: fix the shot first.

import { FramingGate, SIDE_TURNED, checkFraming, framingLine, type FramingCheck, type FramingFrame, type FramingIssue } from '@/lib/mirror/framing';

export type FramingLight = 'green' | 'yellow' | 'red';

export function shotLight(check: FramingCheck): FramingLight {
  if (check.ok) return 'green';
  if (check.worst === 'dim' || check.worst === 'offCentre') return 'yellow';
  return 'red';
}

export function firstAttemptAllowed(light: FramingLight): boolean {
  return light === 'green';
}

/** A phone propped far back still reads a dunk: a body this share of the frame is enough (the Mirror's global minimum is 0.45). */
export const DUNK_FILL_MIN = 0.30;

const ISSUE_ORDER: FramingIssue[] = ['noBody', 'cutOffBottom', 'cutOffTop', 'turned', 'tooClose', 'tooFar', 'offCentre', 'dim'];

/** Side-on, with "too far" judged against DUNK_FILL_MIN. The Mirror's own check and FILL_MIN are untouched. */
export function dunkFramingCheck(frame: FramingFrame): FramingCheck {
  const base = checkFraming(frame, 'side');
  if (!base.issues.includes('tooFar') || base.bodyFill < DUNK_FILL_MIN) return base;
  const issues = base.issues.filter((i) => i !== 'tooFar');
  const worst = ISSUE_ORDER.find((i) => issues.includes(i)) ?? null;
  const instruction = worst === null ? 'Good shot — start when you are ready.' : worst === 'turned' ? SIDE_TURNED : framingLine(worst);
  return { ...base, ok: issues.length === 0, issues, worst, instruction };
}

/** Side-on: the phone watches the approach, not a face-on squat. */
export function dunkFraming(frame: FramingFrame): FramingCheck {
  return dunkFramingCheck(frame);
}

/** Hands-free hold before a re-arm (ms). */
export const AUTO_ARM_HOLD_MS = 700;

/** Re-arms accept yellow (dim or off-centre) as well as green; red never arms. */
export function armAllowed(light: FramingLight, isRearm: boolean): boolean {
  return isRearm ? light !== 'red' : firstAttemptAllowed(light);
}

/** What the gate sees: on a re-arm a yellow check counts as passing. The first attempt is green only. */
export function gateCheck(check: FramingCheck, isRearm: boolean): FramingCheck {
  return armAllowed(shotLight(check), isRearm) ? { ...check, ok: true } : { ...check, ok: false };
}

export function newAutoArmGate(): FramingGate {
  return new FramingGate(AUTO_ARM_HOLD_MS);
}

/**
 * True once the shot has held for the gate's hold. Only a re-arm ever auto-arms: the first attempt
 * (isRearm false) never returns true here, it waits for the explicit tap.
 */
export function autoArmReady(gate: FramingGate, check: FramingCheck, nowMs: number, isRearm: boolean): boolean {
  const ready = gate.ready(gateCheck(check, isRearm), nowMs);
  return isRearm && ready;
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
