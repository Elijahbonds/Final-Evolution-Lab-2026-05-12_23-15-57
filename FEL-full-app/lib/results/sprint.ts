// lib/results/sprint — a camera sprint's result as a ResultView (PLAT-P03, 2026-10-28): a sprint to a line, a flying
// sprint, the 5-10-5 (beta) and the speed trace's top speed.
//
// BAND (read-only). The sprint tool has no same-band constant. What it has is each read's OWN ± (lib/sprint/copy.ts
// timeWithBand / speedWithBand: 2 SD of that read, rounded up, "how much this read could vary"). Two reads are told
// apart the way the jump tool tells two sessions apart (lib/jump/session.ts realChange: the bands added in quadrature),
// so "same" = |change| ≤ √(±now² + ±last²), with each ± exactly as the screen prints it. No new number.
// assumption: that rule (flagged; owner call 2 in the report). A run with no ± gets no arrow.
//
// COMPARABLE: the same test, the same distance (label) and the same start (a Go-started time includes the reaction; a
// first-movement start does not), never across them.
//
// Pure.
import type { RunResult } from '@/lib/sprint/session';
import type { SprintRecord } from '@/lib/sprint/store';
import { compareLast, vsLineOf, type ResultNextStep, type ResultView } from './view';
import { RESULT_COPY } from './copy';

type Ok = Extract<RunResult, { ok: true }>;

/** The ± the screen prints for a time (lib/sprint/copy.ts timeWithBand): 2 SD, rounded up to the hundredth. */
export const timePm = (sdS: number | null): number | null => (sdS === null ? null : Math.max(0.01, Math.ceil(2 * sdS * 100) / 100));
/** …and for a speed (speedWithBand): 2 SD, rounded up to the tenth. */
export const speedPm = (sd: number | null): number | null => (sd === null ? null : Math.max(0.1, Math.ceil(2 * sd * 10) / 10));

/** Two reads' ± in quadrature, or null when either has none. */
export function sprintBand(pmNow: number | null, pmLast: number | null): number | null {
  return pmNow === null || pmLast === null ? null : Math.hypot(pmNow, pmLast);
}

/** The measure's name on the card. */
export function sprintMeasure(r: Pick<Ok, 'test' | 'label'>): string {
  if (r.test === 'gate') return `${r.label} sprint`;
  if (r.test === 'trace') return 'Top speed';
  return r.label;
}

/** The last run on this phone that this one can be compared with, or null. */
export function lastComparable(runs: readonly SprintRecord[], r: Pick<Ok, 'test' | 'label' | 'startKind' | 'reactionIncluded'>, excludeId?: string): SprintRecord | null {
  return runs.find((x) => x.id !== excludeId && x.test === r.test && x.label === r.label && x.startKind === r.startKind && x.reactionIncluded === r.reactionIncluded
    && (r.test === 'trace' ? x.topSpeed !== null : x.timeS !== null)) ?? null;
}

/** One run → the card. `last` is the comparable run kept before it (lastComparable). */
export function sprintView(r: Ok, last: SprintRecord | null, line: string, next: ResultNextStep): ResultView {
  const speed = r.test === 'trace';
  const now = speed ? r.trace?.topSpeed ?? null : r.timeS;
  const pmNow = speed ? speedPm(r.trace?.topSpeedSd ?? null) : timePm(r.sdS);
  const lastV = last ? (speed ? last.topSpeed : last.timeS) : null;
  const pmLast = last ? (speed ? speedPm(last.topSpeedSd) : timePm(last.sdS)) : null;
  const c = compareLast(now, lastV, sprintBand(pmNow, pmLast));
  const fmt = speed ? (x: number) => `${x.toFixed(1)} m/s` : (x: number) => `${x.toFixed(2)} s`;
  return {
    measure: sprintMeasure(r), value: now === null ? null : speed ? now.toFixed(1) : now.toFixed(2), unit: speed ? 'm/s' : 's',
    estimate: true, pm: pmNow === null ? null : speed ? pmNow.toFixed(1) : pmNow.toFixed(2),
    vsLast: c.vsLast, better: speed ? 'up' : 'down',
    vsLine: vsLineOf(c, { against: RESULT_COPY.lastTime, up: speed ? 'faster' : 'slower', down: speed ? 'slower' : 'faster', fmt }),
    line, next,
  };
}
