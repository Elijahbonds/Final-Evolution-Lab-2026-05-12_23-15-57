// HOOPS MOTION phase 4b (plan §3.3 "the contact schedule, on 3c's layer order", §6): THE PALM ON THE BALL THROUGH A MOVE, on the forge
// hero (the hinge needs a real rig: bindFrontInFrame reads the toes), run twice — with the motion layers mounted in the modes' order (the
// drag insert-first, the carry's reach, the hinge LAST) and with them off ({ drag: false, hinge: false, lean: false }). The plan left the
// order open ("register the move's contact solve after the hinge, or measure the palm with the hinge mounted and accept its twist limit;
// decide by the palm test, not by assumption"): this is that test. The clip is a stub (the bind pose restored before every pass).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { mountBallCarry } from './ballCarry';
import { attachBallToHand } from './ballRig';
import { mountMotionLayers } from './motionLayers';
import { rigHandOnSide } from './athleteSide';
import { armChain } from './HandIK';

let engine: NullEngine; let scene: Scene; let sk: Skeleton; let root: TransformNode;
const bind = new Map<TransformNode, Quaternion>();
beforeAll(async () => {
  engine = new NullEngine(); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode;
  root.scaling.setAll(1);   // the spawn's reset (CharacterLibrary: scaling set fresh; the loader's quaternion stays) — the runtime's mirrored body
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, (n.rotationQuaternion ?? Quaternion.Identity()).clone()); }
});
afterAll(() => { scene.dispose(); engine.dispose(); });

/** One move's contact frames: the palm (the touching hand's bone to the ball's centre, less the palm-held 0.15 m — the probe's PALM
 *  read) on the frames the path's target is inside the arm's reach, and how many were beyond it (the shortfall reported). */
function run(layered: boolean, move: 'crossover' | 'between_legs' | 'in_and_out' | 'spin') {
  for (const [n, q] of bind) n.rotationQuaternion = q.clone();
  root.position.setAll(0);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  (ball.metadata ??= {}).felPalmMirrorLeft = true;
  const right = rigHandOnSide(sk, root, 'right');
  attachBallToHand(ball, sk, right);
  const clipObs = scene.onBeforeAnimationsObservable.add(() => { for (const [n, q] of bind) n.rotationQuaternion!.copyFrom(q); });
  const layers = layered ? mountMotionLayers({ scene, skeleton: sk, root, ball, hinge: false }) : mountMotionLayers({ scene, skeleton: sk, root, ball, drag: false, hinge: false, lean: false });
  const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
  layers.setContactHands(() => carry.move?.contactRig ?? []);
  if (layered) layers.mountHinge();   // the arms' LAST writer, as every hoops mode mounts it
  const frame = () => {
    carry.update(1 / 60, 0.3, true);
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  for (let i = 0; i < 60; i++) frame();
  let n = 0; while (n++ < 120 && carry.phase > 0.04) frame();   // from the stroke's top
  carry.runMove(move);
  const reachable: number[] = [], beyond: number[] = [];
  for (let i = 0; i < 60 && carry.move; i++) {
    frame();
    const m = carry.move; if (!m || !m.contact || m.reach[m.contact] < 1) continue;
    const rig = rigHandOnSide(sk, root, m.contact) === 'LeftHand' ? 'Left' : 'Right';
    const hand = boneNode(sk, `${rig}Hand`)!, ch = armChain(sk, rig)!;
    for (const x of [ch.shoulder, ch.elbow, hand]) x.computeWorldMatrix(true); ball.computeWorldMatrix(true);
    const b = ball.getAbsolutePosition(), top = b.add(new Vector3(0, 0.12, 0));
    const armLen = Vector3.Distance(ch.shoulder.getAbsolutePosition(), ch.elbow.getAbsolutePosition()) + Vector3.Distance(ch.elbow.getAbsolutePosition(), hand.getAbsolutePosition());
    const gap = Vector3.Distance(hand.getAbsolutePosition(), b) - 0.15;
    if (Vector3.Distance(ch.shoulder.getAbsolutePosition(), top) <= armLen * 0.98) reachable.push(gap); else beyond.push(Vector3.Distance(ch.shoulder.getAbsolutePosition(), top) - armLen);
  }
  carry.dispose(); layers.dispose(); scene.onBeforeAnimationsObservable.remove(clipObs); ball.dispose();
  return { reachable, beyond };
}

describe('the palm on the ball through a move, with the motion layers in the modes\' order and without (plan §3.3, §6)', () => {
  for (const move of ['crossover', 'between_legs', 'in_and_out', 'spin'] as const) {
    it(`${move}: on every contact frame inside the arm's reach the palm is on the ball (≤ 0.08 m) — layered (the hinge last) and bare alike`, () => {
      const a = run(true, move), b = run(false, move);
      expect(a.reachable.length, 'layered: contact frames in reach').toBeGreaterThan(3);
      expect(Math.max(...a.reachable), `layered, beyond reach ${a.beyond.length} (max ${Math.max(0, ...a.beyond).toFixed(3)} m)`).toBeLessThanOrEqual(0.08);
      expect(Math.max(...b.reachable), `bare, beyond reach ${b.beyond.length}`).toBeLessThanOrEqual(0.08);
    });
  }
});
