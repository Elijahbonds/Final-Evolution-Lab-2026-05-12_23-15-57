import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { shapeReach } from './HandIK';

const DEG = Math.PI / 180;
const ang = (a: Vector3, b: Vector3): number => Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(a.normalizeToNew(), b.normalizeToNew()))));

describe('shapeReach — a reach that never flips', () => {
  const sh = new Vector3(0, 1.4, 0), target = new Vector3(0, 1.4, -1.4), pole = new Vector3(0.7, -0.2, -0.5);
  it('leaves an arm already pointing at the target alone', () => {
    const el = new Vector3(0.2, 1.4, -0.25), hd = new Vector3(0.1, 1.4, -0.55);
    const r = shapeReach(sh, el, hd, target, pole);
    expect(Vector3.Distance(r.target, target)).toBeLessThan(1e-6);
  });
  it('caps the aim at 100° and fades it out toward 180°', () => {
    // the arm straight BACK (+z): 180° from the target → the shaped target sits on the arm's own line (no aim delta)
    const back = shapeReach(sh, new Vector3(0.05, 1.4, 0.25), new Vector3(0, 1.4, 0.55), target, pole);
    expect(ang(back.target.subtract(sh), new Vector3(0, 0, 0.55))).toBeLessThan(2 * DEG);
    // 160° off: inside the fade — a reduced aim, never the raw 160°
    const near = shapeReach(sh, new Vector3(0.05, 1.3, 0.25), new Vector3(0, 1.2, 0.55), target, pole, 100 * DEG, 90 * DEG, 120 * DEG, 140 * DEG);
    const nearAng = ang(near.target.subtract(sh), new Vector3(0, -0.2, 0.55));
    expect(nearAng).toBeGreaterThan(5 * DEG); expect(nearAng).toBeLessThan(60 * DEG);
    // the arm 120° off: the delta is capped at ~100° × the fade, never the raw 120°
    const dir = new Vector3(0, Math.sin(60 * DEG), Math.cos(60 * DEG));   // 120° from −z
    const off = shapeReach(sh, sh.add(dir.scale(0.28)), sh.add(dir.scale(0.55)), target, pole, 100 * DEG);
    expect(ang(off.target.subtract(sh), dir)).toBeLessThan(100 * DEG + 1e-6);
    expect(ang(off.target.subtract(sh), dir)).toBeGreaterThan(60 * DEG);
  });
  it('is continuous as the arm sweeps through the opposite direction (≤ 7° of target per 1° of arm)', () => {
    let prev: Vector3 | null = null, worst = 0;
    for (let d = 0; d <= 360; d += 1) {
      const a = d * DEG; const dir = new Vector3(Math.sin(a) * 0.3, Math.cos(a), -Math.sin(a) * 0.95).normalize();   // a loop through +z (behind)
      const r = shapeReach(sh, sh.add(dir.scale(0.28)).add(new Vector3(0.05, 0, 0)), sh.add(dir.scale(0.55)), target, pole);
      const t = r.target.subtract(sh).normalize();
      if (prev) worst = Math.max(worst, ang(prev, t));
      prev = t;
    }
    expect(worst).toBeLessThan(7 * DEG);
  });
  it('keeps the pole on the elbow\'s side when the elbow points away from it', () => {
    const el = new Vector3(-0.25, 1.35, -0.1), hd = new Vector3(0, 1.4, -0.5);   // elbow on the inside, the pole wants it outside
    const r = shapeReach(sh, el, hd, target, pole);
    const axis = r.target.subtract(sh).normalize();
    const elPerp = el.subtract(sh); elPerp.subtractInPlace(axis.scale(Vector3.Dot(elPerp, axis)));
    expect(ang(r.pole, elPerp)).toBeLessThan(90 * DEG + 1e-6);
  });
});
