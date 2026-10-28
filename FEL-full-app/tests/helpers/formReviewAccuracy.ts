// tests/helpers/formReviewAccuracy.ts — COACH-VIDEO-REVIEW (2026-10-24): how one labelled set scored. Test-only.
import { readSet } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps } from '@/lib/coach/formReview/score';
import type { LabelledSet } from './formReviewSets';

export interface SetScore {
  trueReps: number;
  counted: number;
  /** max(0, true − counted), max(0, counted − true). */
  missed: number;
  extra: number;
  flags: number;
  /** Flags on a rep that carried an injected fault, naming one of those faults. */
  truePositiveFlags: number;
  injected: number;
  injectedFlagged: number;
  /** The flags as "rep:fault", for a failing test's message. */
  detail: string[];
}

export function scoreSet(s: LabelledSet): SetScore {
  const reps = scoreReps(s.movement, readSet(s.movement, s.frames));
  const flags = flagsFor(s.movement, reps);
  const injected = Object.keys(s.truth.faulty).map(Number);
  const tp = flags.filter((f) => s.truth.faulty[f.rep]?.includes(f.fault)).length;
  return {
    trueReps: s.truth.reps, counted: reps.length,
    missed: Math.max(0, s.truth.reps - reps.length), extra: Math.max(0, reps.length - s.truth.reps),
    flags: flags.length, truePositiveFlags: tp, injected: injected.length,
    injectedFlagged: injected.filter((n) => flags.some((f) => f.rep === n)).length,
    detail: flags.map((f) => `${f.rep}:${f.fault}`),
  };
}
