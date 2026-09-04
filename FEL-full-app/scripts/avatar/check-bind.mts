// check-bind — Phase 1 gate addition (ship pass 3): does the MESH sit in the pose
// the skin's inverse bind matrices describe? Bone-length retention cannot see
// an A-pose mesh under a T-pose rig (measured 2026-09-04 on the MPFB2 candidate:
// wrist vertices 40 cm from the bind wrist). A joint between two bones sits
// where their weights mix, so compare those centroids with the bind joints.
//   npx tsx scripts/avatar/check-bind.mts public/models/candidates/fel-hero-mpfb.glb [--tol 0.05]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mat4 } from 'gl-matrix';
import { readFileSync } from 'node:fs';

const file = process.argv[2]; if (!file) { console.error('usage: check-bind <glb> [--tol m]'); process.exit(2); }
// Tolerance: a blend centroid sits a few cm off the joint (the knee's mixed region
// hangs below it, the neck's above) — 10 cm separates that bias from a pose
// mismatch, which measured 30–40 cm.
const ti = process.argv.indexOf('--tol'); const TOL = ti > 0 ? Number(process.argv[ti + 1]) : 0.10;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(readFileSync(file)));
// A quantized skinned mesh keeps its vertices in a re-based space the inverse bind matrices absorb,
// so this centroid test cannot read it. Quantized files are derived from a checked source
// (roster-from-kit.mts) and proven by the rig tests instead.
if (doc.getRoot().listExtensionsRequired().some((e) => e.extensionName === 'KHR_mesh_quantization')) { console.log('check-bind: quantized file — checked at its source; run the rig tests on this one'); process.exit(0); }
const skin = doc.getRoot().listSkins()[0]; if (!skin) { console.error('no skin'); process.exit(2); }
const joints = skin.listJoints().map((j) => j.getName().replace(/^mixamorig:?/, '')); const ibm = skin.getInverseBindMatrices()!;
const skinRoot = doc.getRoot().listSkins()[0].listJoints()[0].getParentNode() as import('@gltf-transform/core').Node | null;
const bind = (i: number) => { const inv = mat4.invert(mat4.create(), ibm.getElement(i, new Array(16).fill(0)) as unknown as mat4)!; const wr = worldOf(skinRoot); const v = [inv[12], inv[13], inv[14]]; return [wr[0]*v[0] + wr[4]*v[1] + wr[8]*v[2] + wr[12], wr[1]*v[0] + wr[5]*v[1] + wr[9]*v[2] + wr[13], wr[2]*v[0] + wr[6]*v[1] + wr[10]*v[2] + wr[14]]; };
// positions in the node's world frame: quantization keeps its scale on the mesh node, and a roster
// athlete carries a height scale on the armature
const meshNode = new Map<import('@gltf-transform/core').Mesh, import('@gltf-transform/core').Node>();
for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (m) meshNode.set(m, n); }
const worldOf = (n: import('@gltf-transform/core').Node | null): mat4 => { const chain: import('@gltf-transform/core').Node[] = []; for (let c = n; c; c = c.getParentNode() as import('@gltf-transform/core').Node | null) chain.unshift(c); const m = mat4.create(); for (const c of chain) mat4.multiply(m, m, mat4.fromRotationTranslationScale(mat4.create(), c.getRotation() as never, c.getTranslation() as never, c.getScale() as never)); return m; };
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ p, w: worldOf(meshNode.get(m) ?? null) }))).filter(({ p }) => p.getAttribute('JOINTS_0'));
const PAIRS: [string, string, string][] = [['LeftArm', 'LeftForeArm', 'elbow L'], ['LeftForeArm', 'LeftHand', 'wrist L'], ['RightArm', 'RightForeArm', 'elbow R'], ['RightForeArm', 'RightHand', 'wrist R'], ['LeftUpLeg', 'LeftLeg', 'knee L'], ['LeftLeg', 'LeftFoot', 'ankle L'], ['RightUpLeg', 'RightLeg', 'knee R'], ['RightLeg', 'RightFoot', 'ankle R'], ['Spine2', 'Neck', 'neck']];
let worst = 0, fails = 0;
for (const [a, b, label] of PAIRS) {
  const ia = joints.indexOf(a), ib = joints.indexOf(b); if (ia < 0 || ib < 0) { console.log(`${label.padEnd(8)} — bones missing`); continue; }
  let n = 0; const c = [0, 0, 0]; const P = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  for (const { p: prim, w } of prims) { const pos = prim.getAttribute('POSITION')!, J = prim.getAttribute('JOINTS_0')!, W = prim.getAttribute('WEIGHTS_0')!; for (let i = 0; i < pos.getCount(); i++) { J.getElement(i, j4); W.getElement(i, w4); let wa = 0, wb = 0; for (let k = 0; k < 4; k++) { if (j4[k] === ia) wa += w4[k]; if (j4[k] === ib) wb += w4[k]; } if (wa > 0.3 && wb > 0.3) { pos.getElement(i, P); const x = P[0], y = P[1], z = P[2]; P[0] = w[0]*x + w[4]*y + w[8]*z + w[12]; P[1] = w[1]*x + w[5]*y + w[9]*z + w[13]; P[2] = w[2]*x + w[6]*y + w[10]*z + w[14]; c[0] += P[0]; c[1] += P[1]; c[2] += P[2]; n++; } } }
  if (n < 8) { console.log(`${label.padEnd(8)} — too few mixed-weight vertices (${n})`); continue; }
  const est = c.map((v) => v / n); const bj = bind(ib); const d = Math.hypot(est[0] - bj[0], est[1] - bj[1], est[2] - bj[2]);
  // the neck's mixed region sits at the shoulders (11 cm below the joint on a short neck): informational only
  const gate = label !== 'neck';
  if (gate) { worst = Math.max(worst, d); if (d > TOL) fails++; }
  console.log(`${label.padEnd(8)} mesh ${est.map((v) => v.toFixed(2)).join(',')}  bind ${bj.map((v) => v.toFixed(2)).join(',')}  Δ ${(d * 100).toFixed(1)} cm ${!gate ? 'info' : d > TOL ? 'FAIL' : 'ok'}`);
}
console.log(`check-bind: ${fails ? 'FAIL' : 'PASS'} — worst ${(worst * 100).toFixed(1)} cm (tolerance ${TOL * 100} cm)`);
process.exit(fails ? 1 : 0);
