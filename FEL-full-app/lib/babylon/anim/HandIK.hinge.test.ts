// DUNK MOTION phase 9 (2026-09-23): the hinged arm keeps the elbow and the hand where they were solved, and a one-frame twist flip
// of the forearm becomes a turn at a forearm's own rate.
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { hingeArmApply, makeHingeArm } from './HandIK';

function arm() {
  const scene = new Scene(new NullEngine());
  const root = new TransformNode('root', scene);
  const u = new TransformNode('RightArm', scene); u.parent = root; u.position.set(0.2, 1.4, 0); u.rotationQuaternion = Quaternion.Identity();
  const f = new TransformNode('RightForeArm', scene); f.parent = u; f.position.set(0.28, 0, 0); f.rotationQuaternion = Quaternion.Identity();   // a T-pose arm along +x
  const h = new TransformNode('RightHand', scene); h.parent = f; h.position.set(0.26, 0, 0); h.rotationQuaternion = Quaternion.Identity();
  for (const n of [root, u, f, h]) n.computeWorldMatrix(true);
  const chain = { shoulder: u, elbow: f, hand: h } as never as Parameters<typeof makeHingeArm>[0];
  const H = makeHingeArm(chain, Quaternion.Identity(), Quaternion.Identity(), new Vector3(0, 0, 1))!;
  const pos = (n: TransformNode) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  return { u, f, h, H, pos };
}

describe('the hinged arm', () => {
  it('reads the hinge off bind: a T-pose arm bends toward the front', () => {
    const { H } = arm();
    const bent = new Vector3(1, 0, 0).applyRotationQuaternion(Quaternion.RotationAxis(H.h, Math.PI / 2));
    expect(bent.z).toBeGreaterThan(0.99);
  });
  it('keeps the elbow and the hand where the solver put them', () => {
    const { u, f, h, H, pos } = arm();
    u.rotationQuaternion = Quaternion.FromEulerAngles(0.3, -0.5, 0.9);
    f.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0.2, 1, 0.1).normalize(), 1.1);   // a bend, with some twist in it
    const E0 = pos(f), P0 = pos(h);
    hingeArmApply(H, 1 / 60, 1, 800);
    expect(Vector3.Distance(pos(f), E0)).toBeLessThan(1e-4);
    expect(Vector3.Distance(pos(h), P0)).toBeLessThan(1e-4);
  });
  it('a 92° one-frame forearm twist from the writers becomes a turn at the rate', () => {
    const { u, f, H } = arm();
    u.rotationQuaternion = Quaternion.FromEulerAngles(0.3, -0.5, 0.9);
    f.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), 1.1);
    hingeArmApply(H, 1 / 60, 1, 800);
    const before = f.rotationQuaternion!.clone();
    // the writers hand back the same bend, the forearm spun 92° about its own axis
    f.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), 1.1).multiply(Quaternion.RotationAxis(new Vector3(1, 0, 0), 92 * Math.PI / 180));
    hingeArmApply(H, 1 / 60, 2, 800);
    const turned = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(before, f.rotationQuaternion!)))) * 180 / Math.PI;
    expect(turned).toBeLessThan(800 / 60 + 0.5);
    expect(turned).toBeGreaterThan(800 / 60 - 0.5);
  });
});
