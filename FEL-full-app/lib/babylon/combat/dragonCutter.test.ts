import { describe, expect, it } from 'vitest';
import { DRAGON_CUT, dragonCutSec } from './fightShots';
import { DragonCutter, MAX_WAIT_SEC } from './dragonCutter';

const LIVE = { pos: { x: 0, y: 2, z: 7 }, target: { x: 0, y: 1, z: 0 }, fov: 0.8 };
const A = { x: 0, z: 2.2 }, B = { x: 0, z: -2.2 };
/** Steps for `sec`; returns the first terminal verdict ('done' / 'aborted') if the cut ended, else the last. */
const run = (c: DragonCutter, sec: number, dt = 1 / 60): string => { let r = 'run'; for (let t = 0; t < sec; t += dt) { const x = c.step(dt); if (x === 'done' || x === 'aborted') return x; r = x; } return r; };

describe('the DRAGON cutter', () => {
  it('holds the windup frame until the blow lands, then plays the impact and ends: the blow\'s time, not the guess, starts the impact beat', () => {
    const c = new DragonCutter(); c.start(0.5, 1);
    run(c, 0.9);                                                   // far past the windup, no blow yet
    expect(c.active).toBe(true);
    const held = c.frame(A, B, LIVE).shot;
    expect(held).not.toBe('play');
    if (held !== 'play') expect(held.pos.y).toBeLessThan(1);       // still the low windup angle
    c.blow();
    expect(c.landed).toBe(true);
    const hit = c.frame(A, B, LIVE).shot;
    if (hit !== 'play') expect(Math.abs(hit.pos.x)).toBeGreaterThan(4.5);   // the profile
    expect(run(c, DRAGON_CUT.impactSec + DRAGON_CUT.outSec + 0.1)).toBe('done');
    expect(c.active).toBe(false);
    expect(c.frame(A, B, LIVE).shot).toBe('play');
  });
  it('a blow that never comes ends the cut aborted after MAX_WAIT_SEC (the caller eases the rig out)', () => {
    const c = new DragonCutter(); c.start(0.4, -1);
    expect(run(c, 0.4 + MAX_WAIT_SEC + 0.3)).toBe('aborted');
    expect(c.active).toBe(false);
  });
  it('abort() ends it at the next step', () => {
    const c = new DragonCutter(); c.start(0.4, 1);
    run(c, 0.1); c.abort();
    expect(c.step(1 / 60)).toBe('aborted'); expect(c.active).toBe(false);
  });
  it('the rival\'s cut is impactOnly: it starts on the profile and runs only impact + out', () => {
    const c = new DragonCutter(); c.start(0, 1, true);
    const s = c.frame(B, A, LIVE).shot;
    if (s !== 'play') expect(Math.abs(s.pos.x)).toBeGreaterThan(4.5);
    expect(run(c, dragonCutSec({ windupSec: 0, impactOnly: true }) + 0.1)).toBe('done');
  });
  it('a hit-stop (dt 0) freezes it; a huge dt is capped (a hitch cannot skip the beats)', () => {
    const c = new DragonCutter(); c.start(0.6, 1);
    for (let i = 0; i < 60; i++) c.step(0);
    expect(c.elapsed).toBe(0);
    c.step(5);
    expect(c.elapsed).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('idle: stepping and framing do nothing', () => {
    const c = new DragonCutter();
    expect(c.step(0.016)).toBe('idle');
    expect(c.frame(A, B, LIVE).shot).toBe('play');
  });
});
