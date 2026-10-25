// lib/vbt/readiness.ts — VBT (2026-10-25): today's warm-up bar speed against the athlete's own normal, read by the
// EXISTING readiness rules (lib/coach/readiness) — a new input, not a new rule engine.
//
// HOW. A warm-up set at a load the athlete uses often (the same lift, a load within READINESS_LOAD_TOL of the earlier
// days') gives the day's bar speed: the best and the mean of its first READINESS_REPS counted reps. Those go through the
// readiness check's own steps unchanged — baselineOf (the rolling normal, Low days left out), measure (the drop, and the
// smallest real change from lib/jump/session.ts), applyRule with each coach's rule (readDay) — by putting the speed in
// the shape those steps read: centimetres per second in the `…Cm` fields (the steps only compare like with like), the
// day's typical error as the reps' SD, never under BAR_SPEED_CV of the mean (the body's own day-to-day spread at a fixed
// load). So the same coach's rule ("a drop of X %…") reads the bar the way it reads the jump, and normal noise never
// reads as a drop.
//
// WHAT IT DOES NOT DO (routed to the readiness lane's files, flagged): ease Today's session or fire the coach's alert
// from a bar-speed day. Both sit on ReadinessJumpCheck rows (lib/coach/readiness/server.ts); a bar-speed source for them
// is a change in those files, written up in docs/VBT.md §7, not made here.
//
// Pure.
import type { DayJumps, PriorCheck } from '@/lib/coach/readiness/types';
import { readDay, type CoachRuleCtx } from '@/lib/coach/readiness/view';
import type { ReadinessFacts, ReadinessRead } from '@/lib/coach/readiness/types';
import type { LiftId } from './lifts';
import type { SetRead } from './reps';
import { BAR_SPEED_CV, READINESS_LOAD_TOL, READINESS_REPS } from './thresholds';

/** One day's warm-up bar speed, as kept (server or phone). */
export interface BarSpeedDay {
  day: string;
  lift: LiftId;
  loadKg: number;
  /** m/s */
  bestMcv: number;
  meanMcv: number;
  sdMcv: number;
  reps: number;
  fps: number;
  /** That day's read, for the baseline's "Low days left out" and the twice-in-a-row rule. */
  belowReal: boolean;
  band: PriorCheck['band'];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** A warm-up set → the day's bar speed, or null when it has too few counted reps. */
export function warmupOf(read: SetRead, o: { day: string; lift: LiftId; loadKg: number }): Omit<BarSpeedDay, 'belowReal' | 'band'> | null {
  const reps = read.reps.filter((r) => r.counted).slice(0, READINESS_REPS);
  if (reps.length < 2 || !(o.loadKg > 0)) return null;
  const v = reps.map((r) => r.mcv);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1));
  return { day: o.day, lift: o.lift, loadKg: o.loadKg, bestMcv: r3(Math.max(...v)), meanMcv: r3(mean), sdMcv: r3(sd), reps: v.length, fps: read.fps };
}

/** The readiness steps' shape: cm/s in the …Cm fields. */
export function asDay(d: Omit<BarSpeedDay, 'belowReal' | 'band'>): DayJumps {
  const te = Math.max(d.sdMcv, BAR_SPEED_CV * d.meanMcv);
  return { day: d.day, bestCm: r3(d.bestMcv * 100), meanCm: r3(d.meanMcv * 100), teCm: r3(te * 100), jumps: d.reps, poseHz: d.fps };
}

/** Earlier days at the same lift and (about) the same load, as the baseline reads them. */
export function priorsFor(history: readonly BarSpeedDay[], lift: LiftId, loadKg: number): PriorCheck[] {
  return history
    .filter((h) => h.lift === lift && Math.abs(h.loadKg - loadKg) <= READINESS_LOAD_TOL * loadKg)
    .map((h) => ({ ...asDay(h), belowReal: h.belowReal, band: h.band }));
}

/** Today's bar speed through the readiness rules. */
export function readBarSpeed(today: Omit<BarSpeedDay, 'belowReal' | 'band'>, history: readonly BarSpeedDay[], coaches: readonly CoachRuleCtx[] = [], feel: number | null = null): { facts: ReadinessFacts; read: ReadinessRead; kept: BarSpeedDay } {
  const prior = priorsFor(history.filter((h) => h.day < today.day), today.lift, today.loadKg);
  const { facts, read } = readDay(asDay(today), prior, feel, coaches);
  return { facts, read, kept: { ...today, belowReal: facts.belowReal, band: read.band } };
}
