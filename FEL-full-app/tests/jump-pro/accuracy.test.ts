// JUMP-PRO accuracy targets on the ground-truth bench (lib/jump/bench.ts). The full matrix is
// `npx tsx scripts/jump-accuracy.ts` (docs/JUMP-PRO.md has its table); this pins a cut of it so a change that makes
// the jump read worse is seen. Targets: the benchmark's |bias| ≤ 1 cm and 95 % limits within ±3 cm (1.96·SD ≤ 3),
// against the FORCE-PLATE height (v0²/2g), not the flight time.
import { describe, expect, it } from 'vitest';
import { runCondition, STD_TRIALS, type Condition } from '@/lib/jump/bench';
import { framesReader, t5Reader } from '@/lib/jump/readers';
import { buildTake } from '@/lib/jump/ballistic';

const run = (c: Partial<Condition> & { fps: number }, reader = t5Reader) =>
  runCondition({ name: 'x', trials: STD_TRIALS(), seeds: 4, ...c }, reader);

describe('the bench\'s own truth', () => {
  it('lands in its take-off posture: the flight-time height IS the force-plate height', () => {
    const { truth } = buildTake(STD_TRIALS().map((t) => ({ trial: t })));
    for (const t of truth) expect(Math.abs(t.heightFlightCm - t.heightV0Cm)).toBeLessThan(0.1);
  });
  it('lands on bent knees: lower, longer, and the flight-time height over-reads by the extra fall', () => {
    const { truth } = buildTake(STD_TRIALS({ landKnee: 0.2 }).map((t) => ({ trial: t })));
    for (const t of truth) {
      expect(t.landDropCm).toBeLessThan(-8);
      expect(t.heightFlightCm - t.heightV0Cm).toBeGreaterThan(3);
    }
  });
});

describe('T5 against the force-plate height (lib/jump/refine.ts)', () => {
  for (const fps of [30, 60]) {
    it(`realistic noise at ${fps} fps: |bias| ≤ 1 cm, 95 % limits within ±3 cm, every jump read`, () => {
      const r = run({ fps });
      expect(r.missed).toBe(0);
      expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(1);
      expect(1.96 * r.sdV0).toBeLessThanOrEqual(3.2);
    });
  }
  it('at 240 fps (a slow-mo file): |bias| ≤ 0.5 cm, SD ≤ 1 cm', () => {
    const r = run({ fps: 240, seeds: 2 });
    expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(0.5);
    expect(r.sdV0).toBeLessThanOrEqual(1);
  });
  it('a bent-knee landing is taken back out: the frames alone read it ~5 cm high, the refined read within 1.5 cm', () => {
    const before = run({ fps: 60, trials: STD_TRIALS({ landKnee: 0.2 }) }, framesReader);
    const after = run({ fps: 60, trials: STD_TRIALS({ landKnee: 0.2 }) });
    expect(before.biasV0).toBeGreaterThan(4);
    expect(Math.abs(after.biasV0)).toBeLessThanOrEqual(1.5);
  });
  it('a flat-foot landing too (frames +3 cm)', () => {
    const r = run({ fps: 60, trials: STD_TRIALS({ landToeDeg: 0 }) });
    expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(1);
  });
  it('a squat, a calf raise, a tiny hop and a step are never a valid jump', () => {
    const r = run({
      fps: 30, seeds: 2,
      decoys: [{ decoy: { kind: 'squat', depth: 0.6 } }, { decoy: { kind: 'calfRaise', deg: 35 } }, { decoy: { kind: 'hop', heightM: 0.025 } }, { decoy: { kind: 'step', dz: 0.25 } }],
    });
    expect(r.falseValid).toBe(0);
    expect(r.missed).toBe(0);
  });
  it('the take-off is no longer read late at a high frame rate (the frames alone: +7–12 ms at 120–240 fps)', () => {
    const r = run({ fps: 120, seeds: 2 });
    const late = r.pairs.map((p) => p.read.takeoffT - p.truth.takeoffT);
    expect(Math.abs(late.reduce((a, b) => a + b, 0) / late.length)).toBeLessThanOrEqual(3);
  });
});
