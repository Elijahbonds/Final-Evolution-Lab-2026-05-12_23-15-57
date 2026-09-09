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
  buildPullupGather, buildFloater, buildHandUp, buildScreenSet,
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
/** Back to bind with nothing playing — build a clip from HERE (the builder fits the hands against the current pose). */
function rest(): void { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } }
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
  // HOOPS-MOVE-KIT-A (2026-09-08)
  // (each clip is built ONCE, from bind, before any scrub: the builder fits the hands against the skeleton's current pose)
  it('the LEFT layup is the mirror: the left knee up, the left hand high, the right hand low', () => {
    rest(); const left = buildLayupGather(scene, sk, 'left')!, right = buildLayupGather(scene, sk, 'right')!;
    at(left, 0.3);
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.3);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y);
    expect(pos('RightHand').y).toBeLessThan(pos('Head').y);
    const lx = pos('LeftHand').x, rx = pos('RightHand').x;
    at(right, 0.3);
    expect(pos('RightHand').x).toBeCloseTo(-lx, 1);   // the high hand on the other side of the body
    expect(pos('LeftHand').x).toBeCloseTo(-rx, 1);
  });
  it('the layup lands with the feet under the body and the hands down the front (no T)', () => {
    at(buildLayupGather(scene, sk)!, 0.7);
    const lf = pos('LeftFoot'), rf = pos('RightFoot'), lh = pos('LeftHand'), rh = pos('RightHand'), sh = (pos('LeftArm').y + pos('RightArm').y) / 2;
    expect(Math.abs(lf.y - rf.y)).toBeLessThan(0.12);
    expect(lh.y).toBeLessThan(sh - 0.15); expect(rh.y).toBeLessThan(sh - 0.15);
    expect(Math.hypot(lh.x - rh.x, lh.z - rh.z)).toBeLessThan(0.7);
  });
  it('the pull-up gather brings both hands onto the ball at the hip with the knees loaded, then sets it at the chest', () => {
    rest(); const g = buildPullupGather(scene, sk)!;
    at(g, 0.14);
    const lh = pos('LeftHand'), rh = pos('RightHand'), hips = pos('Hips');
    expect(Vector3.Distance(lh, rh)).toBeLessThan(0.34);                 // both hands on the ball
    expect(rh.y).toBeLessThan(hips.y + 0.1);                             // at the hip
    expect(pos('LeftLeg').y).toBeLessThan(0.62); expect(pos('RightLeg').y).toBeLessThan(0.62);   // the knees loaded (bind ≈ 0.5 + hips drop)
    at(g, 0.3);
    const lh2 = pos('LeftHand'), rh2 = pos('RightHand');
    expect(Vector3.Distance(lh2, rh2)).toBeLessThan(0.34);
    expect(rh2.y).toBeGreaterThan(pos('Hips').y + 0.2);                  // up to the chest
    expect(rh2.y).toBeLessThan(pos('Head').y);
  });
  it('the hand-up contest: one arm straight up over the head, the other low, both feet on the floor, no jump', () => {
    rest(); const g = buildHandUp(scene, sk)!;
    at(g, 0.35);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.25);
    expect(pos('LeftHand').y).toBeLessThan(pos('Head').y - 0.2);
    expect(pos('LeftFoot').y).toBeLessThan(0.15); expect(pos('RightFoot').y).toBeLessThan(0.15);
    expect(Math.abs(pos('LeftFoot').x - pos('RightFoot').x)).toBeGreaterThan(0.4);   // a wide stance
  });
  it('the screen: a wide planted base, both hands low in front of the hips, the chest tall', () => {
    rest(); const g = buildScreenSet(scene, sk)!;
    at(g, 0.45);
    expect(Math.abs(pos('LeftFoot').x - pos('RightFoot').x)).toBeGreaterThan(0.4);
    expect(pos('LeftHand').y).toBeLessThan(pos('Hips').y + 0.1); expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.1);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.3);
    expect(pos('Head').y).toBeGreaterThan(pos('Hips').y + 0.45);
  });
  it('the floater releases from a hand above the head, one-handed, the off hand at the chest', () => {
    rest(); const g = buildFloater(scene, sk)!;
    at(g, 0.35);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.1);
    expect(pos('LeftHand').y).toBeLessThan(pos('Head').y);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.25);   // the runner's knee
    at(g, 0.7);
    expect(pos('RightHand').y).toBeLessThan((pos('LeftArm').y + pos('RightArm').y) / 2 - 0.15);   // down the front at feet-down
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
