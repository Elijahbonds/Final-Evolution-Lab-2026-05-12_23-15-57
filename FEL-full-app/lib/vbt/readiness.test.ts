// The warm-up bar speed through the EXISTING readiness rules: building, normal noise never Low, a real drop past the
// coach's line Low, and the coach's own rule read (no new rule engine).
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE } from '@/lib/coach/readiness/rules';
import { asDay, priorsFor, readBarSpeed, warmupOf, type BarSpeedDay } from './readiness';
import type { SetRead } from './reps';

const dayAgo = (n: number) => new Date(Date.UTC(2026, 9, 25 - n)).toISOString().slice(0, 10);
const TODAY = dayAgo(0);
const normal = (n: number, v: number, extra: Partial<BarSpeedDay> = {}): BarSpeedDay => ({
  day: dayAgo(n), lift: 'back_squat', loadKg: 100, bestMcv: v, meanMcv: v - 0.02, sdMcv: 0.015, reps: 3, fps: 60, belowReal: false, band: 'normal', ...extra,
});
const HISTORY = [0.62, 0.63, 0.61, 0.62, 0.64, 0.62].map((v, i) => normal(i + 1, v));
const today = (v: number) => ({ day: TODAY, lift: 'back_squat' as const, loadKg: 100, bestMcv: v, meanMcv: v - 0.02, sdMcv: 0.015, reps: 3, fps: 60 });

describe('bar-speed readiness', () => {
  it('the speed in the readiness steps\' shape: cm/s, the typical error never under the body\'s 4 %', () => {
    const d = asDay(today(0.6));
    expect(d.bestCm).toBe(60);
    expect(d.teCm).toBeCloseTo(0.04 * 58, 3);
  });

  it('only the same lift at about the same load is the baseline', () => {
    const mixed = [...HISTORY, normal(2, 0.9, { lift: 'bench_press' }), normal(3, 0.4, { loadKg: 140 }), normal(4, 0.62, { loadKg: 101.5 })];
    expect(priorsFor(mixed, 'back_squat', 100)).toHaveLength(HISTORY.length + 1);
  });

  it('fewer than three earlier days: building', () => {
    expect(readBarSpeed(today(0.5), HISTORY.slice(0, 2)).read.band).toBe('building');
  });

  it('inside the noise: normal, never Low', () => {
    for (const v of [0.6, 0.61, 0.63, 0.64]) expect(readBarSpeed(today(v), HISTORY).read.band, String(v)).toBe('normal');
  });

  it('a real 12 % drop past the default rule: Low, and an ease under the default rule', () => {
    const r = readBarSpeed(today(0.545), HISTORY);
    expect(r.facts.belowReal).toBe(true);
    expect(r.read.band).toBe('low');
    expect(r.read.ease).toBe(true);
    expect(r.kept.band).toBe('low');
  });

  it('a coach\'s rule is the one read (a 15 % line: the same day reads Normal)', () => {
    const coach = [{ coachId: 'c1', coachName: 'Coach', rule: { ...DEFAULT_RULE, dropPct: 15, source: 'athlete' as const }, shared: true }];
    expect(readBarSpeed(today(0.545), HISTORY, coach).read.band).toBe('normal');
  });

  it('a warm-up set gives the day: its first three counted reps', () => {
    const read = { reps: [0.7, 0.66, 0.68, 0.5].map((mcv, i) => ({ counted: true, mcv, index: i + 1 })), fps: 60 } as unknown as SetRead;
    const w = warmupOf(read, { day: TODAY, lift: 'back_squat', loadKg: 100 })!;
    expect(w).toMatchObject({ bestMcv: 0.7, meanMcv: 0.68, reps: 3 });
    expect(warmupOf({ reps: [], fps: 60 } as unknown as SetRead, { day: TODAY, lift: 'back_squat', loadKg: 100 })).toBeNull();
  });
});
