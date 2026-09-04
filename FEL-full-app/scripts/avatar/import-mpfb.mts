// Ship pass 3, rung 1 — the forge's IMPORT path: an MPFB2 export (Mixamo rig,
// 52 bones, one body primitive, macro morphs, no materials) → the FEL hero
// shape: 22 unprefixed bones (Gate 0), extra bones folded into their parents
// with their skin weights, the body primitive's material named `skin`, Y-up,
// metres. Clothes, eyes and hair arrive as separate meshes (asset packs) and
// take the contract names when they are added.
//   npx tsx scripts/avatar/import-mpfb.mts <mpfb-mixamo.glb> <out.glb>
import { NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { readFileSync, writeFileSync } from 'node:fs';

const FEL = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const strip = (n: string) => n.replace(/^mixamorig:?/, '');

const [inFile, outFile] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(new Uint8Array(readFileSync(inFile)));
const root = doc.getRoot();

// 1) rename bones to the FEL names
for (const n of root.listNodes()) n.setName(strip(n.getName()));

// 2) fold non-spec joints into their nearest kept ancestor
const skin = root.listSkins()[0];
if (!skin) throw new Error('no skin');
const joints = skin.listJoints();
const keep = new Set(FEL);
const keptAncestor = (n: Node): Node => { let p: Node | null = n; while (p && !keep.has(p.getName())) p = p.getParentNode() as Node | null; if (!p) throw new Error(`no kept ancestor for ${n.getName()}`); return p; };
const remap = new Map<number, number>();
const keptJoints = joints.filter((j) => keep.has(j.getName()));
const indexOfKept = new Map(keptJoints.map((j, i) => [j, i] as const));
joints.forEach((j, oldIdx) => { remap.set(oldIdx, indexOfKept.get(keep.has(j.getName()) ? j : keptAncestor(j))!); });
// rewrite JOINTS_0 / WEIGHTS_0 per primitive: sum weights that land on the same kept joint
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  if (!J || !W) continue;
  const ja = J.getArray()!, wa = W.getArray()!; const n = J.getCount(); const es = J.getElementSize();
  const newJ = new Uint16Array(n * es), newW = new Float32Array(n * es);
  for (let v = 0; v < n; v++) {
    const acc = new Map<number, number>();
    for (let k = 0; k < es; k++) { const w = wa[v * es + k]; if (w <= 0) continue; const nj = remap.get(ja[v * es + k])!; acc.set(nj, (acc.get(nj) ?? 0) + w); }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, es);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    top.forEach(([j, w], k) => { newJ[v * es + k] = j; newW[v * es + k] = w / sum; });
  }
  J.setArray(newJ); W.setArray(newW);
}
// new joint list + inverse bind matrices for kept joints only
const ibm = skin.getInverseBindMatrices();
if (ibm) {
  const arr = ibm.getArray()!; const out = new Float32Array(keptJoints.length * 16);
  keptJoints.forEach((j, i) => { const old = joints.indexOf(j); out.set(arr.subarray(old * 16, old * 16 + 16), i * 16); });
  ibm.setArray(out);
}
for (const j of joints) if (!keep.has(j.getName())) skin.removeJoint(j);
// detach the dropped nodes so the hierarchy is the 22-bone tree
for (const j of joints) if (!keep.has(j.getName())) { for (const c of j.listChildren()) keptAncestor(j).addChild(c); j.dispose(); }

// 3) materials: the body primitive is `skin`; keep it PBR-ready
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  if (!prim.getMaterial()) prim.setMaterial(doc.createMaterial('skin').setBaseColorFactor([0.78, 0.55, 0.42, 1]).setRoughnessFactor(0.6).setMetallicFactor(0));
}
await doc.transform(dedup(), prune());
writeFileSync(outFile, await io.writeBinary(doc));
const outJoints = root.listSkins()[0].listJoints().map((j) => j.getName());
console.log(`wrote ${outFile}: joints ${outJoints.length} (${outJoints.filter((n) => keep.has(n)).length} in spec), meshes ${root.listMeshes().length}, materials ${root.listMaterials().map((m) => m.getName()).join(',')}`);
