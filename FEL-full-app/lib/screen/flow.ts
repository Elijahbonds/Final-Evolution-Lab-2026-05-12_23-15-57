// flow — the Quick Screen's steps before the camera, as a pure reducer (SCREEN-SHIP, 2026-09-29; SCREEN-FIX).
//
//   start → age → (under 18 or no age: "A grown-up is with me") → "Does anything hurt right now?" → the camera card
//         → camera
//
// The age is asked ONCE per tab: a `start` carrying the tab's locked answer (lib/screen/store.ts lockAge) skips the
// question. "Yes" to pain ends it: no camera, no checks, nothing kept. The camera is asked for ONLY from the camera
// card's button (`cameraOn`), after the card has said what the camera is for, so nothing before it can open one. The
// gate record is built here and held by the page, in memory; it reaches sessionStorage only with the result.
//
// `back` is the back arrow: one step back WITHIN the flow, never out of it (the page takes the start card's arrow to
// /screen). The age question is locked once answered, so a step before which it would sit goes to the start card.
//
// Pure.
import { gateRecord, type GateRecord } from './store';
import { needsGrownUp, type AgeBand } from './age';

export type PreStep = 'intro' | 'age' | 'grownUp' | 'pain' | 'painStop' | 'cameraInfo' | 'camera';

export interface PreState {
  step: PreStep;
  age: AgeBand | null;
  gate: GateRecord | null;
}

export type PreEvent =
  | { type: 'start'; locked?: AgeBand | null }
  | { type: 'age'; age: AgeBand }
  | { type: 'grownUp' }
  | { type: 'back' }
  | { type: 'pain'; hurts: boolean }
  | { type: 'cameraOn' }
  | { type: 'restart' };

export const PRE_START: PreState = { step: 'intro', age: null, gate: null };

/** Where an answered age goes next: the grown-up step, or (18 or older) straight to the pain question. */
function afterAge(age: AgeBand, now: Date): PreState {
  return needsGrownUp(age) ? { step: 'grownUp', age, gate: null } : { step: 'pain', age, gate: gateRecord(age, false, now) };
}

/** The back arrow, one step back within the flow. */
export function backStep(s: PreState): PreState {
  switch (s.step) {
    case 'intro': return s;                                        // the page leaves to /screen
    case 'age': case 'grownUp': case 'painStop': return PRE_START;
    case 'pain': return s.age && needsGrownUp(s.age) ? { step: 'grownUp', age: s.age, gate: null } : PRE_START;
    case 'cameraInfo': return { ...s, step: 'pain' };
    case 'camera': return { ...s, step: 'cameraInfo' };
  }
}

export function preStep(s: PreState, e: PreEvent, now: Date = new Date()): PreState {
  switch (e.type) {
    case 'start': return e.locked ? afterAge(e.locked, now) : { step: 'age', age: null, gate: null };
    case 'restart': return PRE_START;
    case 'age':
      if (s.step !== 'age') return s;
      return afterAge(e.age, now);
    case 'grownUp':
      if (s.step !== 'grownUp' || !s.age) return s;
      return { step: 'pain', age: s.age, gate: gateRecord(s.age, true, now) };
    case 'back':
      return backStep(s);
    case 'pain':
      if (s.step !== 'pain' || !s.gate) return s;
      return e.hurts ? { step: 'painStop', age: s.age, gate: null } : { ...s, step: 'cameraInfo' };
    case 'cameraOn':
      if (s.step !== 'cameraInfo' || !s.gate) return s;
      return { ...s, step: 'camera' };
  }
}
