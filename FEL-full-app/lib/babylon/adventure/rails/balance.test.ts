// The rail balance needle is GrindManual.BalanceChannel's integrator, ported so the sim stays Babylon-free. This pins
// the port to the original — same seeded generator, same needle, every step — and pins the copied constants. The test
// may import the original (vitest runs Babylon's maths fine); the sim may not.
import { describe, expect, it } from 'vitest';
import { BalanceChannel, BALANCE_DRIFT_RATE as ORIG_DRIFT, BALANCE_EDGE as ORIG_EDGE, KIND_DRIFT } from '@/lib/babylon/core/GrindManual';
import { BalanceModel } from '@/lib/babylon/core/BoardPhysics';
import { mulberry32 } from '../movement/math';
import { BALANCE_DRIFT_RATE, BALANCE_EDGE, GRIND_KIND_DRIFT, RailBalance } from './balance';

describe('RailBalance: the port of BalanceChannel', () => {
  it('copies GrindManual\'s constants by value', () => {
    expect(BALANCE_DRIFT_RATE).toBe(ORIG_DRIFT);
    expect(BALANCE_EDGE).toBe(ORIG_EDGE);
    expect(GRIND_KIND_DRIFT).toBe(KIND_DRIFT.grind);
  });

  it('with wander 1 and no curve it is the original needle, step for step, slip for slip', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const orig = new BalanceChannel('grind', new BalanceModel(), mulberry32(seed));
      const port = new RailBalance(mulberry32(seed));
      orig.start(0.5); port.start();
      const stick = mulberry32(seed + 99);
      for (let i = 0; i < 600; i++) {
        const sx = i % 90 < 45 ? stick() * 2 - 1 : 0;
        const r = orig.update(1 / 60, sx, 0.5);
        const slipped = port.update(1 / 60, sx, 0.5, 1, 0);
        expect(port.needle).toBeCloseTo(orig.needle, 12);
        expect(slipped).toBe(r.slipped);
        if (r.slipped) break;
      }
    }
  });

  it('a curve pushes the needle toward the side to lean, and leaning that way holds it', () => {
    const rnd = mulberry32(5);
    const handsOff = new RailBalance(rnd); handsOff.start();
    let slipped = false;
    for (let i = 0; i < 240 && !slipped; i++) slipped = handsOff.update(1 / 60, 0, 0.6, 0, 2.5);
    expect(slipped).toBe(true);                     // a right-hand curve, hands off: off the rail
    const leaning = new RailBalance(mulberry32(5)); leaning.start();
    for (let i = 0; i < 600; i++) expect(leaning.update(1 / 60, 0.8, 0.6, 0, 2.5)).toBe(false);
    expect(Math.abs(leaning.needle)).toBeLessThan(1);   // held inside the edge (over-leaning tips it the other way, still on)
  });
});
