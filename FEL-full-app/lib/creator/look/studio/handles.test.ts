// CREATOR-PLAN phase 4d: the on-model handles' maths — rotate about the line of sight, scale keeping the squash, the knobs.
import { describe, expect, it } from 'vitest';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { dragRatio, hitKnob, knobLayout, rotatePart, scalePart, sweptAngle, viewAxisInRoot } from './handles';
import { partMatrix } from '../../../babylon/creator/parts/placement';
import { RANGES, type Vec3 } from '../doc';

const ID = { m: Matrix.Identity().m };
const part = (o: Partial<{ pos: Vec3; rot: Vec3; scale: Vec3 }> = {}) => ({ pos: [0.1, 0.2, 0.05] as Vec3, rot: [0, 0, 0] as Vec3, scale: [1, 2, 1] as Vec3, ...o });
/** The part's world matrix through a frame, as placement does it. */
const placed = (p: ReturnType<typeof part>, F: Matrix) => partMatrix(p).multiply(F);

describe('screen maths', () => {
  it('the swept angle is signed, clockwise on screen positive (y down)', () => {
    const c = { x: 0, y: 0 };
    expect(sweptAngle(c, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6);
    expect(sweptAngle(c, { x: 10, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(-90, 6);
    expect(sweptAngle(c, { x: -10, y: 1 }, { x: -10, y: -1 })).toBeCloseTo(11.42, 1);   // across the ±180 seam: the short way
    expect(sweptAngle(c, { x: -10, y: -1 }, { x: -10, y: 1 })).toBeCloseTo(-11.42, 1);  // …both ways round
  });
  it('the drag ratio, and a jitter near the centre is ignored', () => {
    expect(dragRatio({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 })).toBeCloseTo(2, 6);
    expect(dragRatio({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 40, y: 0 })).toBe(1);
  });
  it('the knobs sit round the centre and are grabbed within reach, move first', () => {
    const L = knobLayout({ x: 100, y: 100 }, 10);
    expect(L.ring).toBe(44);
    expect(hitKnob({ x: 100, y: 100 }, L)).toBe('move');
    expect(hitKnob({ x: 144, y: 100 }, L)).toBe('rotate');
    expect(hitKnob({ x: 131, y: 131 }, L)).toBe('scale');
    expect(hitKnob({ x: 300, y: 300 }, L)).toBeNull();
    expect(knobLayout({ x: 0, y: 0 }, 500).ring).toBe(120);
  });
});

describe('scale', () => {
  it('keeps the squash and clamps without distorting', () => {
    expect(scalePart(part(), 1.5)).toEqual([1.5, 3, 1.5]);
    const big = scalePart(part({ scale: [1, 4, 1] }), 10);
    expect(big[1]).toBeCloseTo(RANGES.partScale[1], 6);
    expect(big[0] / big[1]).toBeCloseTo(0.25, 6);
    const small = scalePart(part({ scale: [0.1, 0.2, 0.1] }), 0.01);
    expect(small[0]).toBeCloseTo(RANGES.partScale[0], 6);
    expect(scalePart(part(), NaN)).toEqual([1, 2, 1]);
  });
});

describe('rotate about the line of sight', () => {
  it('turns the placed part by exactly that rotation about its own centre (identity frame)', () => {
    const p = part({ rot: [10, 20, 30] });
    const r = rotatePart(p, ID, [0, 0, 1], 45);
    const before = placed(p, Matrix.Identity()), after = placed({ ...p, ...r }, Matrix.Identity());
    // same centre, and after = before · R(z, 45°) about it
    expect(after.getTranslation().subtract(before.getTranslation()).length()).toBeLessThan(1e-3);
    const R = Matrix.RotationAxis(new Vector3(0, 0, 1), Math.PI / 4);
    const want = before.getRotationMatrix().multiply(R);
    const got = after.getRotationMatrix();
    for (let i = 0; i < 16; i++) expect(got.m[i]).toBeCloseTo(want.m[i], 3);
  });
  it('on a reflected (right-side) frame the turn is still a proper rotation and lands where asked', () => {
    const F = Matrix.Scaling(-1, 1, 1).multiply(Matrix.RotationY(0.7)).multiply(Matrix.Translation(0.3, 1.2, 0));
    const p = part({ rot: [0, 15, 0] });
    const axis: Vec3 = [0, 1, 0];
    const r = rotatePart(p, F, axis, 30);
    const before = placed(p, F), after = placed({ ...p, ...r }, F);
    const c = before.getTranslation();
    expect(after.getTranslation().subtract(c).length()).toBeLessThan(1e-3);
    const R = Matrix.RotationAxis(new Vector3(...axis), (30 * Math.PI) / 180);
    const want = before.multiply(Matrix.Translation(-c.x, -c.y, -c.z)).multiply(R).multiply(Matrix.Translation(c.x, c.y, c.z));
    for (let i = 0; i < 16; i++) expect(after.m[i]).toBeCloseTo(want.m[i], 3);
  });
  it('the scale never changes, a zero axis or NaN changes nothing, angles stay in range', () => {
    const p = part({ rot: [170, -170, 175] });
    const r = rotatePart(p, ID, [1, 1, 0], 90);
    for (const a of r.rot) { expect(a).toBeGreaterThanOrEqual(-180); expect(a).toBeLessThanOrEqual(180); }
    expect(rotatePart(p, ID, [0, 0, 0], 30)).toEqual({ rot: p.rot, pos: p.pos });
    expect(rotatePart(p, ID, [0, 0, 1], NaN)).toEqual({ rot: p.rot, pos: p.pos });
  });
  it('the line of sight in root space undoes the root turn', () => {
    const root = Matrix.RotationY(Math.PI / 2);
    const v = viewAxisInRoot([0, 0, 1], root);
    const q = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
    const back = Vector3.TransformNormal(new Vector3(...v), Matrix.FromQuaternionToRef(q, new Matrix()));
    expect(back.x).toBeCloseTo(0, 6); expect(back.z).toBeCloseTo(1, 6);
  });
});
