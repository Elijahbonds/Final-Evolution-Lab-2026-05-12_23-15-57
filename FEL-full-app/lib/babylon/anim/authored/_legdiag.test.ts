// DUNK-POSTURE-LEGS diag: the mocap's leg solve on the real rig, in node. Where do the knee / ankle land vs the authored target?
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import * as M from './mocapDunk';
import { it } from 'vitest';
import { plantLeg } from '../FootPlanting';
import { frameAbove } from '../TwoBoneIK';

it('leg solve diag', async () => {
const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk: Skeleton = r.skeletons[0];
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
const reset = () => { for (const x of [...scene.animationGroups]) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } scene.render(); };
const pos = (name: string) => { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition(); };
const hips = boneNode(sk, 'Hips')!; const root = hips.parent as TransformNode; const frame = frameAbove(hips);
reset();
const rp = root.getAbsolutePosition();
const P = (v: Vector3) => `(${(v.x - rp.x).toFixed(2)}, ${(v.y - rp.y).toFixed(2)}, ${(v.z - rp.z).toFixed(2)})`;
console.log('frame', frame.name, 'det', frame.getWorldMatrix().determinant().toFixed(2), 'root', root.name, 'rootPos', P(rp), 'hips', P(pos('Hips')));
console.log('bind: LUL', P(pos('LeftUpLeg')), 'LL', P(pos('LeftLeg')), 'LF', P(pos('LeftFoot')), 'LTB', P(pos('LeftToeBase')), 'Head', P(pos('Head')), 'RH', P(pos('RightHand')));
// 1) plantLeg straight from bind: the LEFT ankle to behind-and-up (a heel kick), pole forward (+z)
for (const [label, tgt] of [['behind-up', new Vector3(-0.1, 0.4, -0.3)], ['front-up', new Vector3(-0.1, 0.4, 0.3)], ['under-bent', new Vector3(-0.1, 0.3, 0.0)]] as const) {
  reset();
  const h = boneNode(sk, 'LeftUpLeg')!, k = boneNode(sk, 'LeftLeg')!, a = boneNode(sk, 'LeftFoot')!;
  const miss = plantLeg(h, k, a, rp.add(tgt), Vector3.Forward());
  console.log(`plantLeg ${label} target ${P(rp.add(tgt))} → hip ${P(pos('LeftUpLeg'))} knee ${P(pos('LeftLeg'))} ankle ${P(pos('LeftFoot'))} miss ${miss.toFixed(3)}`);
}
// 2) the mocap clip evaluated at a few keys
reset();
const g: AnimationGroup = M.buildMocapDunk(scene, sk)!;
for (const t of [0, 0.4, 0.8, 1.05]) {
  reset(); g.start(false, 1, g.from, g.to, false); g.goToFrame(t * 30); scene.render();
  const key = M.DUNK_MOCAP_KEYS.reduce((b, k) => Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b);
  console.log(`mocap t ${t}: authored feet L ${JSON.stringify(key.feet?.Left)} R ${JSON.stringify(key.feet?.Right)} hipsY ${key.hipsY}`);
  console.log(`   live: hipsN ${P(pos('Hips'))} | L hip ${P(pos('LeftUpLeg'))} knee ${P(pos('LeftLeg'))} ankle ${P(pos('LeftFoot'))} | R hip ${P(pos('RightUpLeg'))} knee ${P(pos('RightLeg'))} ankle ${P(pos('RightFoot'))} | RH ${P(pos('RightHand'))} LH ${P(pos('LeftHand'))}`);
}

}, 120000);
