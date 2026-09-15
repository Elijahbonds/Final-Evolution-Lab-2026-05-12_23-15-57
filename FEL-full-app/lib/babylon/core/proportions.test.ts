// EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): a heavier build must not make a taller, bigger-headed body. The old bone
// scaling compounded down the spine (the body matrix measured a "heavy" short body's head 0.22 m above a "slim" one).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../anim/boneLookup';
import { applyProportions } from './playerIdentity';

let scene: Scene; let sk: Skeleton; let root: TransformNode; let base: Vector3;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode; base = root.scaling.clone();
}, 60_000);

const at = (n: string) => { const t = boneNode(sk, n)!; t.computeWorldMatrix(true); return t.getAbsolutePosition().clone(); };
function measure(p: { heightScale?: number; buildScale?: number; reachScale?: number }) {
  applyProportions({ root, skeleton: sk }, p, base);
  scene.render();
  for (const b of sk.bones) b.getTransformNode()?.computeWorldMatrix(true);
  return {
    head: at('Head').y,
    hipWidth: Vector3.Distance(at('LeftUpLeg'), at('RightUpLeg')),
    arm: Vector3.Distance(at('LeftArm'), at('LeftHand')),
    headToNeck: Vector3.Distance(at('Head'), at('Neck')),
  };
}

describe('applyProportions — height is height, build is girth, reach is arm length', () => {
  it('a heavier build widens the body without making it taller or its head bigger', () => {
    const slim = measure({ buildScale: 0.9 }), heavy = measure({ buildScale: 1.12 });
    expect(Math.abs(heavy.head - slim.head)).toBeLessThan(0.01);
    expect(Math.abs(heavy.headToNeck - slim.headToNeck) / slim.headToNeck).toBeLessThan(0.15);   // girth only, never a longer neck
    expect(heavy.hipWidth / slim.hipWidth).toBeCloseTo(1.12 / 0.9, 1);
  });

  it('height scales the whole body', () => {
    const std = measure({}), tall = measure({ heightScale: 1.1 });
    expect(tall.head / std.head).toBeCloseTo(1.1, 2);
  });

  it('reach lengthens the arm by exactly the scale, once (not squared down the chain)', () => {
    const std = measure({}), long = measure({ reachScale: 1.1 });
    expect(long.arm / std.arm).toBeCloseTo(1.1, 2);
  });

  it('is ABSOLUTE: applying again from the same base does not drift', () => {
    const a = measure({ heightScale: 1.05, buildScale: 1.1, reachScale: 1.08 });
    for (let i = 0; i < 5; i++) measure({ heightScale: 1.05, buildScale: 1.1, reachScale: 1.08 });
    const b = measure({ heightScale: 1.05, buildScale: 1.1, reachScale: 1.08 });
    expect(b.head).toBeCloseTo(a.head, 4); expect(b.arm).toBeCloseTo(a.arm, 4);
  });
});
