import { describe, expect, it } from 'vitest';
import { fitGather, gatherDistAt, gatherProgress, gatherSpeedAt, planGather, GATHER_BRAKE_FROM, GATHER_CLIP_SEC, PENULT_CLIP_SEC } from './DunkGatherRun';

describe('DunkGatherRun — push 1-2 at the runner\'s own speed', () => {
  it('keeps the run into the penultimate, then brakes smoothly to the plant\'s own speed', () => {
    expect(gatherSpeedAt(0, 7, 2.24)).toBe(7);
    expect(gatherSpeedAt(GATHER_BRAKE_FROM, 7, 2.24)).toBe(7);
    expect(gatherSpeedAt(GATHER_CLIP_SEC, 7, 2.24)).toBeCloseTo(2.24, 6);
    let prev = 7;
    for (let t = 0.13; t <= 0.5; t += 0.01) { const v = gatherSpeedAt(t, 7, 2.24); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
  });
  it('the distance integral matches a fine numeric integration of the speed', () => {
    let d = 0; const h = 1e-4;
    for (let t = 0; t < GATHER_CLIP_SEC; t += h) d += gatherSpeedAt(t + h / 2, 6, 1.5) * h;
    expect(gatherDistAt(GATHER_CLIP_SEC, 6, 1.5)).toBeCloseTo(d, 3);
    expect(gatherProgress(0, 6, 1.5)).toBe(0); expect(gatherProgress(GATHER_CLIP_SEC, 6, 1.5)).toBeCloseTo(1, 9);
  });
  it('a sprint gets the staccato — the penultimate ~0.12 s on the floor, not the 0.47 s the crawl measured', () => {
    const p = planGather(7, 2.24);
    expect(PENULT_CLIP_SEC / p.rate).toBeLessThan(0.15);
    expect(p.sec).toBeLessThan(0.35);
    expect(p.dist).toBeGreaterThan(1.3);                     // it covers real ground at speed (two steps, ~1.4 m at 7 m/s)
    const jog = planGather(3, 2.24);                         // a jog takes the same two steps, slower: the ground is the stride's
    expect(jog.rate).toBeLessThan(p.rate); expect(jog.sec).toBeGreaterThan(p.sec);
    expect(Math.abs(jog.dist - p.dist) / p.dist).toBeLessThan(0.15);
  });
  it('fitGather lands the plant on the line from wherever it starts, inside the rate bounds', () => {
    const nat = planGather(6.5, 2.24);
    const f = fitGather(nat.dist, 6.5, 2.24);
    expect(f.rate).toBeCloseTo(nat.rate, 6);
    const early = fitGather(nat.dist * 1.25, 6.5, 2.24);     // a foot-locked start a little out: a touch slower, same shape
    expect(early.rate).toBeLessThan(nat.rate); expect(early.sec).toBeGreaterThan(nat.sec);
    expect(fitGather(0.01, 6.5, 2.24).rate).toBe(2); expect(fitGather(50, 6.5, 2.24).rate).toBe(0.6);
  });
});
