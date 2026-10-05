// THE BALL IN THE REPLAYED HAND (asset-polish, 2026-10-05; owner: "sometimes the model will dunk but they won't really be
// holding the ball with an actual limb, it'll just be floating"). The triple cut wrote the ball's recorded WORLD position while
// the body replayed its recorded pose, so the two disagreed by whatever the hand did in the frame the ball's world matrix lagged
// (measured in the live replay: 0.1–0.54 m off the palm with the body in the air). The ball now rides the node it rode live.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { DunkReplayRecorder } from './DunkReplayCam';
import type { CutSpec } from '../core/DunkCuts';

const PALM = new Vector3(0.12, -0.04, -0.08);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function rig() {
  let now = 0;
  // the replay listens for a skip tap on the window (node has none)
  if (typeof window === 'undefined') vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 30;
  const scene = new Scene(engine);
  const camera = new FreeCamera('cam', new Vector3(0, 2, -6), scene);
  const root = new TransformNode('body', scene);
  const arm = new TransformNode('RightArm', scene); arm.parent = root; arm.position.set(0.2, 1.4, 0);
  const hand = new TransformNode('RightHand', scene); hand.parent = arm; hand.position.set(0, 0.6, 0);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  ball.parent = hand; ball.position.copyFrom(PALM);
  const rec = new DunkReplayRecorder(scene, root, ball, camera, () => (ball.parent as TransformNode | null));
  rec.setPoseNodes([arm, hand]);
  const step = (fn?: (i: number) => void, i = 0) => { now += 1000 / 30; fn?.(i); scene.render(); };
  return { scene, root, arm, hand, ball, rec, step, nowSec: () => now / 1000 };
}

/** Where the palm is on the drawn frame: the hand's world matrix (down its whole chain) × the palm offset. */
function palmWorld(hand: TransformNode): Vector3 {
  hand.parent && (hand.parent as TransformNode).computeWorldMatrix(true);
  hand.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(PALM, hand.getWorldMatrix());
}

describe('the triple-cut replay keeps the ball in the replayed hand', () => {
  it('the ball is on the replayed palm on every frame of the cut, while the arm swings fast and the body rises', async () => {
    const r = rig();
    // a flight: the body rises, the ball arm whips up through 2.4 rad in 40 frames (0.06 rad/frame at the shoulder, 0.6 m to the hand)
    for (let i = 0; i < 60; i++) r.step((k) => { r.root.position.y = Math.min(1.2, k * 0.03); r.arm.rotation.z = -Math.min(2.4, k * 0.06) * 1.6; }, i);
    const contact = r.nowSec() - 0.2;
    const cuts: CutSpec[] = [{ id: 'baseline', lead: 1.0, tail: 0.1, speed: 1, label: 'test' }];
    let worst = 0, frames = 0;
    const done = r.rec.playCuts(new Vector3(0, 3.05, 5), contact, cuts);
    for (let i = 0; i < 45; i++) {
      r.step();
      r.ball.computeWorldMatrix(true);
      const d = Vector3.Distance(r.ball.getAbsolutePosition(), palmWorld(r.hand));
      if (r.rec.cutNow === 0) { worst = Math.max(worst, d); frames++; }
    }
    r.rec.stop(); await done;
    expect(frames).toBeGreaterThan(10);
    expect(worst, `the ball strayed ${worst.toFixed(3)} m from the replayed palm`).toBeLessThan(0.01);
  });

  it('after the release the replayed ball flies free, where it was recorded', async () => {
    const r = rig();
    for (let i = 0; i < 40; i++) r.step((k) => { r.arm.rotation.z = -k * 0.05; }, i);
    // the release: the ball leaves the hand and is thrown up and forward
    const released = r.ball.getAbsolutePosition().clone();
    r.ball.setParent(null);
    for (let i = 0; i < 20; i++) r.step((k) => { r.ball.position.set(released.x, released.y + k * 0.1, released.z + k * 0.05); r.arm.rotation.z = -(40 + k) * 0.05; }, i);
    const contact = r.nowSec() - 0.05;
    const done = r.rec.playCuts(new Vector3(0, 3.05, 5), contact, [{ id: 'profile', lead: 0.3, tail: 0.05, speed: 1, label: 'test' }]);
    let freeFrames = 0;
    for (let i = 0; i < 12; i++) { r.step(); if (r.rec.cutNow === 0 && r.rec.riderName === '') freeFrames++; }
    r.rec.stop(); await done;
    expect(freeFrames).toBeGreaterThan(3);
  });
});
