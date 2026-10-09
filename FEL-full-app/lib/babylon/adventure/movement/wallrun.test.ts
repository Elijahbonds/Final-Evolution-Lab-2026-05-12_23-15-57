// The wall run (lane A1) on MatrixFocus's walls: taken only running INTO a wall at a sprint, it ends on time
// (WALL_RUN.sec), the kick goes out and up, and the pose is MatrixFocus's own arc at MatrixFocus's own speed.
import { describe, expect, it } from 'vitest';
import { WALL_RUN, startWallRunOn, wallRunOnAt } from '@/lib/babylon/core/MatrixFocus';
import type { WallSegment } from '../contracts';
import { createMovementSystem } from './index';
import { fakeWorld, makeActor, Runner } from './testkit';
import { wallPose, wallRunPose } from './wallrun';

/** A wall along z at x = 2, its face toward −x (where the runner is), 4 m tall. */
const WALL: WallSegment = { a: { x: 2, z: -5 }, b: { x: 2, z: 40 }, nx: -1, nz: 0, height: 4 };

function rig() {
  const world = fakeWorld({ walls: [WALL] });
  const sys = createMovementSystem();
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1', 'player', { pos: { x: 1, y: 0.8, z: 0 }, vel: { x: 4, y: 1, z: 9 }, grounded: false, state: 'air' }));
  return { world, sys, r, p, inp: r.input('p1') };
}

describe('wall run', () => {
  it('jump into a wall at a sprint: on the wall, along it, for WALL_RUN.sec, then off its end into the air', () => {
    const { r, p } = rig();
    r.press('p1', 'jump'); r.tick();
    expect(p.state).toBe('wallrun');
    const startZ = p.pos.z;
    let t = 0;
    r.runUntil(() => p.state !== 'wallrun', 2, () => { t += r.dt; });
    expect(t).toBeGreaterThanOrEqual(WALL_RUN.sec - 2 * r.dt);
    expect(t).toBeLessThanOrEqual(WALL_RUN.sec + r.dt);
    expect(p.state).toBe('air');
    expect(p.pos.z - startZ).toBeGreaterThan(WALL_RUN.speed * WALL_RUN.sec);   // it kept the run's speed, not 5.6
    expect(p.pos.x).toBeCloseTo(2 - WALL_RUN.inset, 6);                          // on the face
    expect(p.vel.z).toBeGreaterThan(9);
  });

  it('the kick goes out from the wall and up, with the air dash back', () => {
    const { r, p } = rig();
    r.press('p1', 'jump'); r.tick(15);
    r.press('p1', 'jump'); r.tick();
    expect(p.state).toBe('air');
    expect(p.vel.x).toBeLessThan(-5);
    expect(p.vel.y).toBeGreaterThan(8);
  });

  it('too slow, or running along rather than into it: no wall run', () => {
    const slow = rig(); slow.p.vel = { x: 1.5, y: 1, z: 3 };
    slow.r.press('p1', 'jump'); slow.r.tick();
    expect(slow.p.state).toBe('air');
    const along = rig(); along.p.vel = { x: 0.5, y: 1, z: 9 };
    along.r.press('p1', 'jump'); along.r.tick();
    expect(along.p.state).toBe('air');
  });

  it('the pose is MatrixFocus.wallRunOnAt at its own speed', () => {
    const run = startWallRunOn({ wall: WALL, s: 6 }, { x: 0.3, z: 1 });
    const out = wallPose();
    for (const t of [0, 0.1, 0.4, 0.8, 0.95, 1.2]) {
      const ref = wallRunOnAt(run, t);
      wallRunPose(run, WALL_RUN.speed, t, 0, out);
      expect(out.x).toBeCloseTo(ref.x, 9); expect(out.y).toBeCloseTo(ref.y, 9); expect(out.z).toBeCloseTo(ref.z, 9);
      expect(out.yaw).toBeCloseTo(ref.yaw, 9); expect(out.done).toBe(ref.done);
    }
  });
});
