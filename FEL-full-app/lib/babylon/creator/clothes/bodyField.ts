// THE BODY A GARMENT IS CUT FROM (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e): the kit body at rest, read once per kit
// and cached by its geometry, with every per-vertex number a cut needs.
//
// MEASURED OFF THE MESH, NOT THE JOINTS. The female kit's skeleton is not where her mesh is (measured 2026-10-06: her
// Head joint sits 6 cm BELOW her Neck joint and her hip joints 5.5 cm above the top of her thighs — the rig came over from
// the male), so every height a cut is made at comes from the body's own vertices, by region (paint's atoms, from the skin
// weights): the crotch is the lowest torso vertex, the base of the neck the lowest neck vertex, the knee where the thigh
// meets the shin, the ankle the top of the foot. Only the ARM axis comes from the joints (shoulder → wrist: the same on
// both kits, and the arm's own mesh agrees), because a sleeve is cut across the arm, not across a height.
//
// SPACE. Everything is the shared skeleton space at rest (paint/surfaceMap.restSkin), in metres; `local` maps it back to
// the body's own (quantised) vertex space — a uniform scale and an offset (measured: every joint's rest skinning matrix
// agrees to 3e-6), which is what a garment's vertex buffer must hold to skin with the body's own skeleton.

import type { Mesh } from '@babylonjs/core';
import { ATOM_COUNT, ATOMS, GROUPS, chartCoords, classify, type BodyChart, type V3 } from '../paint/bodyChart';
import { absRest, chartForBody, fullIndices, geometryKey, restSkin } from '../paint/surfaceMap';
import { weldedNormals } from '../shape/inflate';
import type { BodyHeights } from '../../../creator/look/clothes';

export interface ClothLandmarks extends BodyHeights {
  up: V3; left: V3; fwd: V3;
  /** the torso's centre (skeleton space): x and z of the body's midline */
  mid: V3;
  neckBase: number; neckTop: number; headTop: number; sole: number;
  /** the neck's centre (left, fwd coordinates relative to `mid`) and its half-width */
  neckX: number; neckZ: number; neckR: number;
  /** the head's half-width (ears in) */
  headR: number;
  /** each arm: the shoulder joint, the unit direction down the arm, the arm's length (shoulder → wrist joint) and the hand's
   *  (wrist joint → fingertip, measured on the mesh) */
  arm: { L: { o: V3; d: V3; len: number; hand: number }; R: { o: V3; d: V3; len: number; hand: number } };
  /** each leg's axis: the hip joint and the unit direction down to the ankle joint (a side stripe runs round it) */
  leg: { L: { o: V3; d: V3 }; R: { o: V3; d: V3 } };
}

export interface ClothBodyField {
  key: string;
  n: number;
  /** rest positions (m) and welded unit normals */
  P: Float32Array;
  N: Float32Array;
  UV: Float32Array;
  ind: Uint32Array;
  /** skin: 4 joints and weights per vertex (the kit body carries no extra four) */
  J: Float32Array;
  W: Float32Array;
  /** the skeleton's bone names (bare), in joint-index order */
  bones: string[];
  L: ClothLandmarks;
  // per vertex
  /** height along up */
  h: Float32Array;
  /** sideways from the midline (+ = the character's left) */
  x: Float32Array;
  /** forward from the midline */
  z: Float32Array;
  /** metres down the arm on the vertex's own side, from the shoulder joint (negative inside the shoulder) */
  sArm: Float32Array;
  /** how much the vertex faces front on the torso's own axis (cos of the torso chart angle, −1..1) */
  front: Float32Array;
  /** region weights (paint atoms, from the skin weights) */
  faceW: Float32Array; headW: Float32Array; neckW: Float32Array; torsoW: Float32Array;
  armW: Float32Array; handW: Float32Array; legW: Float32Array; footW: Float32Array;
  /** rest → the body's own vertex space: local = (rest − offset) / scale */
  local: { scale: number; offset: V3 };
  /** the sign of (b − a) × (c − a) · N on the body's triangles: the winding a garment's own triangles must keep */
  winding: 1 | -1;
}

const dot = (a: ArrayLike<number>, i: number, b: V3) => a[i] * b[0] + a[i + 1] * b[1] + a[i + 2] * b[2];

/** The pure part: per-vertex numbers and landmarks from the rest data and the chart. */
export function measureClothField(input: {
  key: string; P: Float32Array; ind: ArrayLike<number>; UV: Float32Array; J: ArrayLike<number>; W: ArrayLike<number>; bones: string[];
  chart: BodyChart; atomW: Float32Array; joints: Record<string, V3>; local: { scale: number; offset: V3 };
}): ClothBodyField | null {
  const { P, chart, atomW, joints } = input;
  const n = P.length / 3;
  const need = ['LeftArm', 'LeftHand', 'RightArm', 'RightHand', 'LeftUpLeg', 'LeftFoot', 'RightUpLeg', 'RightFoot'];
  if (need.some((b) => !joints[b])) return null;
  const N = weldedNormals(P, input.ind);
  const { up, left, fwd } = chart;
  const torsoG = GROUPS.indexOf('torso');
  const mid = chart.groups[torsoG].o;
  const A = (name: string) => ATOMS.indexOf(name as (typeof ATOMS)[number]);
  const sum = (v: number, names: string[]) => { let s = 0; for (const a of names) s += atomW[v * ATOM_COUNT + A(a)]; return s; };
  const h = new Float32Array(n), x = new Float32Array(n), z = new Float32Array(n), sArm = new Float32Array(n), front = new Float32Array(n);
  const faceW = new Float32Array(n), headW = new Float32Array(n), neckW = new Float32Array(n), torsoW = new Float32Array(n);
  const armW = new Float32Array(n), handW = new Float32Array(n), legW = new Float32Array(n), footW = new Float32Array(n);
  const arm = (side: 'L' | 'R') => {
    const o = joints[side === 'L' ? 'LeftArm' : 'RightArm'], w = joints[side === 'L' ? 'LeftHand' : 'RightHand'];
    const d: V3 = [w[0] - o[0], w[1] - o[1], w[2] - o[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return { o, d: [d[0] / len, d[1] / len, d[2] / len] as V3, len, hand: 0 };
  };
  const arms = { L: arm('L'), R: arm('R') };
  const legOf = (side: 'L' | 'R') => {
    const o = joints[side === 'L' ? 'LeftUpLeg' : 'RightUpLeg'], f = joints[side === 'L' ? 'LeftFoot' : 'RightFoot'];
    const d: V3 = [f[0] - o[0], f[1] - o[1], f[2] - o[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return { o, d: [d[0] / len, d[1] / len, d[2] / len] as V3 };
  };
  let crotch = Infinity, torsoTop = -Infinity, neckBase = Infinity, neckTop = -Infinity, headTop = -Infinity, sole = Infinity, footTop = -Infinity;
  let thighLo = Infinity, shinHi = -Infinity;
  let nx0 = Infinity, nx1 = -Infinity, nz0 = Infinity, nz1 = -Infinity, headR = 0;
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    const px = P[i] - mid[0], py = P[i + 1] - mid[1], pz = P[i + 2] - mid[2];
    h[v] = dot(P, i, up);
    x[v] = px * left[0] + py * left[1] + pz * left[2];
    z[v] = px * fwd[0] + py * fwd[1] + pz * fwd[2];
    const a = x[v] >= 0 ? arms.L : arms.R;
    sArm[v] = (P[i] - a.o[0]) * a.d[0] + (P[i + 1] - a.o[1]) * a.d[1] + (P[i + 2] - a.o[2]) * a.d[2];
    front[v] = Math.cos(chartCoords(chart, torsoG, [P[i], P[i + 1], P[i + 2]]).ang);
    faceW[v] = sum(v, ['face']); headW[v] = sum(v, ['face', 'scalp', 'ears']); neckW[v] = sum(v, ['neck']);
    torsoW[v] = sum(v, ['torsoFront', 'torsoBack']);
    armW[v] = sum(v, ['upperArmL', 'upperArmR', 'forearmL', 'forearmR']); handW[v] = sum(v, ['handL', 'handR']);
    legW[v] = sum(v, ['thighL', 'thighR', 'shinL', 'shinR']); footW[v] = sum(v, ['footL', 'footR']);
    if (torsoW[v] > 0.5) { crotch = Math.min(crotch, h[v]); torsoTop = Math.max(torsoTop, h[v]); }
    if (neckW[v] > 0.5) { neckBase = Math.min(neckBase, h[v]); neckTop = Math.max(neckTop, h[v]); nx0 = Math.min(nx0, x[v]); nx1 = Math.max(nx1, x[v]); nz0 = Math.min(nz0, z[v]); nz1 = Math.max(nz1, z[v]); }
    if (headW[v] > 0.5) { headTop = Math.max(headTop, h[v]); headR = Math.max(headR, Math.abs(x[v])); }
    if (footW[v] > 0.5) { sole = Math.min(sole, h[v]); footTop = Math.max(footTop, h[v]); }
    if (sum(v, ['thighL', 'thighR']) > 0.5) thighLo = Math.min(thighLo, h[v]);
    if (sum(v, ['shinL', 'shinR']) > 0.5) shinHi = Math.max(shinHi, h[v]);
    if (handW[v] > 0.5) a.hand = Math.max(a.hand, sArm[v] - a.len);
  }
  if (![crotch, torsoTop, neckBase, neckTop, headTop, sole, footTop, thighLo, shinHi].every(Number.isFinite)) return null;
  // winding: which way the body's triangles turn about their own normals
  let wind = 0;
  const ind = input.ind;
  for (let t = 0; t + 2 < ind.length && t < 3 * 2000; t += 3) {
    const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    wind += Math.sign(cx * (N[a] + N[b] + N[c]) + cy * (N[a + 1] + N[b + 1] + N[c + 1]) + cz * (N[a + 2] + N[b + 2] + N[c + 2]));
  }
  const L: ClothLandmarks = {
    up, left, fwd, mid,
    crotch, torsoTop, knee: (thighLo + shinHi) / 2, ankle: footTop, neckBase, neckTop, headTop, sole,
    neckX: (nx0 + nx1) / 2, neckZ: (nz0 + nz1) / 2, neckR: Math.max(0.03, (nx1 - nx0) / 2), headR: Math.max(0.06, headR),
    arm: arms, leg: { L: legOf('L'), R: legOf('R') },
  };
  return {
    key: input.key, n, P, N, UV: input.UV, ind: Uint32Array.from(input.ind), J: Float32Array.from(input.J), W: Float32Array.from(input.W), bones: input.bones,
    L, h, x, z, sArm, front, faceW, headW, neckW, torsoW, armW, handW, legW, footW, local: input.local, winding: wind >= 0 ? 1 : -1,
  };
}

const fields = new Map<string, ClothBodyField | null>();

/** The cloth field of a kit body, cached per kit geometry (both kits: two entries). Null for a body that cannot be cut
 *  (no skin, no UVs, no chart, a rig without arms). */
export function clothFieldOf(body: Mesh): ClothBodyField | null {
  const key = geometryKey(body);
  if (fields.has(key)) return fields.get(key) ?? null;
  const skin = body.skeleton ? restSkin(body) : null;
  const chart = chartForBody(body);
  const uv = body.getVerticesData('uv');
  const ind = fullIndices(body);
  let out: ClothBodyField | null = null;
  if (skin && chart && uv && ind && body.skeleton) {
    const joints: Record<string, V3> = {};
    for (const b of body.skeleton.bones) { const t = absRest(b).getTranslation(); joints[b.name.replace(/^mixamorig:/, '').replace(/_[a-z]{1,2}\d+$/, '')] = [t.x, t.y, t.z]; }
    // rest = local × (inverse bind × absolute rest): read off the first joint (every joint agrees at rest)
    const b0 = body.skeleton.bones[0];
    const m = b0.getAbsoluteInverseBindMatrix().multiply(absRest(b0)).m;
    const scale = Math.cbrt(Math.abs(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]))) || 1;
    const P = skin.P instanceof Float32Array ? skin.P : Float32Array.from(skin.P);
    out = measureClothField({
      key, P, ind, UV: Float32Array.from(uv), J: skin.J, W: skin.W, bones: skin.bones.map((b) => b.replace(/^mixamorig:/, '').replace(/_[a-z]{1,2}\d+$/, '')),
      chart, atomW: classify(chart, skin).atomW, joints, local: { scale, offset: [m[12], m[13], m[14]] },
    });
  }
  fields.set(key, out);
  return out;
}

/** Tests and probes: forget the cached fields. */
export function clearClothFields(): void { fields.clear(); }
export const clothFieldCount = (): number => fields.size;
