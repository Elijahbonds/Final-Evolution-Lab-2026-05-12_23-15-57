// flow — the Quick Screen's steps before the camera, as a pure reducer (SCREEN-SHIP, 2026-09-29).
//
//   start → age → (under 18 or no age: a parent's consent) → "Does anything hurt right now?" → camera
//
// "Yes" to pain ends it: no camera, no checks, nothing kept. The camera is asked for ONLY from the pain step's "no"
// (`camera: true`), so nothing before it can open one. The gate record is built here and held by the page, in memory;
// it reaches sessionStorage only with the result (lib/screen/store.ts).
//
// Pure.
import { gateRecord, needsParent, type AgeBand, type GateRecord } from './store';

export type PreStep = 'intro' | 'age' | 'consent' | 'pain' | 'painStop' | 'camera';

export interface PreState {
  step: PreStep;
  age: AgeBand | null;
  gate: GateRecord | null;
}

export type PreEvent =
  | { type: 'start' }
  | { type: 'age'; age: AgeBand }
  | { type: 'consent' }
  | { type: 'back' }
  | { type: 'pain'; hurts: boolean }
  | { type: 'restart' };

export const PRE_START: PreState = { step: 'intro', age: null, gate: null };

export function preStep(s: PreState, e: PreEvent, now: Date = new Date()): PreState {
  switch (e.type) {
    case 'start': return { step: 'age', age: null, gate: null };
    case 'restart': return PRE_START;
    case 'age':
      if (s.step !== 'age') return s;
      return needsParent(e.age) ? { step: 'consent', age: e.age, gate: null } : { step: 'pain', age: e.age, gate: gateRecord(e.age, false, now) };
    case 'consent':
      if (s.step !== 'consent' || !s.age) return s;
      return { step: 'pain', age: s.age, gate: gateRecord(s.age, true, now) };
    case 'back':
      return s.step === 'consent' ? { step: 'age', age: null, gate: null } : s;
    case 'pain':
      if (s.step !== 'pain' || !s.gate) return s;
      return e.hurts ? { step: 'painStop', age: s.age, gate: null } : { ...s, step: 'camera' };
  }
}
