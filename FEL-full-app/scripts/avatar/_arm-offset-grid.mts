// Where does the RIGHT hand land for withOffset(rest, 0, y, z) on the forge rig?
// Prints a grid so clip authors pick offsets from data. Left arm mirrors x and y.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const { solveArmsDown, withOffset } = await import('../../lib/babylon/anim/restPose.ts');
const { boneNode } = await import('../../lib/babylon/anim/boneLookup.ts');
const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const b64 = readFileSync(process.argv[2] ?? 'public/models/fel-hero.glb').toString('base64');
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0];
const rest = solveArmsDown(sk, 72);
const arm = boneNode(sk, 'RightArm')!, fore = boneNode(sk, 'RightForeArm')!, hand = boneNode(sk, 'RightHand')!;
fore.rotationQuaternion = rest.get('RightForeArm')!.clone();
const ys = [-90, -60, -30, 0, 30, 60, 90], zs = [-160, -120, -80, -40, 0, 40];
console.log('rows y (forward+), cols z (raise −) → hand [x y z]');
for (const y of ys) {
  const row: string[] = [];
  for (const z of zs) {
    arm.rotationQuaternion = withOffset(rest.get('RightArm')!, 0, y, z);
    arm.computeWorldMatrix(true); fore.computeWorldMatrix(true); hand.computeWorldMatrix(true);
    const p = hand.getAbsolutePosition();
    row.push(`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
  }
  console.log(`y=${String(y).padStart(4)} | ` + row.map((s) => s.padStart(17)).join(' '));
}
console.log('cols: z=' + zs.join('  z='));
scene.dispose();
