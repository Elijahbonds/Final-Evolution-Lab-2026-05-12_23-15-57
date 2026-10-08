// IMPROVE (2026-10-06): the pure rules behind the owner-picked Sprint items (sprintRules.ts).
import { describe, it, expect } from 'vitest';
import {
  pacerTopSpeed, pacerDistance, pacerSpeed, PACER_TAU_S, gapLabel, falseStartPenaltyS, FALSE_START_PENALTY_S, cadenceCall,
  marksCrossed, loadSprintPb, saveSprintPbIfFaster, sprintPbKey, splitDeltaMs, pbSplitWords, pbDistanceAt, hudDue,
  SPRINT_HUD_HZ, type SprintPb,
} from './sprintRules';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
const pbOf = (totalMs: number, scale = 1): SprintPb => ({ totalMs, atM: [1.9, 3.1, 4.2, 5.2, 6.2, 7.2, 8.2, 9.2, 10.2, 11.2].map((s) => Math.round(s * 1000 * scale)) });

describe('the pacer curve (#6, #10)', () => {
  it('breasts the tape at exactly the race time it is given (13.4 s rival, 13.0 s pace light)', () => {
    expect(pacerDistance(13.4, 13.4, 100)).toBeCloseTo(100, 6);
    expect(pacerDistance(13.4 - 0.05, 13.4, 100)).toBeLessThan(100);
    expect(pacerDistance(13.0, 13.0, 100)).toBeCloseTo(100, 6);
    expect(pacerDistance(20, 13.4, 100)).toBe(100);   // clamped past the tape
  });
  it('accelerates from standing: 0 at the gun, slower than the old constant pace early, faster at the end', () => {
    const old = 100 / 13.4;
    expect(pacerDistance(0, 13.4, 100)).toBe(0);
    expect(pacerSpeed(0, 13.4, 100)).toBe(0);
    expect(pacerDistance(1, 13.4, 100)).toBeLessThan(old * 1);   // the instant jump-ahead is gone
    expect(pacerSpeed(1, 13.4, 100)).toBeLessThan(old);
    expect(pacerSpeed(10, 13.4, 100)).toBeGreaterThan(old);
    expect(pacerTopSpeed(13.4, 100)).toBeGreaterThan(old);
    expect(pacerTopSpeed(13.4, 100)).toBeLessThan(9);           // a club sprinter, not a world record
    let prev = -1;
    for (let t = 0; t <= 13.4; t += 0.1) { const d = pacerDistance(t, 13.4, 100); expect(d).toBeGreaterThanOrEqual(prev); prev = d; }
  });
  it('the speed is the distance\'s derivative', () => {
    const t = 3, h = 1e-4;
    expect((pacerDistance(t + h, 13.4, 100) - pacerDistance(t - h, 13.4, 100)) / (2 * h)).toBeCloseTo(pacerSpeed(t, 13.4, 100), 4);
  });
  it('τ = 0 is the old constant pace; the sub-13 light is always ahead of the 13.4 rival', () => {
    expect(pacerDistance(6.7, 13.4, 100, 0)).toBeCloseTo(50, 6);
    expect(PACER_TAU_S).toBeGreaterThan(0);
    for (let t = 0.5; t < 13; t += 0.5) expect(pacerDistance(t, 13.0, 100)).toBeGreaterThan(pacerDistance(t, 13.4, 100));
  });
  it('gaps read signed, to a tenth (#8)', () => {
    expect(gapLabel(1.23)).toBe('+1.2 m');
    expect(gapLabel(-0.84)).toBe('−0.8 m');
    expect(gapLabel(0)).toBe('+0.0 m');
    expect(gapLabel(NaN)).toBe('');
  });
});

describe('false starts (#12) and the off-beat call (#2)', () => {
  it('the first false start is the warning, every one after it costs FALSE_START_PENALTY_S', () => {
    expect(falseStartPenaltyS(0)).toBe(0);
    expect(falseStartPenaltyS(1)).toBe(0);
    expect(falseStartPenaltyS(2)).toBeCloseTo(FALSE_START_PENALTY_S, 9);
    expect(falseStartPenaltyS(4)).toBeCloseTo(3 * FALSE_START_PENALTY_S, 9);
  });
  it('a late stride says FASTER, an early one SLOWER, nothing without a signed error', () => {
    expect(cadenceCall(60)).toBe('FASTER');
    expect(cadenceCall(-60)).toBe('SLOWER');
    expect(cadenceCall(0)).toBeNull();
    expect(cadenceCall(null)).toBeNull();
    expect(cadenceCall(NaN)).toBeNull();
  });
});

describe('PB splits (#9)', () => {
  it('marks crossed between two frames carry the clock interpolated on the distance', () => {
    expect(marksCrossed(9.8, 10.2, 1000, 1040)).toEqual([{ m: 10, ms: 1020 }]);
    expect(marksCrossed(29.9, 30, 4000, 4010)).toEqual([{ m: 30, ms: 4010 }]);   // landing exactly on the mark counts
    expect(marksCrossed(30, 30.1, 4010, 4020)).toEqual([]);                      // …once
    expect(marksCrossed(5, 25, 0, 2000).map((c) => c.m)).toEqual([10, 20]);
    expect(marksCrossed(10, 9, 0, 1)).toEqual([]);
  });
  it('only a complete run that beats the best is kept; a broken store reads as no PB', () => {
    const s = memStore();
    expect(loadSprintPb(100, s)).toBeNull();
    expect(saveSprintPbIfFaster(100, pbOf(12000), s)).toEqual({ improved: true, previous: null });
    expect(saveSprintPbIfFaster(100, pbOf(12500), s).improved).toBe(false);
    expect(loadSprintPb(100, s)?.totalMs).toBe(12000);
    const better = saveSprintPbIfFaster(100, pbOf(11800, 0.98), s);
    expect(better.improved).toBe(true);
    expect(better.previous?.totalMs).toBe(12000);
    expect(loadSprintPb(100, s)?.totalMs).toBe(11800);
    // an unfinished run (missing splits) never becomes the reference
    expect(saveSprintPbIfFaster(100, { totalMs: 9000, atM: [1000, 2000] }, s).improved).toBe(false);
    s.m.set(sprintPbKey(100), '{nope');
    expect(loadSprintPb(100, s)).toBeNull();
    s.m.set(sprintPbKey(100), JSON.stringify({ totalMs: 12000, atM: [3, 2, 1, 4, 5, 6, 7, 8, 9, 10] }));   // not monotonic
    expect(loadSprintPb(100, s)).toBeNull();
    expect(saveSprintPbIfFaster(100, pbOf(12000), null)).toEqual({ improved: true, previous: null });     // no storage: nothing kept, nothing thrown
  });
  it('a split reads against the PB at the same distance; the marker sits where the PB run was at this clock', () => {
    const pb = pbOf(11200);
    expect(splitDeltaMs(pb, 30, 4100)).toBe(-100);
    expect(splitDeltaMs(null, 30, 4100)).toBeNull();
    expect(pbSplitWords(-100)).toBe('PB −0.10');
    expect(pbSplitWords(null)).toBe('');
    expect(pbDistanceAt(pb, 1900)).toBeCloseTo(10, 9);
    expect(pbDistanceAt(pb, 950)).toBeCloseTo(5, 9);
    expect(pbDistanceAt(pb, 3650)).toBeCloseTo(25, 9);
    expect(pbDistanceAt(pb, 60000)).toBe(100);
    expect(pbDistanceAt(null, 3000)).toBeNull();
  });
});

describe('the HUD gate (#14)', () => {
  it('a discrete change goes at once; the running numbers at SPRINT_HUD_HZ', () => {
    expect(hudDue(null, 'a', 0)).toBe(true);
    expect(hudDue('a', 'b', 0)).toBe(true);
    expect(hudDue('a', 'a', 1 / 60)).toBe(false);
    expect(hudDue('a', 'a', 1 / SPRINT_HUD_HZ)).toBe(true);
    // at 60 fps over one second: ~10 pushes, not 60
    let key: string | null = null, age = 0, pushes = 0;
    for (let f = 0; f < 60; f++) { age += 1 / 60; if (hudDue(key, 'k', age)) { key = 'k'; age = 0; pushes++; } }
    expect(pushes).toBeLessThanOrEqual(11);
    expect(pushes).toBeGreaterThanOrEqual(9);
  });
});
