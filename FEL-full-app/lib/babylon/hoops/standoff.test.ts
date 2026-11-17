// hoops-p06 (1v1 / 3v3 phase 7 "bodies that touch": "one standoff constant read by the physics, the rules and the drawing (a test)").
// BODY_STANDOFF (1.10 m) is the one gap: the 1v1 Havok capsules are half of it each, the kinematic separation and 3v3's pair loop push to
// it, and the rules that ask "are the bodies on each other" read it. Measured on the rig (seed 7, PRO, nine runs, 1v1 and 3v3, both ends):
// 0 frames with two roots under 0.6 m, the closest pair 1.02 m.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BODY_STANDOFF, resolveBodyCollision } from '../core/BasketballCore';
import { ONEVONE_CAPSULE_RADIUS, BODY_HARD_GAP, separateBodies } from '../core/BodySeparation';
import { Vector3 } from '@babylonjs/core';

describe('one standoff', () => {
  it('the 1v1 capsules are half of it each; the hard gap sits under it', () => {
    expect(ONEVONE_CAPSULE_RADIUS * 2).toBeCloseTo(BODY_STANDOFF, 9);
    expect(BODY_HARD_GAP).toBeLessThan(BODY_STANDOFF);
    expect(BODY_HARD_GAP).toBeGreaterThan(0.6);   // the overlap read's floor: a body at the hard gap is never "inside" another
  });
  it('the kinematic push and the separation both stop at it', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(0.5, 0, 0);
    resolveBodyCollision(a, b);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(BODY_STANDOFF, 9);
    expect(separateBodies(new Vector3(0, 0, 0), new Vector3(BODY_STANDOFF + 0.001, 0, 0), 1 / 60).touching).toBe(false);
    expect(separateBodies(new Vector3(0, 0, 0), new Vector3(BODY_STANDOFF - 0.05, 0, 0), 1 / 60).touching).toBe(true);
  });
  it('the modes read it, never a literal: 3v3\'s pair loop, both charge ranges, the on-him reads', () => {
    const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
    const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
    expect(three).toMatch(/resolveBodyContact\([^;]*BODY_STANDOFF \/ 2,/);
    expect(three).not.toMatch(/B\.vel, 0\.55,/);
    for (const src of [one, three]) {
      expect(src).toMatch(/const CHARGE_RANGE = BODY_STANDOFF \+ 0\.5;/);
      expect(src).toMatch(/BODY_STANDOFF \+ 0\.25/);
    }
    expect(readFileSync('lib/babylon/core/BasketballCore.ts', 'utf8')).toMatch(/resolveBodyCollision\(a: Vector3, b: Vector3, radius = BODY_STANDOFF \/ 2\)/);
  });
});
