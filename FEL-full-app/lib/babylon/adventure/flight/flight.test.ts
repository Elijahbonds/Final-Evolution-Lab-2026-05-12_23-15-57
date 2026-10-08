// Flight (lane A1): the gate (fused or on a flyer, never on foot), free flight (hover, move, ascend, descend, the
// dash and its cost), the forced glide at zero energy, the ceiling, and cruise — banked turns to 60°, the boom, and a
// long cruise that never leaves the world's bounds.
import { describe, expect, it } from 'vitest';
import { NO_FUSION, type FusionState } from '../contracts';
import { createMovementSystem, type MovementSystemOptions } from '../movement/index';
import { fakeWorld, makeActor, Runner } from '../movement/testkit';
import { mulberry32 } from '../movement/math';
import { canTakeOff, flightSourceOf, flightSpeedMult } from './gate';
import { DEFAULT_FLIGHT, DEFAULT_FLIGHT_EXTRA } from './params';
import { boundSteer } from './cruise';

const F = DEFAULT_FLIGHT, X = DEFAULT_FLIGHT_EXTRA;
const fused = (tier: FusionState['tier'] = 1): FusionState =>
  ({ active: true, tier, meter: 1, remainingSec: 30, partnerId: 'x', element: 'wind', grantsFlight: true });

function rig(opts: MovementSystemOptions = {}, fusion: FusionState = fused(0)) {
  const world = fakeWorld();
  const sys = createMovementSystem(opts);
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1', 'player', { fusion }));
  return { world, sys, r, p, inp: r.input('p1') };
}
/** Jump, then jump again in the air: the take-off. */
function takeOff(r: Runner, inp: ReturnType<Runner['input']>) {
  r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
  r.press('p1', 'jump'); r.tick();
  inp.jumpHeld = false;
}

describe('flight: the gate', () => {
  it('flight is refused unfused and on foot — the second jump is an air dash, never a take-off', () => {
    const { r, p, inp } = rig({ mountCanFly: true }, { ...NO_FUSION });
    expect(canTakeOff(p, true)).toBeNull();               // a flying mount means nothing without riding one
    takeOff(r, inp);
    r.run(2, () => { inp.ascendHeld = true; });
    expect(r.of('state').some((e) => e.to === 'flight')).toBe(false);
    expect(p.wantsFlight).toBe(false);
    expect(p.state).toBe('ground');
  });

  it('a fusion that does not grant flight does not fly either; one that does, does', () => {
    const p = makeActor('p');
    expect(flightSourceOf({ ...p, fusion: { ...fused(), grantsFlight: false } }, false)).toBeNull();
    expect(canTakeOff({ ...p, fusion: fused() }, false)).toBe('fusion');
    expect(canTakeOff({ ...p, fusion: fused(), stunSec: 1 }, false)).toBeNull();
    expect(flightSpeedMult('fusion', 3, 1, X)).toBeCloseTo(1 + 3 * X.tierSpeed);
    expect(flightSpeedMult('mount', 3, 0.95, X)).toBeCloseTo(0.95);
  });
});

describe('flight: bodies that already want it, and bodies that fly by nature', () => {
  it('a fused body restored with wantsFlight (a save, a net handover) is flying on its first step', () => {
    const { r, p } = rig();
    p.pos.y = 6; p.grounded = false; p.state = 'air'; p.wantsFlight = true;
    r.tick();
    expect(p.state).toBe('flight');
    p.fusion = { ...NO_FUSION }; p.wantsFlight = true; r.tick();
    expect(p.state).toBe('air');                          // no source: the wish is not enough
  });

  it('an innate flyer (A2\'s flying monster) spawned on the wing hovers at no cost; a player can never be one', () => {
    const world = fakeWorld();
    const sys = createMovementSystem({ innateFlyer: (a) => a.kind === 'monster' || a.kind === 'player' });
    const r = new Runner(world, [sys]);
    const m = world.add(makeActor('bat', 'monster', { pos: { x: 0, y: 5, z: 0 }, grounded: false, state: 'air', wantsFlight: true }));
    const p = world.add(makeActor('p1', 'player', { pos: { x: 3, y: 5, z: 0 }, grounded: false, state: 'air', wantsFlight: true }));
    r.run(3);
    expect(m.state).toBe('flight');
    expect(m.pos.y).toBeGreaterThan(4);
    expect(m.stats.energy.cur).toBe(100);
    expect(p.state).toBe('ground');                        // the player fell: no fusion, no mount
  });
});

describe('flight: free flight', () => {
  it('fused: jump, jump again — airborne in free flight; hands off, you hover in place', () => {
    const { r, p, sys, inp } = rig();
    takeOff(r, inp);
    expect(p.state).toBe('flight');
    expect(sys.inspect('p1')!.flight.mode).toBe('free');
    r.run(1.5);
    const y = p.pos.y;
    r.run(2);
    expect(Math.abs(p.pos.y - y)).toBeLessThan(0.05);
    expect(Math.hypot(p.vel.x, p.vel.y, p.vel.z)).toBeLessThan(0.05);
    expect(p.state).toBe('flight');
  });

  it('moves camera-relative at 14 m/s (faster per fusion tier), ascends at 8, descends at 10', () => {
    const { r, p, inp } = rig({}, fused(0));
    takeOff(r, inp); r.run(1);
    inp.move.y = 1; inp.camYaw = Math.PI / 2; r.run(2);
    expect(p.vel.x).toBeCloseTo(F.freeSpeed, 1);
    inp.move.y = 0; inp.ascendHeld = true; r.run(2);
    expect(p.vel.y).toBeCloseTo(F.ascendSpeed, 1);
    inp.ascendHeld = false; inp.descendHeld = true; r.run(1);
    expect(p.vel.y).toBeCloseTo(-F.descendSpeed, 1);
    const t3 = rig({}, fused(3));
    takeOff(t3.r, t3.inp); t3.inp.move.y = 1; t3.r.run(2);
    expect(Math.hypot(t3.p.vel.x, t3.p.vel.z)).toBeCloseTo(F.freeSpeed * (1 + 3 * X.tierSpeed), 1);
  });

  it('flight costs energy: 4/s hovering, 10 a dash, and the dash is a 30 m/s burst for 0.35 s', () => {
    const { r, p, sys, inp } = rig();
    takeOff(r, inp);
    const e0 = p.stats.energy.cur;
    r.run(2);
    expect(e0 - p.stats.energy.cur).toBeCloseTo(F.drainPerSec.free * 2, 0);
    const e1 = p.stats.energy.cur;
    inp.move.y = 1;
    r.press('p1', 'dash'); r.tick();
    expect(e1 - p.stats.energy.cur).toBeCloseTo(F.dashCost, 0);
    expect(Math.hypot(p.vel.x, p.vel.y, p.vel.z)).toBeCloseTo(F.dashSpeed, 3);
    expect(sys.inspect('p1')!.flight.dashing).toBe(true);
    r.run(F.dashSec);
    expect(sys.inspect('p1')!.flight.dashing).toBe(false);
  });

  it('at zero energy you glide down (no climb, no dash) and land', () => {
    const { r, p, sys, inp } = rig();
    takeOff(r, inp);
    inp.ascendHeld = true; r.run(2); inp.ascendHeld = false;
    const top = p.pos.y;
    p.stats.energy.cur = 0.01;
    r.tick(2);
    expect(sys.inspect('p1')!.flight.glide).toBe(true);
    inp.ascendHeld = true;
    r.press('p1', 'dash'); r.run(1);
    expect(p.pos.y).toBeLessThan(top);
    expect(p.vel.y).toBeCloseTo(-X.glideSink, 1);
    expect(sys.inspect('p1')!.flight.dashing).toBe(false);
    expect(r.runUntil(() => p.state === 'ground', 20)).toBe(true);
    expect(p.wantsFlight).toBe(false);
  });

  it('the ceiling holds', () => {
    const { r, p, inp } = rig({ flight: { ceilingY: 20 } });
    takeOff(r, inp);
    inp.ascendHeld = true;
    let maxY = 0;
    r.run(6, () => { maxY = Math.max(maxY, p.pos.y); });
    expect(maxY).toBeLessThanOrEqual(20 + 1e-9);
    expect(p.pos.y).toBeCloseTo(20, 6);
  });
});

describe('flight: cruise', () => {
  const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };

  it('hold the dash past 18 m/s: cruise, building to 40 m/s, booming once', () => {
    const { r, p, sys, inp } = rig({ bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 } });
    takeOff(r, inp);
    inp.ascendHeld = true; r.run(1); inp.ascendHeld = false;
    inp.move.y = 1; inp.dashHeld = true;
    r.press('p1', 'dash'); r.run(F.dashSec + 0.05);
    expect(sys.inspect('p1')!.flight.mode).toBe('cruise');
    inp.move.y = 0;
    r.run(5);
    expect(sys.inspect('p1')!.speed).toBeCloseTo(F.cruiseSpeed, 0);
    expect(sys.inspect('p1')!.flight.boomAtSec).not.toBeNull();
    const boom = sys.inspect('p1')!.flight.boomAtSec;
    r.run(2);
    expect(sys.inspect('p1')!.flight.boomAtSec).toBe(boom);          // once per cruise
    const e = p.stats.energy.cur;
    r.run(1);
    expect(e - p.stats.energy.cur).toBeCloseTo(F.drainPerSec.cruise, 0);
    expect(r.hints.some((h) => h.preset === 'cruise' && (h.fovBoost ?? 0) > 15)).toBe(true);
    inp.dashHeld = false; r.tick();
    expect(sys.inspect('p1')!.flight.mode).toBe('free');
  });

  it('turns by banking: the stick banks up to 60° and the heading follows the bank', () => {
    const { r, p, sys, inp } = rig({ bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 } });
    takeOff(r, inp);
    inp.ascendHeld = true; r.run(1); inp.ascendHeld = false;
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash'); r.run(0.5);
    inp.move.y = 0; inp.move.x = 1;
    const h0 = p.facingYaw;
    let maxBank = 0;
    r.run(1.5, () => { maxBank = Math.max(maxBank, Math.abs(sys.inspect('p1')!.flight.bank)); });
    expect(sys.inspect('p1')!.flight.bank).toBeGreaterThan(0.9);         // right wing down
    expect(maxBank).toBeLessThanOrEqual(F.cruiseBankMaxRad + 1e-9);
    expect(p.facingYaw - h0).toBeGreaterThan(1);                          // turned right
    inp.move.x = 0; r.run(1.5);
    expect(Math.abs(sys.inspect('p1')!.flight.bank)).toBeLessThan(0.05);   // levels out
  });

  it('a long cruise straight at the edge of the world banks back in and never leaves the bounds', () => {
    const { r, p, sys, inp } = rig({ bounds });
    p.stats.energy.max = 1000; p.stats.energy.cur = 1000;   // 30 s of cruise at 8/s
    takeOff(r, inp);
    inp.ascendHeld = true; r.run(1); inp.ascendHeld = false;
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash'); r.run(0.5);
    inp.move.y = 0;
    let maxBank = 0, out = 0;
    r.run(30, () => {
      const t = sys.inspect('p1')!;
      maxBank = Math.max(maxBank, Math.abs(t.flight.bank));
      if (p.pos.x < bounds.minX || p.pos.x > bounds.maxX || p.pos.z < bounds.minZ || p.pos.z > bounds.maxZ) out++;
      expect(t.flight.mode).toBe('cruise');
    });
    expect(out).toBe(0);
    expect(maxBank).toBeGreaterThan(0.5);                                  // it banked to turn back
    expect(p.pos.y).toBeLessThanOrEqual(F.ceilingY);
  });

  it('thirty seconds of random cruising: inside the box, under the ceiling, over the ground, no NaN', () => {
    const { r, p, inp } = rig({ bounds, flight: { ceilingY: 60 } }, fused(3));
    p.stats.energy.max = 1000; p.stats.energy.cur = 1000;
    takeOff(r, inp);
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash'); r.run(0.5);
    const rnd = mulberry32(77);
    r.run(30, (t) => {
      if (Math.round(t * 60) % 30 === 0) {
        inp.move.x = rnd() * 2 - 1; inp.ascendHeld = rnd() < 0.3; inp.descendHeld = !inp.ascendHeld && rnd() < 0.3;
      }
      expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z)).toBe(true);
      expect(p.pos.x).toBeGreaterThanOrEqual(bounds.minX); expect(p.pos.x).toBeLessThanOrEqual(bounds.maxX);
      expect(p.pos.z).toBeGreaterThanOrEqual(bounds.minZ); expect(p.pos.z).toBeLessThanOrEqual(bounds.maxZ);
      expect(p.pos.y).toBeLessThanOrEqual(60); expect(p.pos.y).toBeGreaterThanOrEqual(0);
    });
  });

  it('boundSteer: zero in the middle, back toward the centre near a side', () => {
    expect(boundSteer(0, 0, 0, bounds, 24)).toBe(0);
    expect(boundSteer(0, 140, 0, bounds, 24)).not.toBe(0);                 // heading +z at the +z side
    expect(boundSteer(0, 140, Math.PI, bounds, 24)).toBe(0);               // heading back in: leave it be
    expect(boundSteer(0, 140, 0, null, 24)).toBe(0);
  });
});
