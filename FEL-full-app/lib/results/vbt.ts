// lib/results/vbt — a bar-speed set as a ResultView (PLAT-P03, 2026-10-28).
//
// BAND (read-only). The bar-speed tool's own "is this change real?" is the one its warm-up readiness read already uses
// (lib/vbt/readiness.ts): a day's bar speed in the readiness steps' shape (asDay: the first READINESS_REPS reps, the
// typical error never under BAR_SPEED_CV of the mean, "the body's own day-to-day spread at a fixed load"), then the jump
// tool's realChange (lib/jump/session.ts). The same lift, at a load within READINESS_LOAD_TOL of the last one, or no
// arrow. Med-ball throws have no band in the tool: no arrow.
//
// Pure.
import { realChange } from '@/lib/jump/session';
import { asDay } from '@/lib/vbt/readiness';
import { READINESS_LOAD_TOL, READINESS_REPS } from '@/lib/vbt/thresholds';
import type { KeptSet } from '@/lib/vbt/sets';
import type { LiftId } from '@/lib/vbt/lifts';
import { vsLineOf, type Comparison, type ResultNextStep, type ResultView } from './view';
import { RESULT_COPY } from './copy';

/** A set's first reps as the warm-up read takes them: best, mean and SD (m/s). Null under two reps. */
export function setSpeedOf(repMcvs: readonly number[]): { bestMcv: number; meanMcv: number; sdMcv: number; reps: number } | null {
  const v = repMcvs.filter((x) => Number.isFinite(x)).slice(0, READINESS_REPS);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1));
  return { bestMcv: Math.max(...v), meanMcv: mean, sdMcv: sd, reps: v.length };
}

/** Same lift; both unloaded, or loads within the tool's own readiness tolerance. */
export function sameLoad(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= READINESS_LOAD_TOL * Math.max(a, b);
}

/** The last kept set this one can be compared with (newest first), or null. */
export function lastComparableSet(history: readonly KeptSet[], lift: LiftId, loadKg: number | null, beforeAt: number): KeptSet | null {
  return [...history].filter((s) => s.at < beforeAt && s.lift === lift && sameLoad(loadKg, s.loadKg) && s.repMcvs.length >= 2)
    .sort((x, y) => y.at - x.at)[0] ?? null;
}

/** Two sets' bar speed through the tool's own real-change test. */
export function vbtCompare(nowReps: readonly number[], lastReps: readonly number[] | null, fps: number): Comparison {
  const a = setSpeedOf(nowReps), b = lastReps ? setSpeedOf(lastReps) : null;
  if (!a || !b) return { vsLast: null, delta: null };
  const day = (s: NonNullable<typeof a>) => asDay({ day: '', lift: 'back_squat', loadKg: 1, bestMcv: s.bestMcv, meanMcv: s.meanMcv, sdMcv: s.sdMcv, reps: s.reps, fps });
  const now = day(a), before = day(b);
  const r = realChange({ cm: now.bestCm, teCm: now.teCm }, { cm: before.bestCm, teCm: before.teCm });
  return { vsLast: r.kind, delta: (now.bestCm - before.bestCm) / 100 };
}

/** One set → the card. `repMcvs`: the counted reps' mean speeds, in order. */
export function vbtView(o: {
  liftName: string; loadKg: number | null; bestMcv: number | null; pm: number | null; repMcvs: readonly number[]; fps: number;
  last: KeptSet | null; throws?: boolean; line: string; next: ResultNextStep;
}): ResultView {
  const c = o.throws ? { vsLast: null, delta: null } : vbtCompare(o.repMcvs, o.last?.repMcvs ?? null, o.fps);
  return {
    measure: `${o.liftName}${o.loadKg ? ` · ${o.loadKg} kg` : ''}`,
    value: o.bestMcv == null ? null : o.bestMcv.toFixed(2), unit: 'm/s', estimate: true, pm: o.pm == null ? null : o.pm.toFixed(2),
    vsLast: o.bestMcv == null ? null : c.vsLast, better: 'up',
    vsLine: o.bestMcv == null ? null : vsLineOf(c, { against: RESULT_COPY.lastTime, up: 'faster', down: 'slower', fmt: (x) => `${x.toFixed(2)} m/s` }),
    line: o.line, next: o.next,
  };
}
