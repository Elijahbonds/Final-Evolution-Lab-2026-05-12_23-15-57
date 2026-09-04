// Phase 3 clip batch, proven on the forge rig (same harness as baseball.test.ts).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildGolfAddress, buildGolfSwing } from './golf';
import { buildTennisReady, buildTennisServe, buildTennisSwing } from './tennis';
import { buildVolleyBlock, buildVolleyReady, buildVolleySpike } from './volleyball';
import { buildKeeperDive, buildKeeperSet, buildSoccerKick } from './soccer';

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
function reset(): void {
  for (const x of [...scene.animationGroups]) x.stop();
  for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  scene.render();
}
/** Build FROM BIND. Each module solves its arms-down rest lazily on the first
 *  builder call by measuring the skeleton as it stands — after another test's
 *  clip that is a golf finish, not a rest (measured 2026-09-03: tennis and
 *  soccer pass alone and fail after golf). In the app every clip is built at
 *  spawn, from bind. */
function fresh<T>(f: () => T): T { reset(); return f(); }
function at(g: AnimationGroup, sec: number): void {
  reset();
  g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
}
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition(); }

describe('golf', () => {
  it('address: bent over, hands together low in front', () => {
    at(fresh(() => buildGolfAddress(scene, sk)!), 0.4);
    const l = pos('LeftHand'), rr = pos('RightHand');
    expect(Vector3.Distance(l, rr)).toBeLessThan(0.2);
    expect(rr.y).toBeLessThan(1.0); expect(rr.z).toBeGreaterThan(0.15);
    expect(pos('Head').z).toBeGreaterThan(0.12);   // leaning over the ball
  });
  it('swing: hands over the right shoulder at the top, high left at the finish', () => {
    const g = fresh(() => buildGolfSwing(scene, sk)!);
    at(g, 0.35); const top = pos('RightHand'); expect(pos('RightArm').z).toBeLessThan(pos('LeftArm').z);   // chest turned away from the ball
    expect(top.y).toBeGreaterThan(1.5); expect(top.x).toBeGreaterThan(0.1);
    at(g, 0.55); expect(pos('RightHand').y).toBeLessThan(1.05);   // back down through the ball
    at(g, 0.88); const fin = pos('RightHand');
    expect(fin.y).toBeGreaterThan(1.4); expect(fin.x).toBeLessThan(-0.05);
  });
});
describe('tennis', () => {
  it('ready: racket hand front-right at the waist', () => {
    at(fresh(() => buildTennisReady(scene, sk)!), 0.2);
    const h = pos('RightHand'); expect(h.x).toBeGreaterThan(0.2); expect(h.z).toBeGreaterThan(0.15); expect(h.y).toBeLessThan(1.2);
  });
  it('forehand: taken back, contact out front, wrapped left', () => {
    const g = fresh(() => buildTennisSwing(scene, sk)!);
    at(g, 0.02); expect(pos('RightHand').z).toBeLessThan(-0.1); expect(pos('RightArm').z).toBeLessThan(-0.05);   // the racket shoulder turns BACK
    at(g, 0.3); const c = pos('RightHand'); expect(c.z).toBeGreaterThan(0.25); expect(c.x).toBeGreaterThan(0.2);
    at(g, 0.58); expect(pos('RightHand').x).toBeLessThan(-0.1);
  });
  it('serve: racket above the head at contact', () => {
    const g = fresh(() => buildTennisServe(scene, sk)!);
    at(g, 0.4); expect(pos('LeftHand').y).toBeGreaterThan(1.45);   // toss arm up (solved 1.72 at the key; 1.53 mid-blend)
    at(g, 0.6); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
    at(g, 0.88); expect(pos('RightHand').y).toBeLessThan(1.3);   // followed through
  });
});
describe('volleyball', () => {
  it('ready: low, both hands together in front', () => {
    at(fresh(() => buildVolleyReady(scene, sk)!), 0.3);
    const l = pos('LeftHand'), rr = pos('RightHand');
    expect(Vector3.Distance(l, rr)).toBeLessThan(0.35); expect(rr.y).toBeLessThan(1.05); expect(rr.z).toBeGreaterThan(0.2);
  });
  it('spike: hitting hand above the head and in front at contact', () => {
    const g = fresh(() => buildVolleySpike(scene, sk)!);
    at(g, 0.02); expect(pos('RightHand').z).toBeLessThan(0);   // loaded back
    at(g, 0.3); const c = pos('RightHand'); expect(c.y).toBeGreaterThan(pos('Head').y); expect(c.z).toBeGreaterThan(0.05);
  });
  it('block: both hands straight up', () => {
    at(fresh(() => buildVolleyBlock(scene, sk)!), 0.45);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
});
describe('soccer', () => {
  it('kick: the right foot swings back, then through and high in front', () => {
    const g = fresh(() => buildSoccerKick(scene, sk)!);
    at(g, 0.25); expect(pos('RightFoot').z).toBeLessThan(-0.1);
    at(g, 0.45); const s = pos('RightFoot'); expect(s.z).toBeGreaterThan(0.35); expect(s.y).toBeGreaterThan(0.3);
    at(g, 0.68); expect(pos('RightFoot').y).toBeGreaterThan(0.5);
  });
  it('keeper set: low and wide', () => {
    at(fresh(() => buildKeeperSet(scene, sk)!), 0.3);
    expect(pos('RightHand').x - pos('LeftHand').x).toBeGreaterThan(0.45);
    expect(pos('RightHand').y).toBeLessThan(1.05);
    expect(pos('Hips').y).toBeLessThan(0.9);
  });
  it('keeper dive: both hands stretched out to the right', () => {
    at(fresh(() => buildKeeperDive(scene, sk)!), 0.58);
    expect(pos('RightHand').x).toBeGreaterThan(0.45); expect(pos('LeftHand').x).toBeGreaterThan(0.2);
  });
});
