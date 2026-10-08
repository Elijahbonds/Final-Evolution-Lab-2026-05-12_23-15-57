// The homing dash (lane A1): it locks to the nearest valid target in the cone, ignores one behind a wall, out of
// range or behind you, prefers the lock, and chains three in a row off the bounce.
import { describe, expect, it } from 'vitest';
import type { AdventureActor } from '../contracts';
import { createMovementSystem } from './index';
import { DEFAULT_MOVEMENT } from './params';
import { homingReason, pickHomingTarget } from './homing';
import { fakeWorld, makeActor, Runner, type Blocker, type FakeWorldOpts } from './testkit';

const h = DEFAULT_MOVEMENT.homing;

function rig(w: FakeWorldOpts = {}) {
  const world = fakeWorld(w);
  const sys = createMovementSystem();
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1', 'player', { pos: { x: 0, y: 2, z: 0 }, grounded: false, state: 'air' }));
  return { world, sys, r, p, inp: r.input('p1') };
}
const mob = (id: string, x: number, y: number, z: number): AdventureActor =>
  makeActor(id, 'monster', { pos: { x, y, z }, height: 1.2 });

describe('homing: who is a target', () => {
  it('locks to the NEAREST valid target inside the cone', () => {
    const { world, p } = rig();
    world.add(mob('far', 0, 2, 8));
    world.add(mob('near', 1.5, 2, 5));
    world.add(mob('behind', 0, 2, -3));          // nearest of all, but behind
    world.add(mob('wide', 4, 2, 1));             // inside 9 m, 76° off the axis
    expect(pickHomingTarget(p, world, h)?.id).toBe('near');
    expect(homingReason(p, world.actors.get('behind')!, 0, world, h)).toBe('cone');
    expect(homingReason(p, world.actors.get('wide')!, 0, world, h)).toBe('cone');
  });

  it('ignores a target behind a wall (line of sight), out of range, on your team, or down', () => {
    const wall: Blocker = { min: { x: -2, y: 0, z: 3 }, max: { x: 2, y: 6, z: 3.5 } };
    const { world, p } = rig({ blockers: [wall] });
    world.add(mob('walled', 0, 2, 5));
    world.add(mob('distant', 0, 2, 12));
    world.add(makeActor('friend', 'partner', { pos: { x: 0.5, y: 2, z: 2 } }));
    const ko = world.add(mob('ko', -0.5, 2, 2.5)); ko.stats.hp.cur = 0;
    expect(pickHomingTarget(p, world, h)).toBeNull();
    expect(homingReason(p, world.actors.get('walled')!, 0, world, h)).toBe('blocked');
    expect(homingReason(p, world.actors.get('distant')!, 0, world, h)).toBe('far');
    expect(homingReason(p, world.actors.get('friend')!, 0, world, h)).toBe('team');
    expect(homingReason(p, ko, 0, world, h)).toBe('down');
    world.add(mob('clear', 5, 2, 7));            // round the wall's end
    expect(pickHomingTarget(p, world, h)?.id).toBe('clear');
  });

  it('the cone follows the run, not just the facing', () => {
    const { world, p } = rig();
    world.add(mob('right', 6, 2, 0));
    p.facingYaw = 0;
    expect(pickHomingTarget(p, world, h)).toBeNull();
    p.vel.x = 8;                                  // running toward +x
    expect(pickHomingTarget(p, world, h)?.id).toBe('right');
  });

  it('a hard lock wins even outside the cone', () => {
    const { world, p } = rig();
    world.add(mob('ahead', 0, 2, 4));
    world.add(mob('locked', -5, 2, 0));
    p.lock = { actorId: 'locked', sinceSec: 0, hard: true };
    expect(pickHomingTarget(p, world, h)?.id).toBe('locked');
  });
});

describe('homing: the dash', () => {
  it('snaps at 22 m/s, hits, bounces up, and emits one homing event', () => {
    const { world, r, p, sys } = rig();
    world.add(mob('m1', 0, 2, 6));
    r.press('p1', 'jump'); r.tick();
    expect(sys.inspect('p1')?.homingTargetId).toBe('m1');
    expect(Math.hypot(p.vel.x, p.vel.y, p.vel.z)).toBeCloseTo(h.speed, 3);
    r.runUntil(() => r.of('homing').length > 0, 1);
    expect(r.of('homing')).toEqual([{ actorId: 'p1', targetId: 'm1', hit: true }]);
    expect(p.vel.y).toBeCloseTo(h.bounceUp, 3);
    expect(p.vel.z).toBeLessThan(0);              // bounced back a little
  });

  it('chains three targets off the bounces', () => {
    const { world, r, p, inp } = rig();
    world.add(mob('a', 0, 2, 5));
    world.add(mob('b', 0, 3.5, 9));
    world.add(mob('c', 0, 4.5, 13));
    inp.move.y = 1;
    for (let i = 0; i < 3; i++) {
      r.press('p1', 'jump');
      r.runUntil(() => r.of('homing').length > i, 1.5);
      // the bounce takes us up; drift forward a little toward the next one
      r.tick(6);
    }
    expect(r.of('homing').map((e) => [e.targetId, e.hit])).toEqual([['a', true], ['b', true], ['c', true]]);
    expect(p.state).toBe('air');
  });

  it('a target that moves away out of reach is a miss after the dash time', () => {
    const { world, r } = rig();
    const m = world.add(mob('runner', 0, 2, 7));
    r.press('p1', 'jump');
    r.runUntil(() => r.of('homing').length > 0, 2, () => { m.pos.z += 0.5; });
    expect(r.of('homing')).toEqual([{ actorId: 'p1', targetId: 'runner', hit: false }]);
  });
});
