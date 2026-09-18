// The shared Posture Poses writer on the REAL forge rig (NullEngine): the stance goes on, the chest squares to an aim
// point, the eyes lift to it, the feet flatten — and a held pose never compounds across frames.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { PostureLayer } from './PostureLayer';
import { HOOPS_LEGS, HOOPS_POSTURE } from '../core/HoopsPosture';

let scene: Scene; let sk: Skeleton; let root: TransformNode;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  root = r.meshes[0] as TransformNode;
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});
const reset = () => { for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } root.computeWorldMatrix(true); scene.render(); };
const node = (name: string) => boneNode(sk, name)!;
/** A node's world forward (+z through its world matrix — a normal transform, honest under the importer's mirrored root,
 *  where a quaternion decomposed from a reflection is not). */
const fwd = (n: TransformNode): Vector3 => { n.computeWorldMatrix(true); return Vector3.TransformNormal(Vector3.Forward(), n.getWorldMatrix()).normalize(); };
const yawOf = (v: Vector3) => Math.atan2(v.x, v.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const P = (name: string): Vector3 => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition(); };
/** The chest's world bearing off the shoulders' line (the live probes' method), its sign calibrated so bind faces +z. */
let chestSign = 0;
const chestYaw = (): number => {
  const la = P('LeftArm'), ra = P('RightArm'); const sx = ra.x - la.x, sz = ra.z - la.z;
  if (!chestSign) chestSign = sx > 0 ? 1 : -1;   // at bind the shoulders lie along x and the body faces +z: the perpendicular (−sz, sx)·σ must point +z
  return Math.atan2(-sz * chestSign, sx * chestSign);
};

describe('PostureLayer on the forge rig', () => {
  it('finds every stance bone and the feet', () => {
    reset();
    const L = new PostureLayer(sk, root, 'T');
    expect(L.ok).toBe(true);
    expect(Math.abs(L.sign)).toBe(1);
  });
  it('the load stance squares the chest and lifts the eyes toward an aim point off to the side', () => {
    reset();
    const L = new PostureLayer(sk, root, 'T');
    chestSign = 0; const chest0 = chestYaw(), head0 = fwd(node('Head'));
    // the aim: 2 m ahead (+z: the rig faces +z at bind) and 2 m to the right, at rim height
    const aim = new Vector3(2, 3.05, 2);
    const feed = { pose: HOOPS_POSTURE.load, legs: HOOPS_LEGS.load, aim, window: 'load' };
    for (let i = 0; i < 90; i++) { L.step(1 / 60, feed); scene.render(); }
    const chest1 = chestYaw(), head1 = fwd(node('Head'));
    const aimYaw = Math.atan2(aim.x - root.position.x, aim.z - root.position.z);
    console.info(`[T] chest0 ${(chest0 * 180 / Math.PI).toFixed(1)}° chest1 ${(chest1 * 180 / Math.PI).toFixed(1)}° aim ${(aimYaw * 180 / Math.PI).toFixed(1)}° head0.y ${head0.y.toFixed(2)} head1.y ${head1.y.toFixed(2)} sign ${L.sign} aimDeg ${L.get().aimDeg.toFixed(1)} chestYawDeg ${L.get().chestYawDeg.toFixed(1)} headYaw ${L.get().headYawDeg.toFixed(1)} headPitch ${L.get().headPitchDeg.toFixed(1)}`);
    // the chest turned TOWARD the aim (a hip–shoulder separation, capped — not all the way), the eyes lifted
    expect(Math.abs(wrap(chest1 - aimYaw))).toBeLessThan(Math.abs(wrap(chest0 - aimYaw)) - 0.15);
    expect(head1.y).toBeGreaterThan(head0.y + 0.15);
    expect(L.window).toBe('load');
    for (const n of ['Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftFoot', 'RightFoot']) {
      const q = node(n).rotationQuaternion!; expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    }
  });
  it('a held pose does not compound: 200 frames on a still rig settle to one value', () => {
    reset();
    const L = new PostureLayer(sk, root, 'T');
    const aim = new Vector3(0, 3.05, 6);
    const feed = { pose: HOOPS_POSTURE.defend, legs: HOOPS_LEGS.defend, aim, window: 'defend' };
    for (let i = 0; i < 120; i++) { L.step(1 / 60, feed); scene.render(); }
    const a = node('Spine').rotationQuaternion!.clone(), h = node('Head').rotationQuaternion!.clone(), hips = node('Hips').rotationQuaternion!.clone(), f = node('LeftFoot').rotationQuaternion!.clone();
    for (let i = 0; i < 200; i++) { L.step(1 / 60, feed); scene.render(); }
    const d = (p: Quaternion, q: Quaternion) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.z - q.z) + Math.abs(p.w - q.w);
    expect(d(a, node('Spine').rotationQuaternion!)).toBeLessThan(1e-3);   // the additive lean settled, not drifting
    expect(d(h, node('Head').rotationQuaternion!)).toBeLessThan(1e-3);
    expect(d(hips, node('Hips').rotationQuaternion!)).toBeLessThan(1e-3);
    expect(d(f, node('LeftFoot').rotationQuaternion!)).toBeLessThan(1e-3);
  });
  it('the floor window (weight 0) leaves the clip\'s bones alone', () => {
    reset();
    const L = new PostureLayer(sk, root, 'T');
    const before = ['Spine1', 'Spine2', 'Head', 'LeftShoulder'].map((n) => node(n).rotationQuaternion!.clone());
    for (let i = 0; i < 30; i++) { L.step(1 / 60, { pose: HOOPS_POSTURE.floor, legs: HOOPS_LEGS.floor, aim: new Vector3(0, 3, 5), window: 'floor' }); scene.render(); }
    ['Spine1', 'Spine2', 'Head', 'LeftShoulder'].forEach((n, i) => {
      const q = node(n).rotationQuaternion!; const b = before[i];
      expect(Math.abs(q.x - b.x) + Math.abs(q.y - b.y) + Math.abs(q.z - b.z) + Math.abs(q.w - b.w)).toBeLessThan(1e-4);
    });
  });
  it('the hip-yaw strip removes a keyed hip turn in proportion and restores it at keep 1', () => {
    reset();
    const L = new PostureLayer(sk, root, 'T');
    const hips = node('Hips');
    const turned = Quaternion.FromEulerAngles(0, 30 * Math.PI / 180, 0).multiply(bind.get(hips)!.q);
    hips.rotationQuaternion = turned.clone();
    const stripped = { ...HOOPS_POSTURE.idle, hipYawKeep: 0.5, weight: 0 };
    L.step(1 / 60, { pose: stripped, aim: null, window: 'x' }); L.pose = stripped;   // force the eased pose to the target
    L.apply(1 / 60, null);
    const hipYaw = (): number => { const l = P('LeftUpLeg'), r = P('RightUpLeg'); return Math.atan2(-(r.z - l.z) * hipSign, (r.x - l.x) * hipSign); };
    let hipSign = 1; { hips.rotationQuaternion = bind.get(hips)!.q.clone(); const l = P('LeftUpLeg'), r = P('RightUpLeg'); hipSign = (r.x - l.x) > 0 ? 1 : -1; hips.rotationQuaternion = turned.clone(); }
    hips.rotationQuaternion = turned.clone(); L.pose = stripped; L.apply(1 / 60, null);
    const y1 = Math.abs(wrap(hipYaw()));
    hips.rotationQuaternion = turned.clone();
    L.pose = { ...stripped, hipYawKeep: 1 }; L.apply(1 / 60, null);
    const y2 = Math.abs(wrap(hipYaw()));
    expect(y1).toBeLessThan(y2 - 0.1);   // half the turn stripped
    expect(Math.abs(y2 - 30 * Math.PI / 180)).toBeLessThan(0.05);   // keep 1 = the clip's own turn, untouched
  });
});
