// Inverse-solve arm offsets on the forge rig: for a target HAND position,
// grid-search withOffset(rest, 0, y, z) on the upper arm and (0, fy, 0) on the
// forearm, print the best fit. Targets are body-local: +x right, +y up, +z forward.
// usage: npx tsx scripts/avatar/_arm-solve.mts Right 0.30,1.45,-0.25 Left 0.30,1.45,-0.25 ...
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const { solveArmsDown, withOffset, eulerQ } = await import('../../lib/babylon/anim/restPose.ts');
const { boneNode } = await import('../../lib/babylon/anim/boneLookup.ts');
const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0];
const rest = solveArmsDown(sk, 72);
const args = process.argv.slice(2);
// args: Side x,y,z [near:y,z,fy]   — the near hint penalises distance from a previous key
let i = 0;
while (i + 1 < args.length) {
  const side = args[i] as 'Left' | 'Right';
  const [tx, ty, tz] = args[i + 1].split(',').map(Number);
  let near: [number, number, number] | null = null;
  let torso: number[] | null = null;
  i += 2;
  while (args[i]?.startsWith('near:') || args[i]?.startsWith('torso:')) {
    if (args[i].startsWith('near:')) near = args[i].slice(5).split(',').map(Number) as [number, number, number];
    else torso = args[i].slice(6).split(',').map(Number);   // hipsX,hipsY,hipsZ,spineX,spineY,spineZ
    i += 1;
  }
  const hips = boneNode(sk, 'Hips')!, spine = boneNode(sk, 'Spine')!;
  hips.rotationQuaternion = torso ? eulerQ(torso[0], torso[1], torso[2]) : eulerQ(0, 0, 0);
  spine.rotationQuaternion = torso ? eulerQ(torso[3], torso[4], torso[5]) : eulerQ(0, 0, 0);
  // A forced compute on a node uses its PARENT'S CACHED matrix; the chest and
  // shoulder between the spine and the arm stay stale without a render, so
  // every torso: solve before 2026-09-03 was really solved upright. Render once.
  hips.computeWorldMatrix(true); spine.computeWorldMatrix(true); scene.render();
  const arm = boneNode(sk, `${side}Arm`)!, fore = boneNode(sk, `${side}ForeArm`)!, hand = boneNode(sk, `${side}Hand`)!;
  const ra = rest.get(`${side}Arm`)!, rf = rest.get(`${side}ForeArm`)!;
  let best = { d: 1e9, y: 0, z: 0, fy: 0, p: Vector3.Zero() };
  for (let y = -180; y <= 180; y += 10) for (let z = -180; z <= 180; z += 10) for (const fy of [-100, -70, -40, 0, 40, 70, 100]) {
    arm.rotationQuaternion = withOffset(ra, 0, y, z);
    fore.rotationQuaternion = withOffset(rf, 0, fy, 0);
    arm.computeWorldMatrix(true); fore.computeWorldMatrix(true); hand.computeWorldMatrix(true);
    const p = hand.getAbsolutePosition();
    let d = Math.hypot(p.x - tx, p.y - ty, p.z - tz);
    if (near) d += 0.0015 * (Math.abs(y - near[0]) + Math.abs(z - near[1]) + 0.5 * Math.abs(fy - near[2]));
    if (d < best.d) best = { d, y, z, fy, p: p.clone() };
  }
  console.log(`${side} → (${tx},${ty},${tz}): arm y=${best.y} z=${best.z} fore y=${best.fy}  lands (${best.p.x.toFixed(2)},${best.p.y.toFixed(2)},${best.p.z.toFixed(2)}) err ${best.d.toFixed(2)}`);
}
scene.dispose();
