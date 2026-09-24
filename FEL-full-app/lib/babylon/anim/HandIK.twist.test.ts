// DUNK MOTION phase 8 (2026-09-23): the upper arm may not spin on itself in one frame — and limiting it never moves the hand.
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { limitArmTwist, twistAbout } from './HandIK';

function chain() {
  const scene = new Scene(new NullEngine());
  const root = new TransformNode('root', scene);
  const shoulder = new TransformNode('RightArm', scene); shoulder.parent = root; shoulder.position.set(0.2, 1.4, 0);
  shoulder.rotationQuaternion = Quaternion.FromEulerAngles(0.3, 0.2, -1.1);
  const elbow = new TransformNode('RightForeArm', scene); elbow.parent = shoulder; elbow.position.set(0, 0.28, 0);
  elbow.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), 1.2);   // a bent elbow
  const hand = new TransformNode('RightHand', scene); hand.parent = elbow; hand.position.set(0, 0.26, 0);
  hand.rotationQuaternion = Quaternion.Identity();
  const arm = { shoulder, elbow, hand } as never as Parameters<typeof limitArmTwist>[0];
  const world = (n: TransformNode) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  for (const n of [root, shoulder, elbow, hand]) n.computeWorldMatrix(true);
  return { shoulder, elbow, hand, arm, world };
}

describe('limitArmTwist', () => {
  it('reads the roll of a pure twist about the axis', () => {
    expect(twistAbout(Quaternion.RotationAxis(new Vector3(0, 1, 0), 0.7), new Vector3(0, 1, 0))).toBeCloseTo(0.7, 6);
    expect(twistAbout(Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.7), new Vector3(0, 1, 0))).toBeCloseTo(0, 6);
  });
  it('caps a 90° one-frame roll of the upper arm at the rate, and the elbow and the hand do not move', () => {
    const c = chain(), dt = 1 / 60, rate = 720;
    limitArmTwist(c.arm, dt, 1, rate);                                   // frame 1: the memo
    const q0 = c.shoulder.rotationQuaternion!.clone();
    // frame 2: the solver hands back the same arm with the upper arm spun 90° on itself and the forearm counter-turned
    const spin = Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2);
    c.shoulder.rotationQuaternion = q0.multiply(spin);
    c.elbow.rotationQuaternion = Quaternion.Inverse(spin).multiply(c.elbow.rotationQuaternion!);
    const elbowBefore = c.world(c.elbow), handBefore = c.world(c.hand);
    const removed = limitArmTwist(c.arm, dt, 2, rate);
    expect(removed * 180 / Math.PI).toBeCloseTo(90 - rate * dt, 3);
    expect(Vector3.Distance(c.world(c.elbow), elbowBefore)).toBeLessThan(1e-5);
    expect(Vector3.Distance(c.world(c.hand), handBefore)).toBeLessThan(1e-5);
    const left = twistAbout(Quaternion.Inverse(q0).multiply(c.shoulder.rotationQuaternion!), new Vector3(0, 1, 0));
    expect(left * 180 / Math.PI).toBeCloseTo(rate * dt, 3);             // the roll that survives is the rate's
  });
  it('leaves a swing alone (a bone changing direction is not a twist), and starts free after a gap', () => {
    const c = chain(), dt = 1 / 60;
    limitArmTwist(c.arm, dt, 1, 720);
    c.shoulder.rotationQuaternion = c.shoulder.rotationQuaternion!.multiply(Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.4));
    expect(limitArmTwist(c.arm, dt, 2, 720)).toBe(0);
    c.shoulder.rotationQuaternion = c.shoulder.rotationQuaternion!.multiply(Quaternion.RotationAxis(new Vector3(0, 1, 0), 1.5));
    expect(limitArmTwist(c.arm, dt, 9, 720)).toBe(0);                  // stamp 9 after 2: a gap, free
  });
});
