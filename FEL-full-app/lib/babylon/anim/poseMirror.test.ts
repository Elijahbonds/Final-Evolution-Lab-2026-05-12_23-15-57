import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { describe, it, expect } from 'vitest';
import { mirrorPoseKeys } from './poseMirror';
import { boneNode } from './boneLookup';
import { FLUSH_ONE, buildFlushOne, buildFlushLeft, buildFlushTwo, buildCarryUpOne, buildCarryUpLeft, buildCarryUpTwo } from './authored/dunkFlush';

describe('poseMirror — the same movement, other side of the body', () => {
  it('swaps the sides, reflects x, keeps pitch and flips yaw / roll', () => {
    const [m] = mirrorPoseKeys([{ t: 0.2, bones: { Spine: [10, 20, 5], LeftUpLeg: [-30, 0, 8] }, hands: { Right: [0.2, 2, 0.1] }, poles: { Right: [0.9, 0.1, -0.3] }, feet: { Left: [-0.1, 0.3, 0.2] }, hipsY: -0.1, hold: true }]);
    expect(m.hands).toEqual({ Left: [-0.2, 2, 0.1] });
    expect(m.poles).toEqual({ Left: [-0.9, 0.1, -0.3] });
    expect(m.feet).toEqual({ Right: [0.1, 0.3, 0.2] });
    expect(m.bones).toEqual({ Spine: [10, -20, -5], RightUpLeg: [-30, -0, -8] });
    expect(m.hipsY).toBe(-0.1); expect(m.hold).toBe(true); expect(m.t).toBe(0.2);
  });
  it('mirroring twice is the identity', () => {
    expect(mirrorPoseKeys(mirrorPoseKeys(FLUSH_ONE))).toEqual(JSON.parse(JSON.stringify(FLUSH_ONE)).map((k: Record<string, unknown>) => k));
  });
});

describe('dunkFlush — the flush in the hand the ball is in (DUNK MOTION phase 4)', () => {
  it('builds on the hero; the left flush hammers with the LEFT hand, the two-hand with both', async () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const y = (n: string) => { const b = boneNode(sk, n)! as TransformNode; b.computeWorldMatrix(true); return b.getAbsolutePosition().y; };
    const at = (build: typeof buildFlushOne, t: number) => { const g = build(scene, sk)!; g.start(false, 1, g.from, g.to, false); g.goToFrame(t * 30); scene.render(); const out = { L: y('LeftHand'), R: y('RightHand') }; g.stop(); return out; };
    for (const b of [buildFlushOne, buildFlushLeft, buildFlushTwo, buildCarryUpOne, buildCarryUpLeft, buildCarryUpTwo]) expect(b(scene, sk)).not.toBeNull();
    const one = at(buildFlushOne, 0), left = at(buildFlushLeft, 0), two = at(buildFlushTwo, 0);
    expect(one.R - one.L).toBeGreaterThan(0.3);      // the ball hand cocked over the head, the guide hand off it
    expect(left.L - left.R).toBeGreaterThan(0.3);    // …mirrored
    expect(Math.abs(two.L - two.R)).toBeLessThan(0.08);
  }, 120000);
});
