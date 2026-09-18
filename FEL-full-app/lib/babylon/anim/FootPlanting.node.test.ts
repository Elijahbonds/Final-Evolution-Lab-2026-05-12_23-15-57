// The node-space leg: hip → knee → ankle as plain TransformNodes under a
// NullEngine. plantLeg must put the ankle on the target without touching scale.
import { describe, expect, it } from 'vitest';
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { plantLeg } from './FootPlanting';

function chain(scene: Scene) {
  const root = new TransformNode('root', scene);
  root.position.set(0, 0, 0);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.6);   // the body faces somewhere
  const hip = new TransformNode('LeftUpLeg', scene); hip.parent = root;
  hip.position.set(0.09, 0.95, 0); hip.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.15);
  const knee = new TransformNode('LeftLeg', scene); knee.parent = hip;
  knee.position.set(0, -0.45, 0.0); knee.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), -0.3);
  const ankle = new TransformNode('LeftFoot', scene); ankle.parent = knee;
  ankle.position.set(0, -0.42, 0); ankle.rotationQuaternion = Quaternion.Identity();
  for (const n of [root, hip, knee, ankle]) n.computeWorldMatrix(true);
  return { root, hip, knee, ankle };
}

describe('plantLeg on TransformNodes', () => {
  it('moves the ankle onto an in-reach target, rotations only', () => {
    const scene = new Scene(new NullEngine());
    const c = chain(scene);
    const start = c.ankle.getAbsolutePosition().clone();
    const target = start.add(new Vector3(0.12, 0.03, -0.1));   // a step's worth of drift
    const miss = plantLeg(c.hip, c.knee, c.ankle, target, c.root.forward);
    expect(miss).toBeLessThan(2e-3);
    for (const n of [c.hip, c.knee, c.ankle]) expect(n.scaling.equalsWithEpsilon(Vector3.One(), 1e-6)).toBe(true);
    // segment lengths are untouched
    expect(Vector3.Distance(c.hip.getAbsolutePosition(), c.knee.getAbsolutePosition())).toBeCloseTo(0.45, 4);
    expect(Vector3.Distance(c.knee.getAbsolutePosition(), c.ankle.getAbsolutePosition())).toBeCloseTo(0.42, 4);
  });
  it('converges: the pole twist fades in over a few frames, then nothing moves', () => {
    const scene = new Scene(new NullEngine());
    const c = chain(scene);
    const target = c.ankle.getAbsolutePosition().add(new Vector3(0.1, 0, 0.05));
    // the ankle is on target from the first frame; the knee swings to the pole
    // over a few frames on a near-straight leg (the twist is faded by bend)
    expect(plantLeg(c.hip, c.knee, c.ankle, target, c.root.forward)).toBeLessThan(2e-3);
    for (let i = 0; i < 12; i++) plantLeg(c.hip, c.knee, c.ankle, target, c.root.forward);
    const hipQ = c.hip.rotationQuaternion!.clone(), kneeQ = c.knee.rotationQuaternion!.clone();
    const miss2 = plantLeg(c.hip, c.knee, c.ankle, target, c.root.forward);
    expect(miss2).toBeLessThan(2e-3);
    expect(Math.abs(Quaternion.Dot(hipQ, c.hip.rotationQuaternion!))).toBeCloseTo(1, 4);
    expect(Math.abs(Quaternion.Dot(kneeQ, c.knee.rotationQuaternion!))).toBeCloseTo(1, 4);
  });
});
