// DUNK MOTION phase 11 — the game dunks go up in the DUNKING hand (owner: right-handed "every dunk, every body"). A ball the dribble
// left in the other hand is handed across over the take-off, never snapped; a loose one goes straight into the dunking hand.
import { describe, it, expect } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { attachBallToHand } from './ballRig';
import { DUNK_HAND, DUNK_PASS_AT, DUNK_PASS_BLEND, ballHandOf, dunkHandPass } from './dunkHand';

function twoHands(scene: Scene) {
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const hips = new TransformNode('Hips', scene); hips.parent = root; hips.position.set(0, 1, 0);
  const hb = new Bone('Hips', sk, null, Matrix.Identity()); hb.linkTransformNode(hips);
  const hands: Record<string, TransformNode> = {};
  for (const [name, x] of [['LeftHand', -0.3], ['RightHand', 0.3]] as const) {
    const n = new TransformNode(name, scene); n.parent = hips; n.position.set(x, 0.2, 0.3); n.rotationQuaternion = Quaternion.Identity();
    const b = new Bone(name, sk, hb, Matrix.Identity()); b.linkTransformNode(n); hands[name] = n;
  }
  for (const n of [root, hips, hands.LeftHand, hands.RightHand]) n.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  return { sk, hands, ball };
}

describe('the ball into the dunking hand', () => {
  it('the dunking hand is the rig\'s LEFT — the one a mirrored spawn renders as the body\'s right', () => {
    expect(DUNK_HAND).toBe('LeftHand');
  });
  it('a loose ball goes straight into it; a ball already there stays', () => {
    const scene = new Scene(new NullEngine()); const r = twoHands(scene);
    const step = dunkHandPass(r.ball, r.sk);
    expect(ballHandOf(r.ball)).toBe(DUNK_HAND);
    step(0.1); expect(ballHandOf(r.ball)).toBe(DUNK_HAND);
    const again = dunkHandPass(r.ball, r.sk); again(0.05); expect(ballHandOf(r.ball)).toBe(DUNK_HAND);
  });
  it('a ball in the other hand is handed across over the take-off — in between the palms mid-pass, never a snap', () => {
    const scene = new Scene(new NullEngine()); const r = twoHands(scene);
    attachBallToHand(r.ball, r.sk, 'RightHand');
    const step = dunkHandPass(r.ball, r.sk);
    step(0); expect(ballHandOf(r.ball)).toBe('RightHand');
    const x = () => { r.ball.computeWorldMatrix(true); return r.ball.getAbsolutePosition().x; };
    const right = x();
    step(DUNK_PASS_AT);
    const mid = x();
    expect(mid).toBeLessThan(right - 0.1);                 // on its way…
    expect(mid).toBeGreaterThan(-0.3 - 0.05 - 0.2);        // …not already there
    step(DUNK_PASS_AT + DUNK_PASS_BLEND + 0.01);
    expect(ballHandOf(r.ball)).toBe(DUNK_HAND);
    expect(Math.abs(x() - right)).toBeGreaterThan(0.4);    // across the body
    expect(Vector3.Distance(r.ball.getAbsolutePosition(), r.hands.LeftHand.getAbsolutePosition())).toBeLessThan(0.25);
  });
});
