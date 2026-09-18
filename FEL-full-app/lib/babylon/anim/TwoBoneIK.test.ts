import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import { applySolution, localAfterWorldDelta, solveTwoBone } from './TwoBoneIK';

const leg = () => ({ root: new Vector3(0, 0.95, 0), mid: new Vector3(0, 0.5, 0.02), end: new Vector3(0, 0.08, 0) });
const close = (a: Vector3, b: Vector3, tol = 1e-3) => expect(Vector3.Distance(a, b)).toBeLessThan(tol);

describe('solveTwoBone', () => {
  it('lands the ankle on an in-reach target and keeps both segment lengths', () => {
    const input = { ...leg(), target: new Vector3(0.05, 0.12, 0.18), pole: new Vector3(0, 0, 1) };   // 0.85 m away, leg is 0.87
    const s = solveTwoBone(input);
    const fk = applySolution(input, s);
    close(fk.end, input.target);
    expect(Vector3.Distance(fk.mid, input.root)).toBeCloseTo(Vector3.Distance(input.mid, input.root), 5);
    expect(Vector3.Distance(fk.end, fk.mid)).toBeCloseTo(Vector3.Distance(input.end, input.mid), 5);
    expect(s.reach).toBe(1);
  });
  it('bends the knee toward the pole', () => {
    const input = { ...leg(), target: new Vector3(0, 0.25, 0), pole: new Vector3(0, 0, 1) };
    const fk = applySolution(input, solveTwoBone(input));
    close(fk.end, input.target);
    expect(fk.mid.z).toBeGreaterThan(0.1);   // knee forward, not sideways or back
  });
  it('clamps an out-of-reach target along the aim line and reports it', () => {
    const input = { ...leg(), target: new Vector3(0, -0.6, 0.5) };
    const s = solveTwoBone(input);
    const fk = applySolution(input, s);
    expect(s.reach).toBeLessThan(1);
    const dir = input.target.subtract(input.root).normalize();
    const got = fk.end.subtract(input.root);
    expect(Vector3.Dot(got.normalizeToNew(), dir)).toBeGreaterThan(0.999);
    const L = Vector3.Distance(input.mid, input.root) + Vector3.Distance(input.end, input.mid);
    expect(got.length()).toBeCloseTo(L, 3);
  });
  it('is the identity when the ankle already sits on the target', () => {
    const l = leg();
    const s = solveTwoBone({ ...l, target: l.end.clone() });
    const fk = applySolution({ ...l, target: l.end.clone() }, s);
    close(fk.end, l.end);
    close(fk.mid, l.mid);
  });
  it('converts a world delta into the local rotation the node needs', () => {
    const parent = Quaternion.RotationAxis(Vector3.Up(), 0.7);
    const local = Quaternion.RotationAxis(Vector3.Right(), 0.3);
    const world = parent.multiply(local);   // Babylon: a.multiply(b) applies b first — local, then parent
    const delta = Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.4);
    const newLocal = localAfterWorldDelta(parent, world, delta);
    const worldAfter = parent.multiply(newLocal);
    const expected = delta.multiply(world);
    expect(Math.abs(Quaternion.Dot(worldAfter, expected))).toBeCloseTo(1, 6);
    // and the delta really is what a point sees: rotate by world then delta
    const v = new Vector3(0.2, 0.5, 0.1);
    const byNew = v.applyRotationQuaternionToRef(worldAfter, new Vector3());
    const bySteps = v.applyRotationQuaternionToRef(world, new Vector3()).applyRotationQuaternionToRef(delta, new Vector3());
    expect(Vector3.Distance(byNew, bySteps)).toBeLessThan(1e-6);
  });
});
