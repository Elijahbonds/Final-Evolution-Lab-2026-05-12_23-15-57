import { describe, expect, it } from 'vitest';
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { reachArm } from './HandIK';

function arm(scene: Scene) {
  const spine = new TransformNode('Spine2', scene); spine.position.set(0, 1.35, 0);
  const shoulder = new TransformNode('RightArm', scene); shoulder.parent = spine;
  shoulder.position.set(0.18, 0.1, 0); shoulder.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), -0.2);
  const elbow = new TransformNode('RightForeArm', scene); elbow.parent = shoulder;
  elbow.position.set(0.02, -0.28, 0); elbow.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.4);
  const hand = new TransformNode('RightHand', scene); hand.parent = elbow;
  hand.position.set(0, -0.26, 0); hand.rotationQuaternion = Quaternion.Identity();
  for (const n of [spine, shoulder, elbow, hand]) n.computeWorldMatrix(true);
  return { shoulder, elbow, hand };
}

describe('reachArm', () => {
  it('puts the wrist on a dribble-height target, rotations only', () => {
    const scene = new Scene(new NullEngine());
    const a = arm(scene);
    const target = new Vector3(0.28, 0.92 + 0.12, 0.22);   // palm on top of a ball at the side
    const miss = reachArm(a, target, new Vector3(0.6, -0.2, -0.6));
    expect(miss).toBeLessThan(2e-3);
    for (const n of [a.shoulder, a.elbow, a.hand]) expect(n.scaling.equalsWithEpsilon(Vector3.One(), 1e-6)).toBe(true);
  });
  it('blends: half weight lands about halfway', () => {
    const scene = new Scene(new NullEngine());
    const a = arm(scene);
    const start = a.hand.getAbsolutePosition().clone();
    const target = start.add(new Vector3(0.1, -0.3, 0.2));
    reachArm(a, target, new Vector3(0.6, -0.2, -0.6), 0.5);
    const now = a.hand.getAbsolutePosition();
    const full = Vector3.Distance(start, target);
    const moved = Vector3.Distance(start, now);
    expect(moved).toBeGreaterThan(full * 0.25);
    expect(moved).toBeLessThan(full * 0.8);
  });
});
