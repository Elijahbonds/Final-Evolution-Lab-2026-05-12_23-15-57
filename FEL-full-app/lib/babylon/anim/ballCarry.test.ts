import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { DEFAULT_DRIBBLE as P } from './Dribble';
import { mountBallCarry } from './ballCarry';
import { attachBallToHand } from './ballRig';

/** A root with a right arm whose bones are linked to TransformNodes, like the glTF hero. */
function rig(scene: Scene) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // facing the rim
  const spine = new TransformNode('Spine2', scene); spine.parent = root; spine.position.set(0, 1.35, 0);
  const shoulder = new TransformNode('RightArm', scene); shoulder.parent = spine; shoulder.position.set(0.18, 0.1, 0);
  shoulder.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), -0.2);
  const elbow = new TransformNode('RightForeArm', scene); elbow.parent = shoulder; elbow.position.set(0.02, -0.28, 0);
  elbow.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.4);
  const hand = new TransformNode('RightHand', scene); hand.parent = elbow; hand.position.set(0, -0.26, 0);
  hand.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const bones: Record<string, Bone> = {};
  let parent: Bone | null = null;
  for (const n of [spine, shoulder, elbow, hand]) {
    const b = new Bone(n.name, sk, parent, Matrix.Identity());
    b.linkTransformNode(n);
    bones[n.name] = b; parent = b;
  }
  for (const n of [root, spine, shoulder, elbow, hand]) n.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  return { root, hand, sk, ball };
}

describe('ballCarry', () => {
  it('detaches the ball while dribbling, puts it on the floor mid-bounce, and hands it back', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'RightHand');             // the mode owns possession
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });
    // a frame = the mode's update, then Babylon's after-animations pass
    const frame = (dt: number, speed: number, active: boolean) => { carry.update(dt, speed, active); scene.onAfterAnimationsObservable.notifyObservers(scene); };
    frame(0, 0, false);
    expect(r.ball.parent).toBe(r.hand);                      // inactive: left alone in the palm
    r.hand.computeWorldMatrix(true);
    const restHand = r.hand.getAbsolutePosition().clone();
    frame(0.016, 0.5, true);
    expect(r.ball.parent).toBeNull();
    // step to phase 0.5 — the floor
    let steps = 0;
    while (Math.abs(carry.phase - 0.5) > 0.01 && steps++ < 400) frame(1 / 240, 0, true);
    r.ball.computeWorldMatrix(true);
    expect(r.ball.getAbsolutePosition().y).toBeCloseTo(P.ballR, 2);
    // the ball dribbles on the right of a body facing -z: world x is negative
    expect(r.ball.getAbsolutePosition().x).toBeLessThan(-0.2);
    // the hand reaches down and out toward the ball (the wait height is at the
    // edge of the arm's reach, so the solver may clamp to full extension)
    r.hand.computeWorldMatrix(true);
    // (straightening a bent arm toward a point off to the side can lift the
    // wrist a little; closing on the ball horizontally is the visible part)
    const hand = r.hand.getAbsolutePosition();
    const ballPos = r.ball.getAbsolutePosition();
    expect(Math.hypot(hand.x - ballPos.x, hand.z - ballPos.z)).toBeLessThan(Math.hypot(restHand.x - ballPos.x, restHand.z - ballPos.z));
    frame(0.016, 0, false);
    expect(r.ball.parent).toBe(r.hand);                      // shot starts: back in the palm
    carry.dispose();
  });
  it('switches hands on a crossover', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });
    const frame = (dt: number, speed: number, active: boolean) => { carry.update(dt, speed, active); scene.onAfterAnimationsObservable.notifyObservers(scene); };
    frame(0.016, 0.5, true);
    carry.switchHand();
    expect(carry.side).toBe('Left');
    while (Math.abs(carry.phase - 0.5) > 0.01) frame(1 / 240, 0, true);
    r.ball.computeWorldMatrix(true);
    expect(r.ball.getAbsolutePosition().x).toBeGreaterThan(0.2);   // now on the body's left
  });
});
