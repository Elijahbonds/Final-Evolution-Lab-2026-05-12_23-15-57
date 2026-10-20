// hoops-handle (owner 2026-10-17: "Sharpen up the moves" — the brief: "the body dips and the shoulders lead"). On the forge hero, the
// crossover and the momentum cross v2 clips at their floor contact: the shoulder line has turned toward the new side MORE than the hips
// (the shoulders lead the cut), and the chest is over. Measured in play before this (rig, 1v1): the shoulder line turned 9–15° through a
// crossover — the clip's spine counter-turned against its hips (−5 → −12°).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildCrossover, buildMomentumCross, carryStanceAtBind } from './basketball';
import { strokeStretch } from '../handlePaths';

let scene: Scene; let sk: Skeleton; const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
beforeAll(async () => {
  scene = new Scene(new NullEngine()); scene.metadata = { felModeId: 'onevone' };
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
}, 120_000);
const rest = () => { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } };
const pos = (bone: string) => { const n = boneNode(sk, bone)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
/** A line's yaw from the bind's own line (deg, about up): how far the hips / the shoulders have turned. */
function turns(g: AnimationGroup | null, sec: number): { hips: number; shoulders: number; chestPitch: number } {
  rest(); for (const n of bind.keys()) n.computeWorldMatrix(true);
  const flat = (a: Vector3, b: Vector3) => { const d = b.subtract(a); d.y = 0; return d.normalize(); };
  const h0 = flat(pos('LeftUpLeg'), pos('RightUpLeg')), s0 = flat(pos('LeftArm'), pos('RightArm'));
  const up0 = pos('Neck').subtract(pos('Hips')).normalize();
  if (g) { g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, sec * 30)); scene.render(); }
  const yaw = (a: Vector3, b: Vector3) => Math.abs(Math.atan2(Vector3.Cross(a, b).y, Vector3.Dot(a, b)) * 180 / Math.PI);
  const up = pos('Neck').subtract(pos('Hips')).normalize();
  const r = { hips: yaw(h0, flat(pos('LeftUpLeg'), pos('RightUpLeg'))), shoulders: yaw(s0, flat(pos('LeftArm'), pos('RightArm'))), chestPitch: Math.acos(Math.min(1, Vector3.Dot(up, up0))) * 180 / Math.PI };
  g?.stop();
  return r;
}

describe('the crossing clips lead with the shoulders (the forge hero)', () => {
  for (const [name, build, floorT] of [['crossover', buildCrossover, 0.19], ['momentum cross', buildMomentumCross, 0.20]] as const) {
    it(`${name}: at the floor contact the shoulders have turned ≥ 28° and ≥ 4° past the hips, the chest ≥ 21° over (the old keys: shoulders 11.6° / 13.8°, chest 18.0°)`, () => {
      rest();
      const g = build(scene, sk, 'left')!;
      const t = turns(g, floorT * strokeStretch(carryStanceAtBind(sk)));
      expect(t.shoulders, JSON.stringify(t)).toBeGreaterThanOrEqual(28);
      expect(t.shoulders - t.hips, JSON.stringify(t)).toBeGreaterThanOrEqual(4);
      expect(t.chestPitch, JSON.stringify(t)).toBeGreaterThanOrEqual(21);
      g.dispose();
    });
  }
});
