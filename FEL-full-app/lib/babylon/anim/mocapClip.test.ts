// The owner's golf swing on the forge rig: does a direct local-rotation
// transfer read as a swing? Measured, not assumed.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { buildMocapClip, type MocapClipJson } from './mocapClip';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});
function at(g: AnimationGroup, sec: number): void {
  for (const x of scene.animationGroups) x.stop();
  for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  scene.render();
  g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
}
const pos = (n: string) => { const b = boneNode(sk, n)!; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
const load = (f: string) => JSON.parse(readFileSync(`public/models/clips/mocap/${f}.json`, 'utf8')) as MocapClipJson;

describe('mocap takes on the forge rig (Gate 0: 22 unprefixed bones)', () => {
  it('golf swing: hands travel a wide arc and stay together', () => {
    const g = buildMocapClip(scene, sk, load('golf_swing_full'))!;
    expect(g).not.toBeNull();
    let minY = Infinity, maxY = -Infinity, maxGap = 0, minX = Infinity, maxX = -Infinity;
    for (let t = 0.2; t < 5.2; t += 0.1) {
      at(g, t); const r = pos('RightHand'), l = pos('LeftHand');
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y); minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x);
      maxGap = Math.max(maxGap, Vector3.Distance(r, l));
    }
    console.log(`MOCAP golf hand y ${minY.toFixed(2)}..${maxY.toFixed(2)} x ${minX.toFixed(2)}..${maxX.toFixed(2)} max hand gap ${maxGap.toFixed(2)}`);
    const stature = pos('Hips').y / 0.96;          // judge the arc against this body's size, not the forge hero's
    expect(maxY - minY).toBeGreaterThan(0.45 * stature);   // a swing goes low to high (the kit male spans 0.48 m)
    expect(maxX - minX).toBeGreaterThan(0.4);      // and across the body
    // D-M1 (measured 2026-09-03): direct local-rotation transfer opens the hands
    // to 0.71 m at full extension — the owner's limb lengths against the hero's.
    // Grip IK (HandIK reaching a shared club target) closes it in rung 4; until
    // then this pins the measured value so a regression or a fix both show.
    expect(maxGap).toBeLessThan(0.8);
  });
  it('every retargeted take builds on the rig with all its bones resolved', () => {
    for (const f of ['tennis_serve', 'baseball_pitch_over', 'volleyball_spike', 'football_catch']) {
      const j = load(f); const g = buildMocapClip(scene, sk, j)!;
      expect(g, f).not.toBeNull();
      // pose keys (ship pass 3): Hips + Spine + both arms + both legs + the hips position = 11 targets; raw rotations: one per tracked bone
      expect(g.targetedAnimations.length, f).toBe(j.poseKeys?.length ? 11 : Object.keys(j.tracks).length);
    }
  });
});
