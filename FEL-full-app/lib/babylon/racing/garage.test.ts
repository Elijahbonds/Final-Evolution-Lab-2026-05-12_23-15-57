// THE GARAGE HAS NO BEST CAR (2026-09-13).
//
// Owner's call on vehicles was "handling, with honest trade-offs", and the only version of that promise worth
// having is one a test holds. A picker offering four karts where one of them is simply better is a picker
// with one kart in it and three pieces of decoration, and nobody would ever find that out from reading the
// numbers — you find it out six months later when the telemetry says everyone drives the same thing.
//
// So: dominance is checked as a PROPERTY, over every pair, on the spec fields that actually reach the
// handling models. A future tune that makes one vehicle strictly better fails here.

import { describe, it, expect } from 'vitest';
import { KARTS, PLANES, solvedDrag, readyVehicles, vehiclesFor, type Kart, type Plane } from './garage';
import { KART_STARTER, spawnKart, stepKart } from '../core/KartModel';
import { Vector3 } from '@babylonjs/core';
import { AERO_TRAINER } from '../core/FlightModel';

/** Spec fields where MORE is better, per model. Drag is excluded: it is solved, not chosen. */
const KART_GOOD_UP = ['vMax', 'accel', 'brake', 'steerRate', 'grip', 'slipRecover', 'driftCharge', 'boostSpeed', 'boostSec', 'offTrack'] as const;
const KART_GOOD_DOWN = ['scrub'] as const;
const PLANE_GOOD_UP = ['cruise', 'vMax', 'thrust', 'pitchRate', 'rollRate', 'turnFromBank', 'yawRate'] as const;
const PLANE_GOOD_DOWN = ['vStall', 'turnDrag'] as const;

function dominates(
  a: Record<string, number>, b: Record<string, number>,
  up: readonly string[], down: readonly string[],
): boolean {
  let strictlyBetterSomewhere = false;
  for (const k of up) {
    if (a[k] < b[k]) return false;
    if (a[k] > b[k]) strictlyBetterSomewhere = true;
  }
  for (const k of down) {
    if (a[k] > b[k]) return false;
    if (a[k] < b[k]) strictlyBetterSomewhere = true;
  }
  return strictlyBetterSomewhere;
}

describe('NO VEHICLE IS STRICTLY BETTER THAN ANOTHER', () => {
  it('no kart dominates another kart', () => {
    const bad: string[] = [];
    for (const a of KARTS) for (const b of KARTS) {
      if (a === b) continue;
      if (dominates(a.spec as unknown as Record<string, number>, b.spec as unknown as Record<string, number>, KART_GOOD_UP, KART_GOOD_DOWN)) {
        bad.push(`${a.id} dominates ${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no aircraft dominates another aircraft', () => {
    const bad: string[] = [];
    for (const a of PLANES) for (const b of PLANES) {
      if (a === b) continue;
      if (dominates(a.spec as unknown as Record<string, number>, b.spec as unknown as Record<string, number>, PLANE_GOOD_UP, PLANE_GOOD_DOWN)) {
        bad.push(`${a.id} dominates ${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('and the picker BARS agree with the specs — a bar that lies is worse than no bar', () => {
    // the fastest bar belongs to the highest vMax, the best hold to the most grip, the best edge to the most
    // boost banked per second of drift. If a tune moves a spec and nobody moves the bar, this says so.
    const top = <T,>(list: readonly T[], of: (t: T) => number) => list.reduce((a, b) => (of(b) > of(a) ? b : a));
    expect(top(KARTS, (k) => k.bars.speed).id).toBe(top(KARTS, (k) => k.spec.vMax).id);
    expect(top(KARTS, (k) => k.bars.hold).id).toBe(top(KARTS, (k) => k.spec.grip).id);
    expect(top(KARTS, (k) => k.bars.edge).id).toBe(top(KARTS, (k) => k.spec.driftCharge).id);
    expect(top(PLANES, (p) => p.bars.speed).id).toBe(top(PLANES, (p) => p.spec.vMax).id);
    expect(top(PLANES, (p) => p.bars.edge).id).toBe(top(PLANES, (p) => p.spec.turnFromBank).id);
  });
});

describe('every vehicle is still a working vehicle', () => {
  it('each kart actually accelerates and reaches a sane speed', () => {
    for (const k of KARTS) {
      const s = spawnKart(Vector3.Zero(), 0);
      for (let i = 0; i < 600; i++) stepKart(s, { steer: 0, throttle: 1, brake: 0, drift: false, fire: false }, 1 / 60, true, k.spec);
      // within 5% of its own top speed after ten seconds flat out
      expect(s.speed, k.id).toBeGreaterThan(k.spec.vMax * 0.95);
      expect(Number.isFinite(s.speed), k.id).toBe(true);
    }
  });

  it('THE TIGHTEST CORNER EACH KART CAN HOLD IS SMALLER THAN THE TRACK ASKS FOR', () => {
    // v²/a is the radius a kart can hold on grip alone at its top speed. The boardwalk loop was scaled so a
    // corner CAN be held — that is what makes drifting a decision rather than a thing that happens to you.
    // Every kart must be able to hold SOMETHING, or its low-grip pick is just "you cannot steer".
    for (const k of KARTS) {
      const holdable = (k.spec.vMax * k.spec.vMax) / k.spec.grip;
      expect(holdable, `${k.id} holdable radius`).toBeLessThan(140);
    }
  });

  it('drag is solved for every airframe, so "cruise" means what it says', () => {
    for (const p of PLANES) {
      // 2% relative, not absolute decimals: AERO_TRAINER ships the solved figure ROUNDED to 0.0054, and a
      // test that fails on the shipped value is a test about rounding rather than about the model. Two per
      // cent still catches the failure this exists for — a drag typed by hand and wrong by a factor.
      const want = solvedDrag(p.spec.thrust, p.spec.cruise);
      expect(Math.abs(p.spec.drag - want) / want, p.id).toBeLessThan(0.02);
      // and the full-throttle equilibrium must sit at or below the ceiling, which is the bug that solving fixes
      expect(Math.sqrt(p.spec.thrust / p.spec.drag), p.id).toBeLessThanOrEqual(p.spec.vMax * 1.02);
    }
  });

  it('no airframe stalls at a speed it cannot comfortably exceed', () => {
    for (const p of PLANES) expect(p.spec.cruise / p.spec.vStall, p.id).toBeGreaterThan(1.6);
  });
});

describe('the garage as the picker sees it', () => {
  it('offers more than one of each, all ready, with unique ids and names', () => {
    for (const kind of ['kart', 'aero'] as const) {
      const list = readyVehicles(kind);
      expect(list.length, kind).toBeGreaterThan(1);
      expect(new Set(list.map((v) => v.id)).size, kind).toBe(list.length);
      expect(new Set(list.map((v) => v.name)).size, kind).toBe(list.length);
      // every sub names a COST — a pick with no downside is not a choice
      for (const v of list) expect(v.sub.length, `${kind}/${v.id}`).toBeGreaterThan(12);
    }
  });

  it('the first vehicle of each kind is the one the modes already shipped', () => {
    // so a player who never opens the picker gets exactly the handling that was tuned and tested
    expect((vehiclesFor('kart')[0] as Kart).spec).toBe(KART_STARTER);
    expect((vehiclesFor('aero')[0] as Plane).spec).toBe(AERO_TRAINER);
  });
});
