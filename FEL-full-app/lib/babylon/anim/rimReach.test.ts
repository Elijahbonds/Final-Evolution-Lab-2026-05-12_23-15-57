import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { rimApproachAim, rimReachWeight, REACH_SWING_RATE_DEG } from './rimReach';
import { reachElbowPole, elbowBackDir } from './HandIK';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('rimReach — the hand onto the iron on a game dunk', () => {
  const rim = new Vector3(0, 3.05, 0), R = 0.225, ballR = 0.12;
  it('a ball short of the ring and under its plane aims over the FRONT lip first, then straight in', () => {
    const out = new Vector3();
    rimApproachAim({ x: 0, y: 2.9, z: 0.33 }, rim, R, ballR, out);
    expect(out.z).toBeGreaterThan(R);                 // out past the front of the ring
    expect(out.y).toBeGreaterThan(rim.y);             // and above its plane
    rimApproachAim({ x: 0, y: 3.2, z: 0.1 }, rim, R, ballR, out);
    expect(out.x).toBe(0); expect(out.z).toBe(0);     // over the plane: the centre
    expect(out.y).toBeCloseTo(rim.y + ballR + 0.02, 5);
    rimApproachAim(null, rim, R, ballR, out);
    expect(out.z).toBe(0);
  });
  it('the weight is off early, on through the flush and the hang, off once the body drops, never on a swat', () => {
    const rk = 0.55;
    expect(rimReachWeight(0.1, rk, false)).toBe(0);
    expect(rimReachWeight(rk, rk, false)).toBe(1);
    expect(rimReachWeight(0.62, rk, false)).toBe(1);   // the rim hang parks the clock here
    expect(rimReachWeight(0.9, rk, false)).toBe(0);
    expect(rimReachWeight(rk, rk, true)).toBe(0);
    let prev = 0; for (let k = 0; k <= 1; k += 0.01) { const w = rimReachWeight(k, rk, false); expect(Math.abs(w - prev)).toBeLessThan(0.12); prev = w; }   // smooth
  });
  // HOOPS MOTION phase 3c (S26): the elbow's side came from the bone's NAME, turned by the root — on the mirrored runtime rig the arm named
  // Right draws on the body's LEFT, so its "outside" pole pointed across the chest
  it('the reach\'s elbow points out of the arm\'s OWN side and where an overhead elbow can — never across the chest, never back behind the ball', () => {
    const front = new Vector3(0, 0, -1), up = Vector3.Up();   // a body facing −z (the 1v1 hero at the check)
    const right = Vector3.Cross(up, front).normalize();        // the body's right in world
    // the ball arm is drawn on the body's RIGHT whatever its bone is called: its shoulder is on the right of the other one
    const sh = new Vector3(0, 1.45, 0).add(right.scale(0.18)), other = new Vector3(0, 1.45, 0).add(right.scale(-0.18));
    for (const target of [sh.add(new Vector3(0, 0.6, 0)).add(front.scale(0.35)), sh.add(new Vector3(0, 0.45, 0)).add(front.scale(0.1)), sh.add(new Vector3(0, -0.1, 0)).add(front.scale(0.5))]) {
      const pole = reachElbowPole(sh, other, target, front, up);
      const u = target.subtract(sh).normalize(), pp = pole.subtract(u.scale(Vector3.Dot(pole, u))).normalize();
      expect(Vector3.Dot(pp, right), 'out of its own side').toBeGreaterThan(-0.05);   // never toward the other shoulder
      const back = elbowBackDir(sh, target, up, front);
      if (back.sagittal >= 0.35) expect(Vector3.Dot(pp, back.dir), 'the anatomical half').toBeGreaterThanOrEqual(0.2 - 1e-6);
      // the probe's wrong-way test for a hand over the shoulder: the elbow's direction forward component not < −0.5 with it high
      if (target.y - sh.y > 0.15) expect(Vector3.Dot(pp, front)).toBeGreaterThan(-0.5);
    }
    // the same geometry named the other way round (the mirrored rig): the pole follows the SHOULDERS, not the name
    const a = reachElbowPole(sh, other, sh.add(new Vector3(0, 0.6, 0)), front), b = reachElbowPole(other, sh, other.add(new Vector3(0, 0.6, 0)), front);
    expect(Vector3.Dot(a, right)).toBeGreaterThan(0); expect(Vector3.Dot(b, right)).toBeLessThan(0);
  });
  it('the reach limits the elbow\'s swing and no longer reads the side off the bone name (source)', () => {
    const src = readFileSync(path.join(__dirname, 'rimReach.ts'), 'utf8');
    expect(src).not.toMatch(/side === 'Left' \? -0\.7 : 0\.7/);
    expect(src).toMatch(/const pole = reachElbowPole\(/);
    expect(src).toMatch(/limitElbowSwing\(arm, [^\n]*REACH_SWING_RATE_DEG\)/);
    expect(REACH_SWING_RATE_DEG).toBe(720);
  });
});
