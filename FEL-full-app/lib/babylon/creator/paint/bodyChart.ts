// The body's paint regions and its chart, from the SKIN WEIGHTS (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 3).
//
// REGIONS ARE NOT HAND-DRAWN. Every vertex already says which bones move it (glTF JOINTS_0 / WEIGHTS_0). A vertex's
// weight on the LeftForeArm is how much of it is "left forearm"; its weight on the spine and clavicle bones is how much is
// torso. So the regions are the bones, grouped: 17 ATOMS that partition the body (each vertex's atom weights sum to its
// bone weights, 1), and the doc's regions are unions of atoms (REGION_ATOMS). Two splits are not bones: the head's
// weight splits into the FACE and the SCALP (in front of the ears and below the hairline is face), and the torso's into
// FRONT and BACK (which side of the torso's own centre line, height by height). Both are measured, not assumed, and both
// are soft over a few centimetres so a seam between regions never steps.
//
// THE CHART. Paint is placed in metres on the body, not in UV space: MakeHuman's UV islands are cut and scaled
// differently (the head is denser than the legs), so a stripe drawn in UV space would break at every seam and change
// width from island to island. Each region belongs to one of 8 GROUPS (head and neck, torso, each arm, each leg, each
// foot), and each group is a cylinder around an axis read off the rig at rest: `t` runs along the axis (up the body;
// towards the shoulder on an arm; towards the ankle on a foot) and `s` runs around it, as arc length on the group's
// mean radius, increasing to the RIGHT AS YOU LOOK AT THE SURFACE from outside, so text and stamps never read mirrored.
// The zero of `s` is the front (the midline on the head and torso; the top of the foot); a region seen from behind
// (`torsoBack`) measures from the back instead. A left group is the mirror image of its right twin, so (s, t) on one
// arm and (−s, t) on the other are mirror points, which is what a mirrored stamp uses.
//
// All of it is pure maths over typed arrays (no Babylon): surfaceMap.ts reads the rest-pose positions and the weights off
// the meshes, and this file turns them into atom weights and chart coordinates per vertex. Garments are classified with
// the BODY's chart (the same axes, the same torso centre line), so a stripe on the shirt lines up with the skin under it.

import type { PaintRegion } from '../../../creator/look/doc';

export type V3 = [number, number, number];

/** The 18 atoms (texel label = index + 1; 0 = not on the body). Phase 4a (2026-10-06) appended `ears` (both ears, one
 *  atom; split off the head by position like face and scalp, see EAR_*). APPEND ONLY is not needed (never stored), but the
 *  order is the label value, so the tests and the compositor's tables index by it. */
export const ATOMS = [
  'face', 'scalp', 'neck', 'torsoFront', 'torsoBack',
  'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'ears',
] as const;
export type Atom = typeof ATOMS[number];
export const ATOM_COUNT = ATOMS.length;
export const atomIndex = (a: Atom): number => ATOMS.indexOf(a);

export const GROUPS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR', 'footL', 'footR'] as const;
export type Group = typeof GROUPS[number];
export const GROUP_COUNT = GROUPS.length;

const GROUP_OF: Record<Atom, Group> = {
  face: 'head', scalp: 'head', neck: 'head', torsoFront: 'torso', torsoBack: 'torso',
  upperArmL: 'armL', forearmL: 'armL', handL: 'armL', upperArmR: 'armR', forearmR: 'armR', handR: 'armR',
  thighL: 'legL', shinL: 'legL', thighR: 'legR', shinR: 'legR', footL: 'footL', footR: 'footR', ears: 'head',
};
/** Group index per atom index. */
export const ATOM_GROUP: readonly number[] = ATOMS.map((a) => GROUPS.indexOf(GROUP_OF[a]));
/** The atom on the other side (a centre atom mirrors onto itself). */
export const ATOM_MIRROR: readonly number[] = ATOMS.map((a) => ATOMS.indexOf((a.endsWith('L') ? `${a.slice(0, -1)}R` : a.endsWith('R') ? `${a.slice(0, -1)}L` : a) as Atom));
/** The group on the other side (a centre group mirrors onto itself). */
export const GROUP_MIRROR: readonly number[] = GROUPS.map((g) => GROUPS.indexOf((g.endsWith('L') ? `${g.slice(0, -1)}R` : g.endsWith('R') ? `${g.slice(0, -1)}L` : g) as Group));

/** The doc's regions as unions of atoms. `armLeft` is the upper arm and forearm; hands and feet are their own. */
export const REGION_ATOMS: Record<PaintRegion, readonly Atom[]> = {
  all: ATOMS,
  head: ['face', 'scalp', 'ears'],
  face: ['face'],
  ears: ['ears'],
  neck: ['neck'],
  torsoFront: ['torsoFront'],
  torsoBack: ['torsoBack'],
  armLeft: ['upperArmL', 'forearmL'],
  armRight: ['upperArmR', 'forearmR'],
  upperArmLeft: ['upperArmL'], upperArmRight: ['upperArmR'],
  forearmLeft: ['forearmL'], forearmRight: ['forearmR'],
  handLeft: ['handL'], handRight: ['handR'],
  legLeft: ['thighL', 'shinL'], legRight: ['thighR', 'shinR'],
  thighLeft: ['thighL'], thighRight: ['thighR'],
  shinLeft: ['shinL'], shinRight: ['shinR'],
  footLeft: ['footL'], footRight: ['footR'],
  body: ATOMS.filter((a) => a !== 'face' && a !== 'scalp' && a !== 'ears'),   // the suit's region: everything below the head, neck in
};

/** A label → in-region table for a doc region (index by texel label; label 0 is never in a region). */
export function regionLabelMask(region: PaintRegion): Uint8Array {
  const m = new Uint8Array(ATOM_COUNT + 1);
  for (const a of REGION_ATOMS[region]) m[atomIndex(a) + 1] = 1;
  return m;
}

/** The region a placed stamp is anchored in: the group it is positioned in (a region spanning several groups anchors in
 *  the torso), and whether its `x` measures from the back. */
export function regionAnchor(region: PaintRegion): { group: number; back: boolean } {
  const groups = new Set(REGION_ATOMS[region].map((a) => ATOM_GROUP[atomIndex(a)]));
  const torso = GROUPS.indexOf('torso');
  const group = groups.size === 1 ? [...groups][0] : groups.has(torso) ? torso : Math.min(...groups);
  return { group, back: region === 'torsoBack' };
}

// ── bones → atoms ────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a bone's weight paints. HEAD and TORSO are split further by position (face / scalp, front / back). */
export const HEAD = -1;
export const TORSO = -2;
const BONE_ATOM: Record<string, number> = {
  Head: HEAD, Neck: atomIndex('neck'),
  Hips: TORSO, Spine: TORSO, Spine1: TORSO, Spine2: TORSO, LeftShoulder: TORSO, RightShoulder: TORSO,
  LeftArm: atomIndex('upperArmL'), RightArm: atomIndex('upperArmR'),
  LeftForeArm: atomIndex('forearmL'), RightForeArm: atomIndex('forearmR'),
  LeftHand: atomIndex('handL'), RightHand: atomIndex('handR'),
  LeftUpLeg: atomIndex('thighL'), RightUpLeg: atomIndex('thighR'),
  LeftLeg: atomIndex('shinL'), RightLeg: atomIndex('shinR'),
  LeftFoot: atomIndex('footL'), RightFoot: atomIndex('footR'),
  LeftToeBase: atomIndex('footL'), RightToeBase: atomIndex('footR'),
};

/** A bone name in any of the repo's spellings (`mixamorig:LeftArm`, `LeftArm_c21`, `LeftArm_r3`) → its bare form. */
export function bareBone(name: string): string {
  const n = name.startsWith('mixamorig:') ? name.slice(10) : name;
  return n.replace(/_[a-z]{1,2}\d+$/, '');
}

/** The atom (or HEAD / TORSO) a bone paints; null for a bone this rig does not know (its weight is ignored, see
 *  classify: the vertex's other bones decide, or it stays off every region). */
export function boneAtom(name: string): number | null {
  const v = BONE_ATOM[bareBone(name)];
  return v === undefined ? null : v;
}

// ── the chart ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ChartGroup {
  /** a point on the axis */
  o: V3;
  /** the axis: the direction `t` grows */
  a: V3;
  /** the zero of the angle (perpendicular to a) */
  f: V3;
  /** the direction the angle grows: right as you look at the surface from outside */
  r: V3;
  /** mean radius (m): s = angle × radius */
  radius: number;
}

export interface BodyChart {
  /** the body's axes (unit): up, the character's left, forward */
  up: V3; left: V3; fwd: V3;
  groups: ChartGroup[];
  /** the torso's front/back centre, per height (along `up`): fwd offset of the centre from the axis point */
  torsoMid: { h0: number; step: number; mid: Float32Array };
  /** per atom: [tMin, tMax, max |s| from the front, max |s| from the back] (m), measured on the body's vertices — where
   *  a region's x and y run (regionFrame) */
  extent: Float32Array;
  /** the face: in front of the ear plane (`front` m forward of the head's centre) and below the hairline (`top` m up
   *  from the head's centre), each soft over `soft` m */
  face: { front: number; top: number; soft: number };
  /** Phase 4a: the ears — head vertices farther to the side than `lateral` m (the skull's half-width above the ears ×
   *  EAR_LATERAL), inside a band of height and depth around the ear (m from the head's centre), each soft over `soft` m */
  ears: { lateral: number; hLo: number; hHi: number; fLo: number; fHi: number; soft: number };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? scl(a, 1 / l) : [0, 0, 0]; };
const reject = (v: V3, n: V3): V3 => sub(v, scl(n, dot(v, n)));

/** The joints a chart needs, at rest, in the shared skeleton space. */
export const CHART_JOINTS = [
  'Hips', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg',
  'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase',
] as const;
export type ChartJoint = typeof CHART_JOINTS[number];

/** A skinned mesh as the chart reads it: rest-pose positions in the shared skeleton space, 4 (or 8) influences. */
export interface SkinInput {
  P: ArrayLike<number>;
  J: ArrayLike<number>; W: ArrayLike<number>;
  J2?: ArrayLike<number> | null; W2?: ArrayLike<number> | null;
  /** the mesh's skeleton's bone names, in its joint-index order */
  bones: readonly string[];
}

/** Per-vertex bone-class weights: [head, torso, ...atoms] where HEAD/TORSO are still unsplit. */
function boneClassWeights(m: SkinInput): { cls: Float32Array; n: number } {
  const n = m.P.length / 3;
  const width = ATOM_COUNT + 2;   // [atoms..., HEAD, TORSO]
  const cls = new Float32Array(n * width);
  const map = m.bones.map(boneAtom);
  for (let v = 0; v < n; v++) {
    for (let k = 0; k < 8; k++) {
      const w = k < 4 ? m.W[v * 4 + k] : m.W2 ? m.W2[v * 4 + k - 4] : 0;
      if (!w) continue;
      const j = k < 4 ? m.J[v * 4 + k] : m.J2![v * 4 + k - 4];
      const a = map[j];
      if (a === null || a === undefined) continue;
      cls[v * width + (a === HEAD ? ATOM_COUNT : a === TORSO ? ATOM_COUNT + 1 : a)] += w;
    }
  }
  return { cls, n };
}

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Build the chart from the joints at rest and the BODY mesh (its vertices measure the radii, the head's centre and
 *  hairline, and the torso's centre line). Null when a joint is missing. */
export function buildBodyChart(joints: Partial<Record<ChartJoint, V3>>, body: SkinInput): BodyChart | null {
  for (const j of CHART_JOINTS) if (!joints[j]) return null;
  const J = joints as Record<ChartJoint, V3>;
  const up = norm(sub(J.Head, J.Hips));
  const left = norm(reject(sub(J.LeftArm, J.RightArm), up));
  const fwd = norm(reject(reject(add(sub(J.LeftToeBase, J.LeftFoot), sub(J.RightToeBase, J.RightFoot)), up), left));
  // the angle grows to the right as you look at the surface: on the front of the torso that is the character's LEFT.
  // `cross(axis, zero)` is that direction up to the space's handedness; this sign makes it so in this space.
  const hand = Math.sign(dot(cross(up, fwd), left)) || 1;
  const rightOf = (a: V3, f: V3): V3 => scl(norm(cross(a, f)), hand);

  const { cls, n } = boneClassWeights(body);
  const width = ATOM_COUNT + 2;
  const P = body.P;
  const pt = (v: number): V3 => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  // the centre of the box (in the body's axes) around the vertices mostly on a class. Not their centroid: the face
  // carries most of the head's vertices (eyes, mouth, nose), which would pull a centroid well forward of the skull's middle
  const centre = (col: number): V3 | null => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const ax = [left, up, fwd];
    for (let v = 0; v < n; v++) {
      if (cls[v * width + col] <= 0.5) continue;
      for (let k = 0; k < 3; k++) { const d = dot(pt(v), ax[k]); lo[k] = Math.min(lo[k], d); hi[k] = Math.max(hi[k], d); }
    }
    if (!Number.isFinite(lo[0])) return null;
    return add(add(scl(left, (lo[0] + hi[0]) / 2), scl(up, (lo[1] + hi[1]) / 2)), scl(fwd, (lo[2] + hi[2]) / 2));
  };
  const headC = centre(ATOM_COUNT) ?? J.Head;
  const torsoC = centre(ATOM_COUNT + 1) ?? J.Hips;

  const mk = (o: V3, a: V3, f0: V3): ChartGroup => {
    const aa = norm(a);
    const f = norm(reject(f0, aa));
    return { o, a: aa, f, r: rightOf(aa, f), radius: 0.1 };
  };
  const armL = mk(J.LeftArm, sub(J.LeftArm, J.LeftHand), fwd);
  const armR = mk(J.RightArm, sub(J.RightArm, J.RightHand), fwd);
  const legL = mk(J.LeftUpLeg, sub(J.LeftUpLeg, J.LeftFoot), fwd);
  const legR = mk(J.RightUpLeg, sub(J.RightUpLeg, J.RightFoot), fwd);
  const footL = mk(J.LeftFoot, sub(J.LeftFoot, J.LeftToeBase), up);
  const footR = mk(J.RightFoot, sub(J.RightFoot, J.RightToeBase), up);
  const groups: ChartGroup[] = [
    mk(headC, up, fwd), mk(torsoC, up, fwd), armL, armR, legL, legR, footL, footR,
  ];

  // the torso's front/back centre per height: the middle of the torso's depth in each 2 cm band
  const step = 0.02;
  let hLo = Infinity, hHi = -Infinity;
  for (let v = 0; v < n; v++) if (cls[v * width + ATOM_COUNT + 1] > 0.5) { const h = dot(sub(pt(v), torsoC), up); hLo = Math.min(hLo, h); hHi = Math.max(hHi, h); }
  const bins = Number.isFinite(hLo) ? Math.max(1, Math.ceil((hHi - hLo) / step) + 1) : 1;
  const lo = new Float32Array(bins).fill(Infinity), hi = new Float32Array(bins).fill(-Infinity);
  if (Number.isFinite(hLo)) for (let v = 0; v < n; v++) {
    if (cls[v * width + ATOM_COUNT + 1] <= 0.5) continue;
    const d = sub(pt(v), torsoC);
    // the band's depth is measured near the midline only (the shoulders and the hips' sides bulge front and back)
    if (Math.abs(dot(d, left)) > 0.08) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.round((dot(d, up) - hLo) / step)));
    const z = dot(d, fwd);
    lo[b] = Math.min(lo[b], z); hi[b] = Math.max(hi[b], z);
  }
  const mid = new Float32Array(bins);
  for (let b = 0; b < bins; b++) mid[b] = lo[b] <= hi[b] ? (lo[b] + hi[b]) / 2 : NaN;
  // fill empty bands from their neighbours
  for (let b = 0; b < bins; b++) if (Number.isNaN(mid[b])) {
    let k = 1; while (k < bins && Number.isNaN(mid[b - k] ?? NaN) && Number.isNaN(mid[b + k] ?? NaN)) k++;
    mid[b] = !Number.isNaN(mid[b - k] ?? NaN) ? mid[b - k] : !Number.isNaN(mid[b + k] ?? NaN) ? mid[b + k] : 0;
  }

  // the head: the hairline sits this far up the head's height above its centre (measured on both kit bodies: the
  // brow ridge is a few cm above the head's centre; above it the forehead runs into the hair)
  let headTop = -Infinity, skull = 0;
  for (let v = 0; v < n; v++) {
    if (cls[v * width + ATOM_COUNT] <= 0.5) continue;
    const d = sub(pt(v), headC);
    const h = dot(d, up);
    headTop = Math.max(headTop, h);
    // the skull's half-width just above the ears (where nothing sticks out of it)
    if (h >= EAR_SKULL_BAND[0] && h <= EAR_SKULL_BAND[1]) skull = Math.max(skull, Math.abs(dot(d, left)));
  }
  const chart: BodyChart = {
    up, left, fwd, groups,
    torsoMid: { h0: Number.isFinite(hLo) ? hLo : 0, step, mid },
    extent: new Float32Array(ATOM_COUNT * 4),
    face: { front: FACE_FRONT, top: Number.isFinite(headTop) ? headTop * FACE_TOP : 0.05, soft: 0.008 },
    ears: { lateral: (skull || 0.07) * EAR_LATERAL, hLo: EAR_BAND.h[0], hHi: EAR_BAND.h[1], fLo: EAR_BAND.f[0], fHi: EAR_BAND.f[1], soft: EAR_SOFT },
  };
  // each group's mean radius, from the vertices mostly in it
  const sum = new Float64Array(GROUP_COUNT), cnt = new Float64Array(GROUP_COUNT);
  const atomW = classify(chart, body).atomW;
  for (let v = 0; v < n; v++) {
    let best = -1, bw = 0.5;
    for (let a = 0; a < ATOM_COUNT; a++) if (atomW[v * ATOM_COUNT + a] > bw) { bw = atomW[v * ATOM_COUNT + a]; best = a; }
    if (best < 0) continue;
    const g = ATOM_GROUP[best];
    const G = groups[g];
    const d = reject(sub(pt(v), axisPoint(chart, g, pt(v))), G.a);
    sum[g] += Math.hypot(d[0], d[1], d[2]); cnt[g]++;
  }
  for (let g = 0; g < GROUP_COUNT; g++) if (cnt[g]) groups[g].radius = sum[g] / cnt[g];
  // a left group and its right twin share one radius, so mirrored stamps are the same size on both sides
  for (let g = 0; g < GROUP_COUNT; g++) { const m = GROUP_MIRROR[g]; if (m > g) { const r = (groups[g].radius + groups[m].radius) / 2; groups[g].radius = r; groups[m].radius = r; } }
  // each atom's extent in its group's chart, from the vertices mostly in it
  const ext = chart.extent;
  for (let a = 0; a < ATOM_COUNT; a++) { ext[a * 4] = Infinity; ext[a * 4 + 1] = -Infinity; ext[a * 4 + 2] = 0; ext[a * 4 + 3] = 0; }
  const cl = classify(chart, body);
  for (let v = 0; v < n; v++) for (let a = 0; a < ATOM_COUNT; a++) {
    if (cl.atomW[v * ATOM_COUNT + a] <= 0.5) continue;
    const g = ATOM_GROUP[a];
    const ang = cl.ang[v * GROUP_COUNT + g], tt = cl.t[v * GROUP_COUNT + g], R = groups[g].radius;
    ext[a * 4] = Math.min(ext[a * 4], tt); ext[a * 4 + 1] = Math.max(ext[a * 4 + 1], tt);
    ext[a * 4 + 2] = Math.max(ext[a * 4 + 2], Math.abs(ang) * R);
    ext[a * 4 + 3] = Math.max(ext[a * 4 + 3], (Math.PI - Math.abs(ang)) * R);
  }
  for (let a = 0; a < ATOM_COUNT; a++) if (!Number.isFinite(ext[a * 4])) { ext[a * 4] = 0; ext[a * 4 + 1] = 0.1; }
  // left and right twins share one extent (the mean), so x on one side and 1 − x on the other are mirror points
  for (let a = 0; a < ATOM_COUNT; a++) {
    const m = ATOM_MIRROR[a];
    if (m <= a) continue;
    for (let k = 0; k < 4; k++) { const v = (ext[a * 4 + k] + ext[m * 4 + k]) / 2; ext[a * 4 + k] = v; ext[m * 4 + k] = v; }
  }
  return chart;
}

/** The face starts this far (m) in front of the head's centre: just in front of the ears on both kits. */
export const FACE_FRONT = 0.015;
/** The face's top, as a fraction of the head's height above its centre (the hairline). */
export const FACE_TOP = 0.42;

/** THE EARS (phase 4a, measured 2026-10-06 on both kit heads, m from the head's centre in the body's axes): the ears
 *  stick out sideways to 0.085 (male) / 0.082 (female) between 4.5 cm below and 2.5 cm above the head's centre, 4.4 cm
 *  behind to 2 cm in front of it; at that height the skull itself, in front of and behind the ear, is at most 0.067 wide,
 *  and just above the ears (EAR_SKULL_BAND) it is 0.071 / 0.069. An ear is what lies farther out than 0.97 × that skull
 *  width inside the band — the flap, leaving a short root so a cut-out leaves no hole in the head.
 *  assumption: 0.97 is judged from the measurements, not from a rendered view. */
export const EAR_SKULL_BAND: readonly [number, number] = [0.035, 0.065];
export const EAR_LATERAL = 0.97;
export const EAR_BAND = { h: [-0.055, 0.03], f: [-0.055, 0.025] } as const;
export const EAR_SOFT = 0.003;

/** The axis point a position is measured from: the group's origin, except the torso, whose centre moves front and
 *  back with height (the chest is forward of the belly, the seat behind it). */
function axisPoint(c: BodyChart, g: number, p: V3): V3 {
  const G = c.groups[g];
  if (GROUPS[g] !== 'torso') return G.o;
  const h = dot(sub(p, G.o), c.up);
  const m = c.torsoMid;
  const x = (h - m.h0) / m.step;
  const i = Math.min(m.mid.length - 1, Math.max(0, Math.floor(x)));
  const j = Math.min(m.mid.length - 1, i + 1);
  const f = Math.min(1, Math.max(0, x - i));
  const z = m.mid[i] * (1 - f) + m.mid[j] * f;
  return add(G.o, scl(c.fwd, z));
}

/** A position's chart coordinates in group g: the angle (rad, 0 at the group's front, growing to the right as seen
 *  from outside) and t (m along the axis). */
export function chartCoords(c: BodyChart, g: number, p: V3): { ang: number; t: number } {
  const G = c.groups[g];
  const d = sub(p, axisPoint(c, g, p));
  return { ang: Math.atan2(dot(d, G.r), dot(d, G.f)), t: dot(sub(p, G.o), G.a) };
}

export interface Classified {
  n: number;
  /** n × ATOM_COUNT soft weights (each vertex's sum is its known-bone weight, 1 on the kit) */
  atomW: Float32Array;
  /** n × GROUP_COUNT: the angle in each group (rad) */
  ang: Float32Array;
  /** n × GROUP_COUNT: t in each group (m) */
  t: Float32Array;
}

/** Atom weights and every group's chart coordinates for each vertex of a mesh (the body or a garment). */
export function classify(c: BodyChart, m: SkinInput): Classified {
  const { cls, n } = boneClassWeights(m);
  const width = ATOM_COUNT + 2;
  const atomW = new Float32Array(n * ATOM_COUNT);
  const ang = new Float32Array(n * GROUP_COUNT);
  const t = new Float32Array(n * GROUP_COUNT);
  const headG = GROUPS.indexOf('head'), torsoG = GROUPS.indexOf('torso');
  const iFace = atomIndex('face'), iScalp = atomIndex('scalp'), iEars = atomIndex('ears'), iFront = atomIndex('torsoFront'), iBack = atomIndex('torsoBack');
  for (let v = 0; v < n; v++) {
    const p: V3 = [m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]];
    for (let g = 0; g < GROUP_COUNT; g++) { const k = chartCoords(c, g, p); ang[v * GROUP_COUNT + g] = k.ang; t[v * GROUP_COUNT + g] = k.t; }
    for (let a = 0; a < ATOM_COUNT; a++) atomW[v * ATOM_COUNT + a] = cls[v * width + a];
    const wh = cls[v * width + ATOM_COUNT];
    if (wh > 0) {
      // the face: in front of the plane through the ears, below the hairline (measured off both kits' heads)
      const d = sub(p, c.groups[headG].o);
      const f = dot(d, c.fwd);
      const h = t[v * GROUP_COUNT + headG];
      const face = smooth(c.face.front - c.face.soft, c.face.front + c.face.soft, f) * (1 - smooth(c.face.top - c.face.soft, c.face.top + c.face.soft, h));
      // phase 4a: the ears come off the head first (far out to the side, inside the ear's band)
      const E = c.ears;
      const lat = Math.abs(dot(d, c.left));
      const ear = smooth(E.lateral - E.soft, E.lateral + E.soft, lat)
        * smooth(E.hLo - 2 * E.soft, E.hLo + 2 * E.soft, h) * (1 - smooth(E.hHi - 2 * E.soft, E.hHi + 2 * E.soft, h))
        * smooth(E.fLo - 2 * E.soft, E.fLo + 2 * E.soft, f) * (1 - smooth(E.fHi - 2 * E.soft, E.fHi + 2 * E.soft, f));
      atomW[v * ATOM_COUNT + iEars] += wh * ear;
      atomW[v * ATOM_COUNT + iFace] += wh * (1 - ear) * face;
      atomW[v * ATOM_COUNT + iScalp] += wh * (1 - ear) * (1 - face);
    }
    const wt = cls[v * width + ATOM_COUNT + 1];
    if (wt > 0) {
      const cosA = Math.cos(ang[v * GROUP_COUNT + torsoG]);
      const front = smooth(-0.12, 0.12, cosA);
      atomW[v * ATOM_COUNT + iFront] += wt * front;
      atomW[v * ATOM_COUNT + iBack] += wt * (1 - front);
    }
  }
  return { n, atomW, ang, t };
}
