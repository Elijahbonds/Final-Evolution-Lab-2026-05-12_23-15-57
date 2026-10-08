// Traversal tuning (lane A1): the numbers the plan fixed, the copies of FreeRunCore's gates, and the PRQ feel —
// a guest is READY at exactly 1.0, and no band moves any feel outside PrqVitals' own window (never a paywall).
import { describe, expect, it } from 'vitest';
import { SPRINT_GATE, WALK_MAX } from '@/lib/babylon/core/FreeRunCore';
import { MAX_SPEED_MULT, MIN_SPEED_MULT } from '@/lib/babylon/core/PrqVitals';
import { PRQ_BANDS } from '../contracts';
import { DEFAULT_FLIGHT } from '../flight/params';
import { DEFAULT_MOVEMENT, FREERUN_SPRINT_GATE, FREERUN_WALK_MAX, NEUTRAL_FEEL, movementFeelFor, movementParams } from './params';
import { wishDir } from '../contracts';
import { leanOf, wish, wishInto } from './input';

describe('params: the plan\'s numbers', () => {
  it('ground, homing and rails', () => {
    const m = DEFAULT_MOVEMENT;
    expect([m.ground.jogSpeed, m.ground.runSpeed, m.ground.flowTopSpeeds[3]]).toEqual([6, 9, 14]);
    expect([m.homing.range, m.homing.speed]).toEqual([9, 22]);
    expect([m.rail.leanWith, m.rail.leanAgainst, m.rail.topSpeed]).toEqual([3, 4, 24]);
  });

  it('flight', () => {
    const f = DEFAULT_FLIGHT;
    expect([f.freeSpeed, f.ascendSpeed, f.descendSpeed, f.dashSpeed, f.dashSec]).toEqual([14, 8, 10, 30, 0.35]);
    expect([f.cruiseEnterSpeed, f.cruiseSpeed, f.cruiseBankMaxRad]).toEqual([18, 40, Math.PI / 3]);
    expect([f.drainPerSec.free, f.drainPerSec.cruise, f.dashCost]).toEqual([4, 8, 10]);
  });

  it('FreeRunCore\'s gates, copied by value', () => {
    expect(FREERUN_WALK_MAX).toBe(WALK_MAX);
    expect(FREERUN_SPRINT_GATE).toBe(SPRINT_GATE);
  });

  it('overrides change one field and leave the frozen defaults alone', () => {
    const p = movementParams({ rail: { topSpeed: 30 } });
    expect(p.rail.topSpeed).toBe(30);
    expect(p.rail.leanWith).toBe(3);
    expect(DEFAULT_MOVEMENT.rail.topSpeed).toBe(24);
    expect(Object.isFrozen(DEFAULT_MOVEMENT.ground)).toBe(true);
  });
});

describe('params: PRQ feel (arcadeParamsFromPRQ, damped to PrqVitals\' window)', () => {
  it('a guest (no band, no attributes) and a READY player feel exactly neutral', () => {
    expect(movementFeelFor(null)).toEqual(NEUTRAL_FEEL);
    expect(movementFeelFor({ prqBand: 'READY' })).toEqual(NEUTRAL_FEEL);
  });

  it('bands order the feel, and every feel stays inside PrqVitals\' 0.85–1.2', () => {
    const run = PRQ_BANDS.map((b) => movementFeelFor({ prqBand: b }).run);
    for (let i = 1; i < run.length; i++) expect(run[i]).toBeGreaterThan(run[i - 1]);
    for (const b of PRQ_BANDS) for (const v of Object.values(movementFeelFor({ prqBand: b, attrs: { mental: 100 } }))) {
      expect(v).toBeGreaterThanOrEqual(MIN_SPEED_MULT);
      expect(v).toBeLessThanOrEqual(MAX_SPEED_MULT);
    }
    expect(movementFeelFor({ prqBand: 'ELITE' }).run).toBeLessThan(1.2);
    expect(movementFeelFor({ prqBand: 'RECOVERING' }).run).toBeGreaterThan(0.9);
  });
});

describe('input: one stick, three devices', () => {
  it('wishInto with no deadzone is contracts.wishDir exactly', () => {
    const out = wish();
    for (const [x, y, yaw] of [[0, 1, 0], [1, 0, 0.7], [0.3, -0.4, 2], [1, 1, -1], [0, 0, 1]] as const) {
      const ref = wishDir({ move: { x, y }, camYaw: yaw });
      wishInto({ move: { x, y }, camYaw: yaw }, 0, out);
      expect(out.x).toBeCloseTo(ref.x, 12); expect(out.z).toBeCloseTo(ref.z, 12); expect(out.mag).toBeCloseTo(ref.mag, 12);
    }
  });

  it('the deadzone is cut and the rest rescaled; the lean reads against the rider\'s right', () => {
    const out = wish();
    expect(wishInto({ move: { x: 0, y: 0.1 }, camYaw: 0 }, 0.12, out).mag).toBe(0);
    expect(wishInto({ move: { x: 0, y: 1 }, camYaw: 0 }, 0.12, out).mag).toBeCloseTo(1);
    expect(wishInto({ move: { x: 0, y: 0.56 }, camYaw: 0 }, 0.12, out).mag).toBeCloseTo(0.5);
    // a rider facing +x (yaw π/2): his right is −z; a stick pushing −z leans right
    wishInto({ move: { x: 0, y: -1 }, camYaw: 0 }, 0, out);
    expect(leanOf({ lean: 0 }, out, Math.PI / 2)).toBeCloseTo(1);
    expect(leanOf({ lean: -0.6 }, out, Math.PI / 2)).toBe(-0.6);      // the mapper's lean wins when it says something
  });
});
