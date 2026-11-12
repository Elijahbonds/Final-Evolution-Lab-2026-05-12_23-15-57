// lib/signature/adapt.ts — SIGNATURE-PROGRAMS (2026-10-25): what a phase's checkpoint decides from the retests.
//
// THE RULE (owner: "the plan adjusts to measured progress"; the Dunk Program §7.4, §8.5, §11 says how the owner does it):
//   1. A standing red flag, or a pain check-in that has not settled → NEVER 'advance'. At a phase's end the last week runs
//      again when there is room (the plan stays inside 8–12 weeks), else the plan moves on with today's gates still
//      holding the jumps and easing the day (./serve.ts). Nothing a pain flag touches gets harder.
//   2. Readiness Low on DRAFT_LOW_CHECKS (2) or more days of the last week (the coach readiness lane's deload trigger,
//      lib/coach/readiness/thresholds.ts) → treated like a retest reading down.
//   3. Any of the phase's retests reading DOWN → at the end, repeat (room permitting); at an early checkpoint, continue.
//   4. At an EARLY checkpoint, every one of the phase's retests reading UP (a jump, the Mirror, a shot) or PASSED (the
//      landing check) → 'advance' (room permitting: the plan never ends under 8 weeks). Anything less → continue.
//   5. Otherwise continue: the plan runs on schedule. No saved numbers (a teen, an adult who has not opted in to saving)
//      is "on schedule", said as such.
// What "up" and "down" mean is ./facts.ts's: the app's existing same-bands (profile v2's half inch for a jump, the
// Mirror's clean-share band, the daily drill's shot band) and the weekly draft's drop thresholds. No new threshold.
//
// Pure.
import type { PainDecision } from '@/lib/health/painRule';
import { decisionLine } from './copy';
import { decisionOptions, type PlanWeek } from './plan';
import type { DecisionKind, PlanEvent, ReadResult, RetestKind, SignatureProgram } from './types';

export type Reads = Partial<Record<RetestKind, ReadResult>>;

export interface DecideInput {
  program: SignatureProgram;
  events: readonly PlanEvent[];
  /** The checkpoint week whose sessions are all done. */
  week: PlanWeek;
  reads: Reads;
  painDecision: PainDecision | null;
  hardStopped: boolean;
  /** The label of the phase that comes next, for the line ("Power: approach and rebound"). */
  nextLabel: string | null;
}

/** A pain decision that keeps the plan from moving up: anything but 'continue' (an easier variation included). */
export const painHolds = (d: PainDecision | null): boolean => d !== null && d !== 'continue';

export function decide(i: DecideInput): Omit<PlanEvent, 'at'> {
  const ph = i.program.phases.find((p) => p.id === i.week.phaseId);
  const options = decisionOptions(i.program, i.events, i.week);
  const reads: Reads = {};
  for (const k of [...(ph?.exit.reads ?? []), 'readiness' as const]) reads[k] = i.reads[k] ?? 'none';
  const exitReads = ph?.exit.reads ?? [];
  const base = { afterWeek: i.week.n, phaseId: i.week.phaseId, reads };
  const out = (kind: DecisionKind, why: Parameters<typeof decisionLine>[0]['why'], which: readonly RetestKind[] = exitReads): Omit<PlanEvent, 'at'> =>
    ({ ...base, kind, line: decisionLine({ kind, why, reads: which, next: kind === 'repeat' ? null : i.nextLabel }) });
  const repeatOr = (why: Parameters<typeof decisionLine>[0]['why'], which?: readonly RetestKind[]) =>
    (i.week.checkpoint === 'end' && options.includes('repeat') ? out('repeat', why, which) : out('continue', i.week.checkpoint === 'end' ? 'no_room' : 'schedule'));

  if (i.hardStopped) return { ...base, kind: 'continue', line: decisionLine({ kind: 'continue', why: 'red_flag', reads: [], next: null }) };
  if (painHolds(i.painDecision)) return repeatOr('pain');
  if (reads.readiness === 'down') return repeatOr('readiness');
  const down = exitReads.filter((k) => reads[k] === 'down');
  if (down.length) return repeatOr('down', down);
  if (i.week.checkpoint === 'early') {
    const allUp = exitReads.length > 0 && exitReads.every((k) => reads[k] === 'up' || reads[k] === 'pass');
    if (allUp && options.includes('advance')) return out('advance', 'up');
  }
  const unread = exitReads.filter((k) => reads[k] === 'none');
  return out('continue', unread.length === exitReads.length && exitReads.length ? 'no_numbers' : 'schedule', unread.length ? unread : exitReads);
}

/** True when a decision would make the plan harder: an advance. Used by the never-harder guard and its test. */
export const isHarder = (k: DecisionKind): boolean => k === 'advance';

/** Readiness over the last week, as a read: 'down' at DRAFT_LOW_CHECKS Low days, else 'same', or 'none' without checks. */
export function readinessRead(lowDays: number | null, minLow: number): ReadResult {
  if (lowDays === null) return 'none';
  return lowDays >= minLow ? 'down' : 'same';
}
