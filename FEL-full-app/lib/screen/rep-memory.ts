// MIRROR step 2 (plan #6, FAULT REPLAY, 2026-10-13): the worst rep of the top priority, as a skeleton only.
//
// PAGE MEMORY ONLY. The graders already freeze one frame of landmarks per faulted metric (lib/assess/scoring.ts
// FrozenRep). This module holds those frames in a plain module variable between the camera page and the results page
// (a client-side route change keeps it; a reload, a new tab or leaving the results page drops it). Nothing here
// touches localStorage, sessionStorage, IndexedDB, cookies or the network, and nothing here is added to the summary
// (lib/screen/checks.ts) or to any saved record. lib/screen/rep-memory.test.tsx pins all of that.
//
// Adults (18+) only: the camera page holds frames only on the adult branch, and the results view draws them only
// for an adult age (MIRROR-PLAN-REVIEW §4: teens and under-13s get no replay).
//
// Pure apart from the one module variable.
import type { FrozenRep, TestResult } from '@/lib/assess/scoring';
import type { CheckBand } from './checks';
import { checkById } from './PROPOSED-thresholds';

let held: FrozenRep[] | null = null;

/** Keep the frozen worst-rep frames of a finished adult screen, in this page's memory only (copied, never shared). */
export function holdReplay(tests: readonly TestResult[]): void {
  const frames = tests.flatMap((t) => t.frozen ?? []);
  held = frames.length ? frames.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l })) })) : null;
}

/** The held frames, or null. Reading does not clear: the results page clears when it is left. */
export function heldReplay(): readonly FrozenRep[] | null {
  return held;
}

/** Forget every held frame (results page left, "Done, clear my results", a kid or jump-only run, a new screen). */
export function clearReplay(): void {
  held = null;
}

/**
 * The frame to draw for a flagged check's row: a frozen rep of one of the metrics the check reads, on the worse side
 * for a sided check (the side whose band is worse; left on a tie, as the summary ranks). Null when none was frozen.
 */
export function pickReplay(frames: readonly FrozenRep[] | null, row: CheckBand | null): FrozenRep | null {
  if (!frames?.length || !row || (row.band !== 'yellow' && row.band !== 'red')) return null;
  const metrics = checkById(row.id).metrics;
  const mine = frames.filter((f) => metrics.includes(f.metric));
  if (!mine.length) return null;
  if (row.sides) {
    const rank = (b: string | null) => (b === 'red' ? 2 : b === 'yellow' ? 1 : 0);
    const side = rank(row.sides.right) > rank(row.sides.left) ? 'right' : 'left';
    return mine.find((f) => f.side === side || (f.side === undefined && f.metric.toLowerCase().endsWith(side))) ?? mine[0];
  }
  return mine[0];
}
