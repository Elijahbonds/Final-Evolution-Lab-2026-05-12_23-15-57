// The spin jump and the air (lane A1): the apex, the short hop, the two forgivenesses (coyote, buffer), the air dash.
import { describe, expect, it } from 'vitest';
import { createMovementSystem } from './index';
import { DEFAULT_MOVEMENT } from './params';
import { jumpApex } from './air';
import { fakeWorld, makeActor, Runner, type FakeWorldOpts } from './testkit';

function rig(w: FakeWorldOpts = {}) {
  const world = fakeWorld(w);
  const sys = createMovementSystem();
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1'));
  return { world, sys, r, p, inp: r.input('p1') };
}
const air = DEFAULT_MOVEMENT.air;

describe('air: the spin jump', () => {
  it('a held jump peaks at v²/2g (about 2.2 m), spinning, and lands back on the ground', () => {
    const { r, p, sys, inp } = rig();
    r.press('p1', 'jump'); inp.jumpHeld = true;
    let apex = 0;
    r.tick();
    expect(p.state).toBe('air');
    expect(sys.inspect('p1')?.spinning).toBe(true);
    r.runUntil(() => p.state === 'ground', 3, () => { apex = Math.max(apex, p.pos.y); });
    expect(apex).toBeCloseTo(jumpApex(air.jumpSpeed, air.gravity), 1);
    expect(apex).toBeGreaterThan(2);
    expect(apex).toBeLessThan(2.4);
    expect(p.state).toBe('ground');
    expect(sys.inspect('p1')?.spinning).toBe(false);
  });

  it('a tap is a short hop (the release cuts the rise)', () => {
    const { r, p, inp } = rig();
    r.press('p1', 'jump'); inp.jumpHeld = true;
    r.tick(3);
    inp.jumpHeld = false;
    let apex = 0;
    r.runUntil(() => p.state === 'ground', 3, () => { apex = Math.max(apex, p.pos.y); });
    expect(apex).toBeLessThan(jumpApex(air.jumpSpeed, air.gravity) * 0.5);
  });

  it('keeps the run\'s speed through the jump and the landing', () => {
    const { r, p, inp } = rig();
    inp.move.y = 1; r.run(1.5);
    const before = Math.hypot(p.vel.x, p.vel.z);
    r.press('p1', 'jump'); inp.jumpHeld = true;
    r.runUntil(() => p.state === 'ground', 3);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(before - 0.01);
  });

  it('coyote time: a jump a beat after running off a ledge still jumps', () => {
    const { r, p, inp } = rig({ ground: (_x, z) => (z < 2 ? 3 : 0) });
    p.pos.y = 3; inp.move.y = 1;
    r.runUntil(() => p.state === 'air', 2);
    r.tick(3);                                   // 50 ms after leaving
    r.press('p1', 'jump'); inp.jumpHeld = true;
    r.tick();
    expect(p.vel.y).toBeGreaterThan(air.jumpSpeed * 0.9);
  });

  it('the buffer: a jump pressed just before touchdown jumps on landing', () => {
    const { r, p, inp } = rig();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(10);
    r.press('p1', 'dash'); r.tick();               // the air dash is spent: a press now has nothing to do in the air
    r.runUntil(() => p.vel.y < 0 && p.pos.y < 0.4, 3);
    expect(p.state).toBe('air');
    r.press('p1', 'jump');
    r.tick();
    expect(p.state).toBe('air');
    r.runUntil(() => p.vel.y > 5, 0.3);
    expect(p.vel.y).toBeGreaterThan(5);
  });
});

describe('air: the air dash', () => {
  it('bursts forward once per airtime, and the ground gives it back', () => {
    const { r, p, sys, inp } = rig();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(10);
    r.press('p1', 'dash'); r.tick();
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(air.airDashSpeed - 0.5);
    expect(sys.inspect('p1')?.airDashing).toBe(true);
    r.tick(20);
    const vz = p.vel.z;
    r.press('p1', 'dash'); r.tick();
    expect(p.vel.z).toBeLessThanOrEqual(vz + 1e-9);      // the second is refused
    r.runUntil(() => p.state === 'ground', 3);
    r.press('p1', 'jump'); r.tick(5);
    r.press('p1', 'dash'); r.tick();
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(air.airDashSpeed - 0.5);
  });

  it('jump again in the air with nothing to home on is the same dash', () => {
    const { r, p, inp } = rig();
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(10);
    r.press('p1', 'jump'); r.tick();
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(air.airDashSpeed - 0.5);
  });
});
