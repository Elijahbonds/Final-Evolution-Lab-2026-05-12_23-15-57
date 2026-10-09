// Rail grinding (lane A1): the catch (generous, but only inside its window), the lean (with the curve +3, against it
// −4 and the needle), the tuck, the slope, switches (at the switch point only), jumping between rails, tricks, chained
// rails, the end of the line and a hit. Plus the catch's parity with core/RailMagnet, which it was ported from.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { qualifyRail as magnetQualify } from '@/lib/babylon/core/RailMagnet';
import type { RailNetwork, RailSegment, Vec3 } from '../contracts';
import { mulberry32 } from '../movement/math';
import { createMovementSystem } from '../movement/index';
import { DEFAULT_MOVEMENT } from '../movement/params';
import { fakeWorld, makeActor, Runner } from '../movement/testkit';
import { qualifyRail, qualifyRailPath, railCatch, switchAt } from './grind';
import { buildRailPath } from './railMath';

const rp = DEFAULT_MOVEMENT.rail;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const seg = (id: string, points: Vec3[], extra: Partial<RailSegment> = {}): RailSegment =>
  ({ id, points, speedBias: 0, switches: [], ...extra });

/** Two parallel rails 3 m apart, 1.2 m up, 40 m long; a switch from a to b (rightward going +z) at 20 m. */
function parallel(): RailNetwork {
  return {
    id: 'pair',
    segments: [
      seg('a', [v(0, 1.2, 0), v(0, 1.2, 40)], { switches: [{ atM: 20, windowM: 1.5, side: 1, toSegment: 'b', toAtM: 20 }] }),
      seg('b', [v(3, 1.2, 0), v(3, 1.2, 40)]),
    ],
  };
}

function rig(net: RailNetwork, over: Parameters<typeof createMovementSystem>[0] = {}) {
  const world = fakeWorld({ rails: net });
  const sys = createMovementSystem(over);
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1'));
  return { world, sys, r, p, inp: r.input('p1') };
}

/** Put the player on rail `id` at `s` going +s at `speed`, by dropping it onto the rail. */
function placeOnRail(x: ReturnType<typeof rig>, at: Vec3, speed: number, yaw = 0) {
  x.p.pos = { ...at, y: at.y + 0.2 };
  x.p.vel = { x: Math.sin(yaw) * speed, y: -1, z: Math.cos(yaw) * speed };
  x.p.facingYaw = yaw; x.p.grounded = false; x.p.state = 'air';
  x.r.tick();
  expect(x.p.state).toBe('grind');
}

describe('grind: the catch is RailMagnet\'s, ported', () => {
  it('agrees with core/RailMagnet.qualifyRail on 2,000 random cases', () => {
    const rnd = mulberry32(2026);
    const rv = (s: number) => v((rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s);
    for (let i = 0; i < 2000; i++) {
      const a = rv(10), b = rv(10), feet = rv(10), run = rv(10);
      const w = { reach: rnd() * 3, align: rnd(), endBand: rnd() * 0.2, heightSlack: rnd() };
      const mine = qualifyRail(a, b, feet, run, w);
      const V = (p: Vec3) => new Vector3(p.x, p.y, p.z);
      const theirs = magnetQualify(V(a), V(b), V(feet), V(run), w);
      expect(mine.ok).toBe(theirs.ok);
      if (!mine.ok && !theirs.ok) expect(mine.why).toBe(theirs.why);
      expect(mine.t).toBeCloseTo(theirs.t, 9);
    }
  });

  it('catches only inside the window, and says why not', () => {
    const path = buildRailPath(seg('r', [v(0, 1, 0), v(0, 1, 20)]));
    const out = railCatch();
    const why = (feet: Vec3, vel: Vec3) => qualifyRailPath(path, feet, vel, 0, rp, out);
    expect(why(v(0, 1.1, 10), v(0, -2, 9))).toBe('ok');
    expect(why(v(1.2, 0.9, 10), v(0, -2, 9))).toBe('ok');          // generous: 1.2 m off to the side still catches
    expect(why(v(2.0, 1.1, 10), v(0, -2, 9))).toBe('far');
    expect(why(v(0, 1.1, 19.9), v(0, -2, 9))).toBe('end');         // the last few centimetres do not catch
    expect(why(v(0, 0.3, 10), v(0, -2, 9))).toBe('above');         // you land on a rail, never rise onto one
    expect(why(v(0, 1.1, 10), v(9, -2, 0))).toBe('across');        // crossing a rail still crosses it
    expect(why(v(0, 1.1, 10), v(0, 0, 0))).toBe('still');          // standing on it is not grinding it
    expect(why(v(0, 1.1, 10), v(0, 5, 9))).toBe('rising');         // rising past it on a jump does not catch
    expect(why(v(0, 1.1, 10), v(0, -6, 0))).toBe('ok');            // a drop straight onto it does (read along the facing)
    expect(out.dir).toBe(1);
  });

  it('a rail that chains on at an end catches right up to the join', () => {
    const net: RailNetwork = { id: 'n', segments: [seg('r', [v(0, 1, 0), v(0, 1, 20)], { next: 's' }), seg('s', [v(0, 1, 20), v(0, 1, 40)], { prev: 'r' })] };
    const path = buildRailPath(net.segments[0]);
    expect(qualifyRailPath(path, v(0, 1.1, 19.9), v(0, -2, 9), 0, rp, railCatch())).toBe('ok');
  });
});

describe('grind: a rail catch from a jump', () => {
  it('run, jump, land on the rail: grinding with no button, at the run\'s speed', () => {
    const net: RailNetwork = { id: 'one', segments: [seg('r', [v(0, 1.2, 9), v(0, 1.2, 45)])] };
    const x = rig(net);
    x.inp.move.y = 1;
    x.r.run(1.2);                                          // up to the run speed, still short of the rail
    expect(x.p.pos.z).toBeLessThan(9);
    x.r.press('p1', 'jump'); x.inp.jumpHeld = true;
    expect(x.r.runUntil(() => x.p.state === 'grind', 2)).toBe(true);
    const enter = x.r.of('rail:enter');
    expect(enter).toHaveLength(1);
    expect(enter[0].segmentId).toBe('r');
    expect(enter[0].speed).toBeGreaterThan(8);
    expect(x.p.rail?.dir).toBe(1);
    expect(x.p.pos.y).toBeCloseTo(1.2, 6);
    expect(x.p.pos.x).toBeCloseTo(0, 6);                   // snapped onto the bar
    x.inp.move.y = 0; x.inp.jumpHeld = false;
    x.r.run(0.5);
    expect(x.p.state).toBe('grind');
  });

  it('runs off the end of the line into the air, along the rail', () => {
    const x = rig({ id: 'one', segments: [seg('r', [v(0, 1.2, 0), v(0, 1.2, 10)])] });
    placeOnRail(x, v(0, 1.2, 5), 12);
    x.r.runUntil(() => x.p.state !== 'grind', 2);
    expect(x.r.of('rail:exit')).toEqual([{ actorId: 'p1', segmentId: 'r', reason: 'end' }]);
    expect(x.p.state).toBe('air');
    expect(x.p.vel.z).toBeGreaterThan(9);
  });

  it('chains onto the next rail at an end without leaving', () => {
    const x = rig({ id: 'chain', segments: [
      seg('r', [v(0, 1.2, 0), v(0, 1.2, 10)], { next: 's' }),
      seg('s', [v(5, 1.2, 15), v(0, 1.2, 10)], { prev: null }),     // authored backwards: its END meets r's end
    ] });
    placeOnRail(x, v(0, 1.2, 5), 12);
    x.r.run(0.8);
    expect(x.p.state).toBe('grind');
    expect(x.p.rail?.segmentId).toBe('s');
    expect(x.p.rail?.dir).toBe(-1);
    expect(x.p.pos.x).toBeGreaterThan(0.5);
    expect(x.r.of('rail:exit')).toHaveLength(0);
  });
});

describe('grind: speed — the slope, the lean, the tuck', () => {
  /** A right-hand bend of radius 12 m (a quarter circle), 1 m up. */
  const bend = (): RailNetwork => {
    const pts: Vec3[] = [v(0, 1, -10)];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * (Math.PI / 2); pts.push(v(12 - 12 * Math.cos(a), 1, 12 * Math.sin(a))); }
    pts.push(v(22, 1, 12));
    return { id: 'bend', segments: [seg('c', pts)] };
  };
  const rideBend = (lean: number) => {
    const x = rig(bend(), { params: { rail: { balanceWander: 0 } } });
    placeOnRail(x, v(0, 1, -2), 12);
    x.inp.lean = lean;
    let s0 = 0;
    x.r.runUntil(() => (x.p.rail?.sM ?? 99) > 10.5 || x.p.state !== 'grind', 2);
    s0 = x.p.rail?.speed ?? 0;
    x.r.runUntil(() => (x.p.rail?.sM ?? 99) > 26 || x.p.state !== 'grind', 3);
    return { speedIn: s0, speedOut: x.p.rail?.speed ?? 0, state: x.p.state, needle: x.sys.inspect('p1')!.rail.needle, x };
  };

  it('leaning WITH the curve gains and holds the balance; AGAINST it loses and tips toward the edge', () => {
    const none = rideBend(0), withC = rideBend(1), against = rideBend(-1);
    expect(withC.state).toBe('grind');
    expect(withC.speedOut - withC.speedIn).toBeGreaterThan((none.speedOut - none.speedIn) + 1.5);
    expect(withC.speedOut).toBeLessThanOrEqual(rp.topSpeed);
    // against: slower than hands-off, and either off the rail or with the needle further over
    expect(against.speedOut === 0 || against.speedOut < none.speedOut - 1.5).toBe(true);
    expect(against.state !== 'grind' || Math.abs(against.needle) > Math.abs(withC.needle)).toBe(true);
    // the lean's sign reads off the rider's right whichever way the camera looks (stick, not the mapper's lean)
    const x = rig(bend(), { params: { rail: { balanceWander: 0 } } });
    placeOnRail(x, v(0, 1, -2), 12);
    x.inp.camYaw = Math.PI; x.inp.move.x = -1;            // camera looking back at the rider: screen-left is his right
    x.r.runUntil(() => (x.p.rail?.sM ?? 99) > 12, 2);
    expect(x.sys.inspect('p1')!.rail.lean).toBeGreaterThan(0.9);
  });

  it('a hands-off curve tips you off; a straight is calm', () => {
    const tight: RailNetwork = { id: 't', segments: [seg('t', (() => {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 1.5; pts.push(v(5 - 5 * Math.cos(a), 1, 5 * Math.sin(a))); }
      return pts;
    })())] };
    const x = rig(tight, { params: { rail: { balanceWander: 0 } } });
    placeOnRail(x, v(0, 1, 0.3), 16);
    x.r.runUntil(() => x.p.state !== 'grind', 3);
    expect(x.r.of('rail:exit').map((e) => e.reason)).toContain('fall');
    const s = rig({ id: 's', segments: [seg('s', [v(0, 1, 0), v(0, 1, 200)])] });
    placeOnRail(s, v(0, 1, 2), 12);
    s.r.run(5);
    expect(s.p.state).toBe('grind');
  });

  it('on a straight, a tuck gains; downhill gains on its own; uphill slows and slides back', () => {
    const flat = () => rig({ id: 's', segments: [seg('s', [v(0, 1, 0), v(0, 1, 200)])] });
    const a = flat(); placeOnRail(a, v(0, 1, 2), 10); a.r.run(2);
    const b = flat(); placeOnRail(b, v(0, 1, 2), 10); b.inp.move.y = 1; b.r.run(2);
    expect(b.p.rail!.speed - a.p.rail!.speed).toBeCloseTo(rp.tuckAccel * 2, 0);
    const down = rig({ id: 'd', segments: [seg('d', [v(0, 20, 0), v(0, 0, 100)])] });
    placeOnRail(down, v(0, 19.6, 2), 10); down.r.run(2);
    expect(down.p.rail!.speed).toBeGreaterThan(12);
    const up = rig({ id: 'u', segments: [seg('u', [v(0, 0, 0), v(0, 30, 60)])] });
    placeOnRail(up, v(0, 0.4, 0.8), 6);
    up.r.runUntil(() => up.p.rail?.dir === -1 || up.p.state !== 'grind', 4);
    expect(up.p.rail?.dir === -1 || up.p.state === 'air').toBe(true);
  });

  it('the rail top speed holds (24 m/s)', () => {
    const x = rig({ id: 'd', segments: [seg('d', [v(0, 200, 0), v(0, 0, 400)])] });
    placeOnRail(x, v(0, 199.6, 0.8), 20);
    x.r.run(6);
    expect(x.p.rail!.speed).toBeCloseTo(rp.topSpeed, 6);
  });
});

describe('grind: switching and hopping between rails', () => {
  it('lean + jump at the switch point hops to the parallel rail', () => {
    const x = rig(parallel());
    placeOnRail(x, v(0, 1.2, 4), 12);
    x.r.runUntil(() => x.p.rail!.sM >= 19, 3);
    x.inp.lean = 1;
    x.r.press('p1', 'jump');
    x.r.tick();
    expect(x.r.of('rail:switch')).toEqual([{ actorId: 'p1', from: 'a', to: 'b' }]);
    expect(x.p.rail?.segmentId).toBe('b');
    expect(x.sys.inspect('p1')!.rail.switching).toBe(true);
    x.inp.lean = 0;
    x.r.run(0.4);
    expect(x.p.state).toBe('grind');
    expect(x.p.pos.x).toBeCloseTo(3, 6);
    expect(x.r.of('rail:exit')).toHaveLength(0);
  });

  it('a switch outside its window does nothing (no switch; the press is an ordinary jump off)', () => {
    const x = rig(parallel());
    placeOnRail(x, v(0, 1.2, 2), 12);
    x.r.runUntil(() => x.p.rail!.sM >= 10, 2);
    expect(switchAt(parallel().segments[0], 10, 1)).toBeNull();
    x.inp.lean = 1;
    x.r.press('p1', 'jump');
    x.r.tick();
    expect(x.r.of('rail:switch')).toHaveLength(0);
    expect(x.r.of('rail:exit').map((e) => e.reason)).toEqual(['jump']);
  });

  it('leaning the wrong way at the switch point does not switch', () => {
    const x = rig(parallel());
    placeOnRail(x, v(0, 1.2, 4), 12);
    x.r.runUntil(() => x.p.rail!.sM >= 19.5, 3);
    x.inp.lean = -1;
    x.r.press('p1', 'jump'); x.r.tick();
    expect(x.r.of('rail:switch')).toHaveLength(0);
  });

  it('a lean-jump anywhere carries you onto the next rail by the catch (jumping between rails)', () => {
    const x = rig(parallel());
    placeOnRail(x, v(0, 1.2, 2), 12);
    x.r.tick(20);
    x.inp.lean = 1; x.inp.jumpHeld = true;
    x.r.press('p1', 'jump');
    x.r.tick();
    x.inp.lean = 0;
    expect(x.r.runUntil(() => x.p.state === 'grind', 2)).toBe(true);
    expect(x.p.rail?.segmentId).toBe('b');
    expect(x.r.of('rail:enter').map((e) => e.segmentId)).toEqual(['a', 'b']);
  });
});

describe('grind: tricks and hits', () => {
  it('attack on a rail is a trick that pays points (more chained), once per trick window', () => {
    const x = rig({ id: 's', segments: [seg('s', [v(0, 1, 0), v(0, 1, 200)])] });
    placeOnRail(x, v(0, 1, 2), 12);
    x.r.press('p1', 'attackLight'); x.r.tick();
    x.r.press('p1', 'attackHeavy'); x.r.tick();             // inside the first trick: ignored
    x.r.run(0.5);
    x.r.press('p1', 'attackHeavy'); x.r.tick();
    const tricks = x.r.of('rail:trick');
    expect(tricks.map((t) => t.trick)).toEqual(['rail-spin', 'rail-flip']);
    expect(tricks[0].points).toBeGreaterThan(100);
    expect(tricks[1].points).toBeGreaterThan(tricks[0].points);
    expect(x.sys.inspect('p1')!.rail.trickChain).toBe(2);
  });

  it('a knock (A2\'s impulse) throws you off the rail', () => {
    const x = rig({ id: 's', segments: [seg('s', [v(0, 1, 0), v(0, 1, 200)])] });
    placeOnRail(x, v(0, 1, 2), 12);
    x.p.impulse = { x: 5, y: 4, z: 0 };
    x.r.tick();
    expect(x.r.of('rail:exit').map((e) => e.reason)).toEqual(['hit']);
    expect(x.p.impulse).toBeNull();
    expect(x.p.state).toBe('air');
  });
});
