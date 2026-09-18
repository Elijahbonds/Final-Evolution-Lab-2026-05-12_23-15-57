// Does Focus behave like a meter you spend, and does the wall take you where a wall should?
import { describe, it, expect } from 'vitest';
import { FOCUS, FocusMeter, WALL_RUN, wallRunAvailable, startWallRun, wallRunAt, startWallKick, wallKickAt, kickHits } from './MatrixFocus';

describe('FocusMeter — bullet time you hold', () => {
  it('slows the room, not the hero, while held; drains; refuses to start on an empty meter', () => {
    const f = new FocusMeter();
    expect(f.start()).toBe(true);
    expect(f.worldScale).toBe(FOCUS.worldScale);
    expect(f.heroScale).toBe(FOCUS.heroScale);
    let dry = false; let t = 0;
    while (!dry && t < 10) { dry = f.tick(1 / 60); t += 1 / 60; }
    expect(dry).toBe(true);
    expect(t).toBeCloseTo(FOCUS.max / FOCUS.drainPerSec, 1);
    expect(f.active).toBe(false);
    expect(f.worldScale).toBe(1);
    expect(f.start()).toBe(false);   // nothing left to spend
  });
  it('refills only after the regen delay, and what you land refills it faster', () => {
    const f = new FocusMeter(); f.start(); f.stop(); f.value = 10;   // a hold just ended
    f.tick(0.5); expect(f.value).toBe(10);           // still inside the delay
    f.tick(1.0); expect(f.value).toBeGreaterThan(10);
    const before = f.value; f.gain(FOCUS.dodgeGain); expect(f.value).toBeCloseTo(Math.min(FOCUS.max, before + FOCUS.dodgeGain), 6);
  });
  it('letting go stops the drain at once', () => {
    const f = new FocusMeter(); f.start(); f.tick(0.5); const v = f.value; f.stop(); f.tick(0.3); expect(f.value).toBe(v);
  });
});

describe('the wall run on a round arena', () => {
  const R = 7.5;
  it('is available only near the edge and only running INTO it', () => {
    expect(wallRunAvailable({ x: 0, z: 6.5 }, { x: 0, z: 1 }, R)).toBe(true);
    expect(wallRunAvailable({ x: 0, z: 6.5 }, { x: 0, z: -1 }, R)).toBe(false);   // running away from the wall
    expect(wallRunAvailable({ x: 0, z: 3 }, { x: 0, z: 1 }, R)).toBe(false);      // too far inside
    expect(wallRunAvailable({ x: 0, z: 6.5 }, { x: 1, z: 0 }, R)).toBe(false);    // along the wall, not into it
  });
  it('rides the edge, climbs and comes back down, and travels the way the run leaned', () => {
    const s = startWallRun({ x: 0, z: 6.5 }, { x: 0.6, z: 1 });
    const p0 = wallRunAt(s, R, 0), pm = wallRunAt(s, R, WALL_RUN.sec / 2), p1 = wallRunAt(s, R, WALL_RUN.sec);
    expect(Math.hypot(p0.x, p0.z)).toBeCloseTo(R - WALL_RUN.inset, 5);
    expect(Math.hypot(p1.x, p1.z)).toBeCloseTo(R - WALL_RUN.inset, 5);
    expect(pm.y).toBeGreaterThan(0.5);
    expect(p0.y).toBeLessThan(0.05); expect(p1.y).toBeLessThan(0.05);
    expect(p1.x).toBeGreaterThan(p0.x + 1);   // leaned +x → travelled +x around the ring
    expect(p1.done).toBe(true);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(WALL_RUN.speed * WALL_RUN.sec * 0.9);
  });
  it('the kick off the wall flies at its target and drops the bodies on its path once each', () => {
    const k = startWallKick({ x: 0, z: 7 }, { x: 0, z: 2 });
    expect(k.dz).toBeLessThan(0);
    const a = wallKickAt(k, 0, 1.0), b = wallKickAt(k, WALL_RUN.kickSec, 1.0);
    expect(b.z).toBeLessThan(a.z - 3);
    expect(b.y).toBe(0);
    const bodies = [{ x: 0.3, z: 5 }, { x: 3, z: 5 }, { x: -0.2, z: 3.5 }];
    const hits = kickHits({ x: a.x, z: a.z }, { x: b.x, z: b.z }, bodies, WALL_RUN.kickHitM, k.hit);
    expect(hits).toEqual([0, 2]);
    for (const i of hits) k.hit.add(i);
    expect(kickHits({ x: a.x, z: a.z }, { x: b.x, z: b.z }, bodies, WALL_RUN.kickHitM, k.hit)).toEqual([]);
  });
  it('with no target the kick goes back through the middle of the ring', () => {
    const k = startWallKick({ x: 5, z: 5 }, null);
    expect(k.dx).toBeLessThan(0); expect(k.dz).toBeLessThan(0);
  });
});
