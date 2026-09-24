// DUNK MOTION phase 8 (2026-09-23): a mirrored clip is the mirror image of the clip, on the real hero rig.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { beforeAll, describe, it, expect } from 'vitest';
import { boneNode } from './boneLookup';
import { buildTakeOffOne } from './authored/dunkTakeoff';
import { buildCarryUpOne } from './authored/dunkFlush';
import { mirrorGroupsInPlace, mirrorSide, reflectRotation, sagittalNormal } from './groupMirror';
import { Quaternion } from '@babylonjs/core';

let scene: Scene, sk: Skeleton;
const built: Record<string, AnimationGroup> = {};
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  // every clip built at bind, as the spawn does
  built.take = buildTakeOffOne(scene, sk)!; built.takeM = buildTakeOffOne(scene, sk)!;
  built.carry = buildCarryUpOne(scene, sk)!; built.carryM = buildCarryUpOne(scene, sk)!;
  mirrorGroupsInPlace([built.takeM, built.carryM], sk);
}, 120000);
const pos = (n: string) => { const b = boneNode(sk, n)! as TransformNode; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
function at(g: AnimationGroup, t: number): void { g.start(false, 1, g.from, g.to, false); g.pause(); g.goToFrame(t * 30); scene.render(); }

describe('mirrorGroupsInPlace', () => {
  it('names and reflections: Left ↔ Right, centre bones stay; a reflection is an involution', () => {
    expect(mirrorSide('LeftHandIndex1')).toBe('RightHandIndex1'); expect(mirrorSide('RightUpLeg')).toBe('LeftUpLeg'); expect(mirrorSide('Spine2')).toBe('Spine2');
    const q = Quaternion.FromEulerAngles(0.3, -0.7, 0.4), n = new Vector3(1, 0, 0);
    const back = reflectRotation(reflectRotation(q, n), n);
    expect(Math.abs(Quaternion.Dot(back, q))).toBeGreaterThan(0.9999);
    expect(Math.abs(sagittalNormal(sk).y)).toBeLessThan(0.05);   // the hip line is level at bind
  });
  it('every bone of the mirrored take-off sits where its partner sits in the original, reflected across the body', () => {
    at(built.take, 0); const c = pos('Hips'); const n = pos('RightUpLeg').subtract(pos('LeftUpLeg')).normalize(); built.take.stop();
    const reflect = (p: Vector3) => p.subtract(n.scale(2 * Vector3.Dot(p.subtract(c), n)));
    for (const t of [0.1, 0.3, 0.55]) {
      at(built.take, t);
      const orig = Object.fromEntries(['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'Head'].map((b) => [b, pos(b)]));
      built.take.stop();
      at(built.takeM, t);
      for (const b of Object.keys(orig)) expect(Vector3.Distance(pos(mirrorSide(b)), reflect(orig[b])), `${b} @${t}`).toBeLessThan(0.02);
      built.takeM.stop();
    }
  });
  it('the mirrored take-off drives the OTHER knee: the rig\'s left knee is up where the right was', () => {
    at(built.take, 0.1); const gap = pos('RightLeg').y - pos('LeftLeg').y; built.take.stop();
    at(built.takeM, 0.1); expect(pos('LeftLeg').y - pos('RightLeg').y).toBeCloseTo(gap, 2); built.takeM.stop();
  });
  it('the carry-up puts the ball hand overhead on the other side, and a second call leaves the groups alone', () => {
    at(built.carry, 0.4); const hi = pos('RightHand').y; built.carry.stop();
    at(built.carryM, 0.4); expect(pos('LeftHand').y).toBeCloseTo(hi, 2); built.carryM.stop();
    expect(mirrorGroupsInPlace([built.takeM, built.carryM], sk)).toEqual([]);
  });
});
