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
import { mat3, mat4, quat, vec3 } from 'gl-matrix';
import sharp from 'sharp';
import { dedup, resample, textureCompress } from '@gltf-transform/functions';

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

// ── Bake the mesh from its modelled pose into the rig's rest pose ────────────
// Blender wrote the mesh UNDEFORMED (export_apply=False keeps the morphs): the
// MakeHuman basemesh in its A-pose (arms ~45° down, legs apart). The mixamo
// rig rests in a T-pose with the legs together, and the joint nodes already sit
// at rest, so the skin's inverse bind matrices describe a pose the mesh is not
// in. Measured 2026-09-04: the wrist vertices centre at (0.43, 1.06) m, the
// bind wrist joint at (0.66, 1.39); the ankle vertices at x 0.22, the joint at
// 0.09. Skinned like that, every pose renders with the limbs rotated by the
// A→T difference (the Closet showed a T-pose while the bones hung).
//
// There is no A-pose skeleton in the file to bake from, so build one from the
// mesh: a joint between two bones sits where their weights mix, so the elbow,
// wrist, knee and ankle are the centroids of the mixed-weight vertices. Rotate
// each limb bone from its rest direction onto the mesh direction (minimal
// rotation; twist stays), then move every vertex and morph delta with the skin
// weights from that pose into the rest. Verified below: the wrist lands on the
// bind wrist joint.
function bakeMeshToRest(): void {
  const ibmAcc = skin.getInverseBindMatrices(); if (!ibmAcc) return;
  const idx = (n: string) => joints.findIndex((j) => j.getName() === n);
  const rest: mat4[] = joints.map((_, i) => mat4.invert(mat4.create(), ibmAcc.getElement(i, new Array(16).fill(0)) as unknown as mat4)!);
  const restPos = (i: number): vec3 => vec3.fromValues(rest[i][12], rest[i][13], rest[i][14]);
  // the body primitive drives the estimate (the clothes follow the same weights)
  const body = root.listMeshes().find((m) => m.listPrimitives().some((pr) => /^skin/i.test(pr.getMaterial()?.getName() ?? '')))?.listPrimitives()[0];
  if (!body) { console.warn('bakeMeshToRest: no body primitive'); return; }
  const P = body.getAttribute('POSITION')!, J = body.getAttribute('JOINTS_0')!, W = body.getAttribute('WEIGHTS_0')!;
  const v = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  const mixedCentroid = (a: number, b: number): vec3 | null => {
    let n = 0; const c = vec3.create();
    for (let i = 0; i < P.getCount(); i++) { J.getElement(i, j4); W.getElement(i, w4); let wa = 0, wb = 0; for (let k = 0; k < 4; k++) { if (j4[k] === a) wa += w4[k]; if (j4[k] === b) wb += w4[k]; } if (wa > 0.3 && wb > 0.3) { P.getElement(i, v); vec3.add(c, c, v as unknown as vec3); n++; } }
    return n >= 8 ? vec3.scale(c, c, 1 / n) : null;
  };
  // world rotation of each bone in the modelled pose; identity where the mesh matches the rest
  const poseRot: quat[] = joints.map(() => quat.create());
  const rotFromTo = (a: vec3, b: vec3): quat => { const u = vec3.normalize(vec3.create(), a), w = vec3.normalize(vec3.create(), b); return quat.normalize(quat.create(), quat.rotationTo(quat.create(), u, w)); };
  const chains: [string, string, string][] = [['LeftArm', 'LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']];
  const report: string[] = [];
  for (const [upper, lower, end] of chains) {
    const iu = idx(upper), il = idx(lower), ie = idx(end); if (iu < 0 || il < 0 || ie < 0) continue;
    const jointMid = mixedCentroid(iu, il), jointEnd = mixedCentroid(il, ie);
    if (!jointMid || !jointEnd) { report.push(`${upper}: no estimate`); continue; }
    const start = restPos(iu);                       // the upper joint itself matches the rest (shoulders and hips measured within 6 cm)
    const rU = rotFromTo(vec3.sub(vec3.create(), restPos(il), start), vec3.sub(vec3.create(), jointMid, start));
    quat.copy(poseRot[iu], rU);
    // the lower bone: its rest direction, already carried by the upper rotation, onto the mesh direction
    const restLowerDir = vec3.transformQuat(vec3.create(), vec3.sub(vec3.create(), restPos(ie), restPos(il)), rU);
    const rL = quat.multiply(quat.create(), rotFromTo(restLowerDir, vec3.sub(vec3.create(), jointEnd, jointMid)), rU);
    quat.copy(poseRot[il], rL); quat.copy(poseRot[ie], rL);   // the end bone (hand/foot) follows the lower bone
    // descendants of the end bone (toes) follow too
    for (let k = 0; k < joints.length; k++) { let par = joints[k].getParentNode() as Node | null; while (par) { if (par === joints[ie]) { quat.copy(poseRot[k], rL); break; } par = par.getParentNode() as Node | null; } }
    report.push(`${upper}: mid ${Array.from(jointMid).map((x) => x.toFixed(2)).join(',')} end ${Array.from(jointEnd).map((x) => x.toFixed(2)).join(',')}`);
  }
  // pose world matrix per joint: rotate about the joint's rest position — pose_i = T(p) R_i T(-p) · rest_i ; the joint positions
  // of rotated children come from the parent's rotation, so build the pose by walking parent-first.
  const poseW: mat4[] = joints.map((_, i) => mat4.clone(rest[i]));
  const order = [...joints.keys()].sort((a, b) => depth(joints[a]) - depth(joints[b]));
  function depth(n: Node): number { let d = 0; for (let p = n.getParentNode() as Node | null; p; p = p.getParentNode() as Node | null) d++; return d; }
  for (const i of order) {
    const par = joints[i].getParentNode() as Node | null; const pi = par ? joints.indexOf(par) : -1;
    // local rest transform, then the parent's pose, then this bone's own rotation about its (posed) origin
    const local = pi >= 0 ? mat4.multiply(mat4.create(), mat4.invert(mat4.create(), rest[pi])!, rest[i]) : mat4.clone(rest[i]);
    const parentPose = pi >= 0 ? poseW[pi] : mat4.create();
    const placed = mat4.multiply(mat4.create(), parentPose, local);
    const origin = vec3.fromValues(placed[12], placed[13], placed[14]);
    // own rotation relative to the parent's: R_i · R_parent⁻¹ applied about the bone origin
    const parentRot = pi >= 0 ? poseRot[pi] : quat.create();
    const own = quat.multiply(quat.create(), poseRot[i], quat.invert(quat.create(), parentRot));
    const spin = mat4.fromRotationTranslation(mat4.create(), own, [0, 0, 0]);
    const about = mat4.multiply(mat4.create(), mat4.fromTranslation(mat4.create(), origin), mat4.multiply(mat4.create(), spin, mat4.fromTranslation(mat4.create(), vec3.negate(vec3.create(), origin))));
    poseW[i] = mat4.multiply(mat4.create(), about, placed);
  }
  const toRest = joints.map((_, i) => mat4.multiply(mat4.create(), rest[i], mat4.invert(mat4.create(), poseW[i])!));
  let moved = 0, maxShift = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const Jp = prim.getAttribute('JOINTS_0'), Wp = prim.getAttribute('WEIGHTS_0'), Pp = prim.getAttribute('POSITION'), Np = prim.getAttribute('NORMAL');
    if (!Jp || !Wp || !Pp) continue;
    const n = Pp.getCount(); const acc = vec3.create(), tmp = vec3.create(); const M = mat4.create(), R3 = mat3.create();
    const positions = Pp.getArray()!; const normals = Np?.getArray() ?? null;
    const targets = prim.listTargets().map((t) => ({ pos: t.getAttribute('POSITION'), nrm: t.getAttribute('NORMAL') }));
    for (let i = 0; i < n; i++) {
      Jp.getElement(i, j4); Wp.getElement(i, w4); for (let e = 0; e < 16; e++) M[e] = 0; let sum = 0;
      for (let k = 0; k < 4; k++) { const wk = w4[k]; if (wk <= 0) continue; sum += wk; const t = toRest[j4[k]]; for (let e = 0; e < 16; e++) M[e] += t[e] * wk; }
      if (sum > 0 && Math.abs(sum - 1) > 1e-3) for (let e = 0; e < 16; e++) M[e] /= sum;
      mat3.fromMat4(R3, M);
      Pp.getElement(i, v); vec3.transformMat4(acc, v as unknown as vec3, M); maxShift = Math.max(maxShift, vec3.distance(acc, v as unknown as vec3)); positions.set(acc, i * 3);
      if (normals) { vec3.set(tmp, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]); vec3.transformMat3(tmp, tmp, R3); vec3.normalize(tmp, tmp); normals.set(tmp, i * 3); }
      for (const t of targets) for (const a of [t.pos?.getArray(), t.nrm?.getArray()]) { if (!a) continue; vec3.set(tmp, a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); vec3.transformMat3(tmp, tmp, R3); a.set(tmp, i * 3); }
      moved++;
    }
    Pp.setArray(positions); if (Np && normals) Np.setArray(normals);
    for (const t of targets) { if (t.pos) t.pos.setArray(t.pos.getArray()!); if (t.nrm) t.nrm.setArray(t.nrm.getArray()!); }
  }
  console.log(`bakeMeshToRest: ${moved} vertices moved into the rest pose (max shift ${maxShift.toFixed(3)} m)\n  ${report.join('\n  ')}`);
}
bakeMeshToRest();
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

// 3) the material name contract (skin / jersey / shorts / shoes / eyes / hair):
//    the body primitive is `skin`; dressed meshes carry the label given at
//    dressing time (Blender object name) or fall back on their asset name.
const contract: [RegExp, string][] = [[/eye|low-poly|high-poly/i, 'eyes'], [/shirt|tee|jersey|polo|top/i, 'jersey'], [/short|pant|jean|trouser/i, 'shorts'], [/boot|shoe|sneaker/i, 'shoes'], [/hair|afro|braid|bun|ponytail/i, 'hair'], [/brow/i, 'brows'], [/lash/i, 'lashes'], [/teeth|tongue/i, 'mouth']];
const nameFor = (meshName: string, matName: string): string | null => { for (const [re, n] of contract) if (re.test(meshName) || re.test(matName)) return n; return null; };
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const mat = prim.getMaterial();
  if (!mat) { prim.setMaterial(doc.createMaterial('skin').setBaseColorFactor([0.78, 0.55, 0.42, 1]).setRoughnessFactor(0.6).setMetallicFactor(0)); continue; }
  // the skin follows the MakeHuman UV layout: the runtime may swap in any MakeHuman skin map (playerIdentity.applySkinMap)
  if (mat.getName() === 'skin' || /^skin/i.test(mat.getName())) { mat.setName('skin'); mat.setExtras({ ...(mat.getExtras() ?? {}), felSkinUV: 'makehuman' }); continue; }
  const n = nameFor(mesh.getName(), mat.getName()); if (n) mat.setName(n);
}
for (const n of root.listNodes()) { const m = n.getMesh(); if (m) { const mats = m.listPrimitives().map((p) => p.getMaterial()?.getName()).filter(Boolean); if (mats.length === 1 && mats[0] !== 'skin') n.setName(mats[0]!); else if (mats[0] === 'skin') n.setName('Body'); } }
await doc.transform(dedup(), prune());
// Textures: the MakeHuman packs ship 2048² PNGs (a skin 3.5 MB, a denim normal 5.4 MB).
// WebP at 2048 keeps the detail the skin pass needs and brings the file inside the
// hero load budget (measured 2026-09-04: 13.2 MB → see the log line).
await doc.transform(dedup(), resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [2048, 2048] }));
writeFileSync(outFile, await io.writeBinary(doc));
const outJoints = root.listSkins()[0].listJoints().map((j) => j.getName());
console.log(`wrote ${outFile}: joints ${outJoints.length} (${outJoints.filter((n) => keep.has(n)).length} in spec), meshes ${root.listMeshes().length}, materials ${root.listMaterials().map((m) => m.getName()).join(',')}`);
