import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { DEFAULT_DRIBBLE as P } from './Dribble';
import { mountBallCarry } from './ballCarry';
import { attachBallToHand, releaseBall } from './ballRig';

/** A root with a right arm whose bones are linked to TransformNodes, like the glTF hero (`mirror`: the arm on the other side, as the
 *  dunk hero's runtime rig is). */
function rig(scene: Scene, mirror = false) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // facing the rim
  const spine = new TransformNode('Spine2', scene); spine.parent = root; spine.position.set(0, 1.35, 0);
  const shoulder = new TransformNode('RightArm', scene); shoulder.parent = spine; shoulder.position.set(mirror ? -0.18 : 0.18, 0.1, 0);
  shoulder.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), mirror ? 0.2 : -0.2);
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
  return { root, shoulder, elbow, hand, sk, ball };
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
  it('leaves the ball alone on deactivate when the mode already took it (a steal)', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });
    carry.update(0.016, 0.5, true);
    const thief = new TransformNode('LeftHand_thief', scene);
    r.ball.setParent(thief);                                  // the mode re-parents on a steal
    carry.update(0.016, 0, false);
    expect(r.ball.parent).toBe(thief);
  });
  it('leaves a released ball flying when it deactivates in the same frame', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });
    carry.update(0.016, 0.5, true);
    releaseBall(r.ball);                                      // the shot leaves the hand
    carry.update(0.016, 0, false);
    expect(r.ball.parent).toBeNull();
    // and the next possession clears the mark
    attachBallToHand(r.ball, r.sk, 'RightHand');
    expect(r.ball.metadata?.felReleased).toBe(false);
  });
  it('never whips the arm at the catch (CLOTHING-SOFT-RESIDUAL C4): the elbow cannot jump round the hand line, the palm still meets the ball', () => {
    for (const mirror of [false, true]) {
      const scene = new Scene(new NullEngine());
      const r = rig(scene, mirror);
      const s0 = r.shoulder.rotationQuaternion!.clone(), e0 = r.elbow.rotationQuaternion!.clone();
      const params = { ...P, hzIdle: 1.8, hzFast: 2.8 };   // the carry puts the ball on the arm's own side, mirrored rig or not
      const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, params });
      let prev: Quaternion | null = null, worst = 0, miss = 0, n = 0;
      for (let f = 0; f < 150; f++) {
        r.shoulder.rotationQuaternion = s0.clone(); r.elbow.rotationQuaternion = e0.clone();   // the clip poses the arm every frame
        for (const nd of [r.root, r.shoulder, r.elbow, r.hand]) nd.computeWorldMatrix(true);
        carry.update(1 / 60, 0, true); scene.onAfterAnimationsObservable.notifyObservers(scene);
        const q = r.shoulder.rotationQuaternion!.clone();
        if (prev) worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(prev, q)))) * 180 / Math.PI);
        prev = q;
        if (carry.phase > 0.9 || carry.phase < 0.1) { r.hand.computeWorldMatrix(true); r.ball.computeWorldMatrix(true); miss += Vector3.Distance(r.hand.getAbsolutePosition(), r.ball.getAbsolutePosition().add(new Vector3(0, P.ballR, 0))); n++; }
      }
      expect(worst, `mirror ${mirror}`).toBeLessThan(45);     // was 98–124° in one 60 fps frame at the catch
      expect(miss / n, `mirror ${mirror}`).toBeLessThan(0.06); // the palm on top of the ball as before (4.4–4.6 cm mean)
      carry.dispose();
    }
  });
  it('dribbles on the arm side of the body, mirrored rig or not — never across the chest (HOOPS-DEPTH S8)', () => {
    for (const mirror of [false, true]) {
      const scene = new Scene(new NullEngine());
      const r = rig(scene, mirror);
      const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });   // DEFAULT_DRIBBLE, 'Right'
      let steps = 0; carry.update(0.016, 0.5, true);
      while (Math.abs(carry.phase - 0.5) > 0.01 && steps++ < 400) { carry.update(1 / 240, 0, true); scene.onAfterAnimationsObservable.notifyObservers(scene); }
      r.root.computeWorldMatrix(true); r.shoulder.computeWorldMatrix(true); r.ball.computeWorldMatrix(true);
      const inv = Quaternion.Inverse(r.root.absoluteRotationQuaternion);
      const local = (v: Vector3) => v.subtract(r.root.getAbsolutePosition()).applyRotationQuaternion(inv);
      expect(Math.sign(local(r.ball.getAbsolutePosition()).x), `mirror ${mirror}`).toBe(Math.sign(local(r.shoulder.getAbsolutePosition()).x));
      carry.dispose();
    }
  });
});
