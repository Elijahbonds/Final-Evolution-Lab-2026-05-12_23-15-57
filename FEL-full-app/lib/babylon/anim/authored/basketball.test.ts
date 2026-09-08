// Proves the basketball packages on the REAL forge rig: load the shipped
// hero in a NullEngine, build each clip against its skeleton, scrub to the
// key frame and measure where hands, knees and hips actually are.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import {
  buildBlockReach, buildCrossover, buildDefendSlide, buildDribbleIdle, buildHesi, buildLayupGather, buildStealReach, buildFollowThrough,
} from './basketball';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>(); let root: TransformNode;

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); } root = r.meshes[0] as TransformNode;
});

function at(g: AnimationGroup, sec: number): void {
  // one clip at a time, from bind: a stopped group leaves the bones it keyed where they were
  for (const x of scene.animationGroups) x.stop();
  for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
}
function pos(name: string): Vector3 {
  const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition();
}

describe('basketball packages on the forge rig', () => {
  it('dribble idle keeps the ball hand low and in front', () => {
    at(buildDribbleIdle(scene, sk)!, 0.4);
    const h = pos('RightHand'), head = pos('Head');
    expect(h.y).toBeLessThan(1.1);
    expect(h.z).toBeGreaterThan(0.15);
    expect(head.y).toBeGreaterThan(pos('Hips').y + 0.45);   // upright enough — relative, so a shorter body passes too
  });
  it('block reach puts both hands above the head', () => {
    at(buildBlockReach(scene, sk)!, 0.25);
    const head = pos('Head');
    expect(pos('LeftHand').y).toBeGreaterThan(head.y + 0.25);
    expect(pos('RightHand').y).toBeGreaterThan(head.y + 0.25);
  });
  it('layup gather drives the inside knee up and the ball hand high', () => {
    at(buildLayupGather(scene, sk)!, 0.3);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.3);   // knee well above the other knee
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
  it('defensive slide is wide and low with the hands below the shoulders', () => {
    at(buildDefendSlide(scene, sk, 'left')!, 0.25);
    const lf = pos('LeftFoot'), rf = pos('RightFoot');
    expect(Math.abs(lf.x - rf.x)).toBeGreaterThan(0.45);
    expect(pos('LeftHand').y).toBeLessThan(1.3);
    expect(Math.abs(pos('LeftHand').x)).toBeGreaterThan(0.28);
    expect(pos('LeftHand').z).toBeGreaterThan(0.2);   // in front, not out to the side
  });
  it('steal reach flashes the lead hand well forward', () => {
    const g = buildStealReach(scene, sk)!;
    at(g, 0); const before = pos('RightHand').z;
    at(g, 0.15); expect(pos('RightHand').z).toBeGreaterThan(before + 0.2);
  });
  it('crossover turns the hips and sweeps the ball hand across', () => {
    const g = buildCrossover(scene, sk, 'left')!;
    at(g, 0); const x0 = pos('RightHand').x;
    at(g, 0.2);
    const hips = boneNode(sk, 'Hips')!; hips.computeWorldMatrix(true);
    const yaw = Math.abs(hips.rotationQuaternion!.toEulerAngles().y);
    expect(yaw).toBeGreaterThan(0.3);
    expect(Math.abs(pos('RightHand').x - x0)).toBeGreaterThan(0.12);
  });
  it('follow-through starts overhead, snaps the shooting wrist forward and comes down the front (never a T)', () => {
    const g = buildFollowThrough(scene, sk)!;
    at(g, 0);
    const head = pos('Head');
    expect(pos('RightHand').y).toBeGreaterThan(head.y + 0.2);   // both arms overhead at the release frame
    expect(pos('LeftHand').y).toBeGreaterThan(head.y + 0.1);
    at(g, 0.15);
    expect(pos('RightHand').z).toBeGreaterThan(0.3);            // the wrist snap: the ball hand forward
    expect(pos('RightHand').y).toBeGreaterThan(pos('LeftHand').y + 0.2);   // the arm stays up while the off hand drops
    for (const t of [0.3, 0.45, 0.6, 0.7]) {
      at(g, t);
      const l = pos('LeftHand'), r = pos('RightHand'), la = pos('LeftArm'), ra = pos('RightArm');
      const along = Math.abs(((l.x - r.x) * (ra.x - la.x) + (l.z - r.z) * (ra.z - la.z)) / (Math.hypot(ra.x - la.x, ra.z - la.z) || 1));
      expect(along).toBeLessThan(0.9);                           // the hands never spread along the shoulders' line (a T is ~1.3 m)
      expect(l.z).toBeGreaterThan(0.1); expect(r.z).toBeGreaterThan(0.1);   // down the FRONT
    }
    at(g, 0.7);
    expect(pos('RightHand').y).toBeLessThan(1.4);                // settled to a ready stance
  });
  it('hesi loads the knees without moving the hands much', () => {
    const g = buildHesi(scene, sk)!;
    at(g, 0); const h0 = pos('RightHand').clone();
    at(g, 0.2);
    expect(Vector3.Distance(pos('RightHand'), h0)).toBeLessThan(0.2);
  });
});
