// checks — a graded Quick Screen, as what the athlete sees: one band per check, the top priorities, the program lane,
// the clean-screen rule, and the jump as a personal best (SCREEN-SHIP, 2026-09-29).
//
// THE SUMMARY IS ALL THAT LEAVES MEMORY. The results screen renders from it, and it is the only thing written to
// sessionStorage (lib/screen/store.ts): band words, check ids, the lane and one jump height. No raw per-rep value, no
// metric reading, no hidden metric, no frame: those are computed here, on the device, and dropped (A2-3, gate 5).
//
// Pure.
import type { SessionResult } from '@/lib/assess/runner';
import type { MetricResult, TestResult } from '@/lib/assess/scoring';
import { inches } from '@/lib/assess/why';
import {
  GRADED_CHECKS, THRESHOLDS_VERSION, TOP_PRIORITIES, bandWordOf, bands3Of, type BandWord, type CheckId, type ScreenCheck,
} from './PROPOSED-thresholds';
import { pickLane, type LaneSlug } from './PROPOSED-program-lanes';

export const SUMMARY_VERSION = 1 as const;

export interface CheckBand {
  id: CheckId;
  /** The worse read side for a sided check; null when it was not read. */
  band: BandWord | null;
  sides?: { left: BandWord | null; right: BandWord | null };
}

export interface ScreenSummary {
  v: typeof SUMMARY_VERSION;
  thresholdsVersion: string;
  /** Every GRADED check, in check order (hidden and TODO checks are not here at all). */
  checks: CheckBand[];
  /** Every test scored, every side finished (three valid reps, balance held), every graded check read. */
  complete: boolean;
  /** Complete, with at least one graded check, and every one of them Green (A4-4). */
  clean: boolean;
  /** The top priorities: Red before Yellow, ties by PR #20's metric weight, then check order. */
  priorities: CheckId[];
  lane: LaneSlug | null;
  /** The flag the lane came from (null on a clean screen, or when there is no pick). */
  topFlag: CheckId | null;
  /** The best valid jump, in inches: a personal best, never a band (the draft). */
  jumpBestIn: number | null;
}

const RANK: Record<BandWord, number> = { green: 0, yellow: 1, red: 2 };
const worse = (a: BandWord | null, b: BandWord | null): BandWord | null => (a === null ? b : b === null ? a : RANK[b] > RANK[a] ? b : a);

const metricIn = (t: TestResult | undefined, side: 'both' | 'left' | 'right', id: string): MetricResult | undefined =>
  t?.sides[side]?.metrics.find((m) => m.id === id);
const valueIn = (t: TestResult | undefined, side: 'both' | 'left' | 'right', id: string): number | null =>
  metricIn(t, side, id)?.value ?? null;

/** |L − R| of two per-side medians, or null when either is unread. */
const gap = (l: number | null, r: number | null): number | null => (l === null || r === null ? null : Math.abs(l - r));

/**
 * The value a check is graded on, per side for a sided check. Computed checks (the left–right gaps) are worked out here,
 * on the device, from the per-side medians PR #20 already reads (A2-1): no new tracking, no new landmark metric.
 */
export function checkValues(c: ScreenCheck, tests: readonly TestResult[]): { left?: number | null; right?: number | null; value?: number | null } {
  const t = tests.find((x) => x.id === c.test && x.status === 'scored');
  switch (c.id) {
    case 'ktw.lrGap': return { value: gap(valueIn(t, 'left', 'tibia'), valueIn(t, 'right', 'tibia')) };
    case 'sls.lrGap': {
      const gaps = c.metrics.map((id) => gap(valueIn(t, 'left', id), valueIn(t, 'right', id))).filter((x): x is number => x !== null);
      return { value: gaps.length ? Math.max(...gaps) : null };
    }
    default: break;
  }
  if (!c.sided) return { value: valueIn(t, 'both', c.metrics[0]) };
  // a sided check: T1 and T5 keep both knees in `both` (…Left / …Right); T2 and T3 grade each side on its own
  if (c.test === 'T1' || c.test === 'T5') return { left: valueIn(t, 'both', c.metrics[0]), right: valueIn(t, 'both', c.metrics[1]) };
  return { left: valueIn(t, 'left', c.metrics[0]), right: valueIn(t, 'right', c.metrics[0]) };
}

/** One graded check's band (and each side's, for a sided check). */
export function bandCheck(c: ScreenCheck, tests: readonly TestResult[]): CheckBand {
  const b = bands3Of(c.thresholdId!);
  const v = checkValues(c, tests);
  if (!c.sided) return { id: c.id, band: bandWordOf(v.value, b) };
  const left = bandWordOf(v.left, b), right = bandWordOf(v.right, b);
  return { id: c.id, band: worse(left, right), sides: { left, right } };
}

/** Every test scored and every side finished: three valid reps, and not capped for balance (PR #20's own rule). */
export function testsComplete(tests: readonly TestResult[]): boolean {
  const need = new Set(GRADED_CHECKS.map((c) => c.test));
  for (const id of need) {
    const t = tests.find((x) => x.id === id);
    if (!t || t.status !== 'scored') return false;
    const sides = Object.values(t.sides);
    if (!sides.length || sides.some((s) => !s || !s.complete || !!s.capReason)) return false;
  }
  return true;
}

/** Red before Yellow, then PR #20's metric weight (higher first), then check order. */
export function priorities(checks: readonly CheckBand[], n = TOP_PRIORITIES): CheckId[] {
  const order = GRADED_CHECKS.map((c) => c.id);
  const weight = (id: CheckId) => GRADED_CHECKS.find((c) => c.id === id)?.weight ?? 0;
  return checks
    .filter((c) => c.band === 'red' || c.band === 'yellow')
    .sort((a, b) => (RANK[b.band!] - RANK[a.band!]) || (weight(b.id) - weight(a.id)) || (order.indexOf(a.id) - order.indexOf(b.id)))
    .slice(0, n)
    .map((c) => c.id);
}

/** The summary of a graded session. Null after a pain stop (a referral, not a result: nothing is kept). */
export function summarize(result: SessionResult): ScreenSummary | null {
  if (result.pain) return null;
  const checks = GRADED_CHECKS.map((c) => bandCheck(c, result.tests));
  const allRead = checks.every((c) => c.band !== null && (!c.sides || (c.sides.left !== null && c.sides.right !== null)));
  const complete = testsComplete(result.tests) && allRead;
  const clean = complete && checks.length > 0 && checks.every((c) => c.band === 'green');
  const pick = pickLane(checks, clean);
  const t5 = result.tests.find((t) => t.id === 'T5' && t.status === 'scored');
  const best = t5?.t5?.bestHeightCm ?? null;
  return {
    v: SUMMARY_VERSION, thresholdsVersion: THRESHOLDS_VERSION, checks, complete, clean,
    priorities: priorities(checks), lane: pick.lane, topFlag: pick.flag,
    jumpBestIn: best === null ? null : inches(best),
  };
}
