// HOOPS MOTION phase 3 — the one visual-side helper: the athlete's right as drawn, the side away from X, and the rig hand that
// renders on a side, read off the rig (never assumed from a bone's name).
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { athleteRight, lateralOf, otherSide, readRigHandOnRight, rigHandOnRight, rigHandOnSide, RIG_HAND_ON_RIGHT, sideAwayFrom, sideOfPoint, sideOfRigHand, sideOfVector } from './athleteSide';
import { bodyRight, pickHookSide, pickLayupSide, reverseSide } from '../core/HoopsMoves';
import { bodySide } from '../core/BasketballCore';

/** A root with two shoulders; `mirrored`: the rig's LEFT arm on the root's +x (the runtime rig after the import's mirror reset). */
function body(scene: Scene, mirrored: boolean, yaw = 0) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
  const sk = new Skeleton('sk', 'sk', scene);
  for (const [name, x] of [['LeftArm', mirrored ? 0.18 : -0.18], ['RightArm', mirrored ? -0.18 : 0.18]] as const) {
    const n = new TransformNode(name, scene); n.parent = root; n.position.set(x, 1.45, 0);
    new Bone(name, sk, null, Matrix.Identity()).linkTransformNode(n);
  }
  return { root, sk };
}

describe('athleteSide', () => {
  it('the athlete\'s right is the root\'s +x turned by the yaw (the pickers\' old bodyRight, unchanged)', () => {
    for (const yaw of [0, 0.7, Math.PI, -2.1]) {
      const r = athleteRight(yaw), b = bodyRight(yaw);
      expect(r.x).toBeCloseTo(b.x, 9); expect(r.z).toBeCloseTo(b.z, 9);
      expect(r.x).toBeCloseTo(Math.cos(yaw), 9); expect(r.z).toBeCloseTo(-Math.sin(yaw), 9);
    }
  });
  it('sides of a point and of a vector, and the side away from X', () => {
    // facing the rim (yaw π, looking down −z): the athlete's right is world −x
    const me = new Vector3(0, 0, 6);
    expect(sideOfPoint(me, Math.PI, new Vector3(-1, 0, 6))).toBe('right');
    expect(sideOfPoint(me, Math.PI, new Vector3(1, 0, 6))).toBe('left');
    expect(sideAwayFrom(me, Math.PI, new Vector3(-1, 0, 5))).toBe('left');
    expect(lateralOf(me, Math.PI, new Vector3(-0.5, 0, 6))).toBeCloseTo(0.5, 9);
    expect(sideOfVector(Math.PI, { x: -3, z: 0 })).toBe('right');
    expect(otherSide('right')).toBe('left');
  });
  it('the rig hand drawn on the right is READ off the rig: rig LeftHand on the mirrored runtime rig, RightHand on an unmirrored one', () => {
    const scene = new Scene(new NullEngine());
    const m = body(scene, true), u = body(scene, false);
    expect(readRigHandOnRight(m.sk, m.root)).toBe('LeftHand');
    expect(readRigHandOnRight(u.sk, u.root)).toBe('RightHand');
    expect(rigHandOnSide(m.sk, m.root, 'right')).toBe('LeftHand');
    expect(rigHandOnSide(m.sk, m.root, 'left')).toBe('RightHand');
    expect(sideOfRigHand(m.sk, m.root, 'LeftHand')).toBe('right');
    // a body read while turned still answers in its own frame
    const t = body(scene, true, 2.4);
    expect(readRigHandOnRight(t.sk, t.root)).toBe('LeftHand');
  });
  it('the read is cached on the skeleton (a spin later never re-reads it), and a stub rig falls back to the runtime answer', () => {
    const scene = new Scene(new NullEngine());
    const m = body(scene, true);
    expect(rigHandOnRight(m.sk, m.root)).toBe('LeftHand');
    m.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // arms swapped sides in the WORLD — not in the body
    for (const b of m.sk.bones) b.getTransformNode()!.position.x *= -1;           // …even a corrupted pose later does not flip it
    expect(rigHandOnRight(m.sk, m.root)).toBe('LeftHand');
    expect(rigHandOnRight({} as Skeleton, {} as TransformNode)).toBe(RIG_HAND_ON_RIGHT);
  });
});

describe('the side pickers go through athleteSide', () => {
  const rim = new Vector3(0, 0, -0.6);
  it('a layup from the athlete\'s right of the rim finishes right; a defender on the strong side in close sends it away from him', () => {
    // facing the rim from (-1.5, 0, 1.5) at yaw π: the athlete's right is −x, and he is on the rim's −x side = his right
    const at = new Vector3(-1.5, 0, 1.5);
    expect(pickLayupSide(at, rim, Math.PI, null)).toBe('right');
    expect(pickLayupSide(new Vector3(1.5, 0, 1.5), rim, Math.PI, null)).toBe('left');
    const straight = new Vector3(0, 0, 1.5);
    expect(pickLayupSide(straight, rim, Math.PI, new Vector3(-0.6, 0, 1.2))).toBe(sideAwayFrom(straight, Math.PI, new Vector3(-0.6, 0, 1.2)));
    expect(pickLayupSide(straight, rim, Math.PI, new Vector3(-0.6, 0, 1.2))).toBe('left');
  });
  it('a hook shoots with the hand AWAY from the defender; with nobody on him, the hand on his side of the rim', () => {
    const at = new Vector3(0, 0, 1.2);
    expect(pickHookSide(at, rim, Math.PI, new Vector3(-0.5, 0, 0.9))).toBe('left');
    expect(pickHookSide(at, rim, Math.PI, new Vector3(0.5, 0, 0.9))).toBe('right');
    expect(pickHookSide(new Vector3(-1, 0, 1.2), rim, Math.PI, null)).toBe('right');
    expect(pickHookSide(new Vector3(1, 0, 1.2), rim, Math.PI, null)).toBe('left');
  });
  it('a reverse goes with the lateral drift, as drawn', () => {
    expect(reverseSide(new Vector3(0, 0, 1), rim, Math.PI, new Vector3(-2, 0, -1))).toBe('right');
    expect(reverseSide(new Vector3(0, 0, 1), rim, Math.PI, new Vector3(2, 0, -1))).toBe('left');
  });
  it('the rival\'s crossover side is the side the step goes to (bodySide), in the same frame', () => {
    const facingRim = new Vector3(0, 0, -1);   // yaw π
    expect(bodySide(facingRim, new Vector3(-1, 0, 0))).toBe('right');
    expect(bodySide(facingRim, new Vector3(1, 0, 0))).toBe('left');
    expect(bodySide(facingRim, new Vector3(-1, 0, 0))).toBe(sideOfVector(Math.PI, { x: -1, z: 0 }));
  });
});
