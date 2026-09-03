import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildBatStance, buildBatSwing, buildPitchOver, buildPitchSide } from './baseball';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});
function at(g: AnimationGroup, sec: number): void {
  // one clip at a time, from bind: a stopped group leaves the bones it keyed where they were
  for (const x of scene.animationGroups) x.stop();
  for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
}
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition(); }

describe('baseball packages on the forge rig', () => {
  it('the stance holds both hands together up near the shoulders', () => {
    at(buildBatStance(scene, sk)!, 0.3);
    const l = pos('LeftHand'), rr = pos('RightHand');
    expect(Vector3.Distance(l, rr)).toBeLessThan(0.3);
    expect(l.y).toBeGreaterThan(1.15);
    expect(rr.y).toBeGreaterThan(1.15);
  });
  it('the swing carries the hands from the back shoulder across the front of the body', () => {
    const g = buildBatSwing(scene, sk)!;
    at(g, 0.3); const mid = pos('RightHand');
    expect(mid.z).toBeGreaterThan(0.25);                                   // out in front at contact
    expect(Vector3.Distance(mid, pos('LeftHand'))).toBeLessThan(0.35);     // hands stay together on the bat
    // sample just before the end: the last frame of a CYCLE-mode clip leans back toward its first key
    at(g, 0.53); expect(pos('RightHand').x).toBeLessThan(-0.15);          // wrapped past the midline to the left
  });
  it('the over-the-top pitch takes the throwing hand above the head before release', () => {
    const g = buildPitchOver(scene, sk)!;
    at(g, 0.42); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
    at(g, 0.68); expect(pos('RightHand').z).toBeGreaterThan(0.3);   // released forward
  });
  it('the three-quarter pitch releases from a lower slot than the over-the-top one', () => {
    const over = buildPitchOver(scene, sk)!, side = buildPitchSide(scene, sk)!;
    at(over, 0.42); const hi = pos('RightHand').y;
    at(side, 0.42); const lo = pos('RightHand').y;
    expect(lo).toBeLessThan(hi - 0.15);
    expect(lo).toBeGreaterThan(1.2);                          // still an arm-up throw, not a lob
  });
});
