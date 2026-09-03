/**
 * FEL AVATAR FORGE — builds the hero avatar from nothing but code.
 *
 *   npx tsx scripts/avatar/forge.mts [--out scripts/avatar/out/fel-hero.glb]
 *
 * Why this exists
 * ---------------
 * The Meshy hero (elijah-hero.glb) is retired: its baked clips scramble the
 * pose (NullEngine probe, 2026-05: hands above the head during `run`), and an
 * asset we cannot author is an asset we cannot fix. The forge is the W path:
 * a fully procedural, spec-conformant (docs/avatar/AvatarSkeletonSpec.md)
 * avatar — rig, geometry, clothing, texture, and all nine gameplay clips are
 * AUTHORED HERE, by us, so every future issue is debuggable source, not a
 * black-box export.
 *
 * Design rules
 * ------------
 *  - 22 required bones, UNPREFIXED, identity rest rotations, translations
 *    only. A clean rig means a rotation about +X does the same thing on every
 *    bone — no per-rig sign tables, ever again.
 *  - Bind pose == node rest == skin bind (IBM = translate(-bindPos)). No
 *    divergence between node TRS and skin matrices (the Meshy failure mode).
 *  - Clip poses are authored as WORLD-space rotation deltas per bone and
 *    converted to bone-local quats against our own hierarchy, so the
 *    authoring vocabulary is anatomical ("thigh forward 45°"), not numeric.
 *  - Named materials are the customization contract: skin / jersey / shorts /
 *    shoes / hair. Character customization (lib/babylon/avatar/avatarRecipe.ts)
 *    and the athlete roster key off these names. Rename them and both break.
 *  - Output feeds scripts/avatar/pipeline.mts (self-normalize) and must pass
 *    scripts/avatar/validate-pose.mts before it ships.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Document, NodeIO, type Node, type Accessor } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

// ── skeleton ────────────────────────────────────────────────────────────────
// [name, parent, world bind position] — character faces +Z, Left = +X.
type BoneDef = [string, string | null, [number, number, number]];
const BONES: BoneDef[] = [
  ['Hips', null, [0, 0.96, 0]],
  ['Spine', 'Hips', [0, 1.08, 0]],
  ['Spine1', 'Spine', [0, 1.22, 0]],
  ['Spine2', 'Spine1', [0, 1.36, 0]],
  ['Neck', 'Spine2', [0, 1.50, 0]],
  ['Head', 'Neck', [0, 1.60, 0]],
  ['LeftShoulder', 'Spine2', [0.07, 1.46, 0]],
  ['LeftArm', 'LeftShoulder', [0.18, 1.47, 0]],
  ['LeftForeArm', 'LeftArm', [0.46, 1.47, 0]],
  ['LeftHand', 'LeftForeArm', [0.72, 1.47, 0]],
  ['RightShoulder', 'Spine2', [-0.07, 1.46, 0]],
  ['RightArm', 'RightShoulder', [-0.18, 1.47, 0]],
  ['RightForeArm', 'RightArm', [-0.46, 1.47, 0]],
  ['RightHand', 'RightForeArm', [-0.72, 1.47, 0]],
  ['LeftUpLeg', 'Hips', [0.11, 0.92, 0]],
  ['LeftLeg', 'LeftUpLeg', [0.11, 0.50, 0]],
  ['LeftFoot', 'LeftLeg', [0.11, 0.10, 0]],
  ['LeftToeBase', 'LeftFoot', [0.11, 0.035, 0.09]],
  ['RightUpLeg', 'Hips', [-0.11, 0.92, 0]],
  ['RightLeg', 'RightUpLeg', [-0.11, 0.50, 0]],
  ['RightFoot', 'RightLeg', [-0.11, 0.10, 0]],
  ['RightToeBase', 'RightFoot', [-0.11, 0.035, 0.09]],
];
const bonePos = new Map(BONES.map(([n, , p]) => [n, p]));
const boneParent = new Map(BONES.map(([n, p]) => [n, p]));

// ── quaternion helpers (right-handed, glTF space) ───────────────────────────
type Quat = [number, number, number, number];
const D2R = Math.PI / 180;
const qAxis = (axis: 'x' | 'y' | 'z', deg: number): Quat => {
  const h = deg * D2R / 2, s = Math.sin(h), c = Math.cos(h);
  return axis === 'x' ? [s, 0, 0, c] : axis === 'y' ? [0, s, 0, c] : [0, 0, s, c];
};
const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qInv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** A pose is a map of bone → WORLD-space rotation delta from rest. */
type Pose = Record<string, Quat>;

/** Convert a world-delta pose into bone-local quats against our hierarchy. */
function poseToLocals(pose: Pose): Map<string, Quat> {
  const world = new Map<string, Quat>();
  const locals = new Map<string, Quat>();
  const solve = (name: string): Quat => {
    if (world.has(name)) return world.get(name)!;
    const parent = boneParent.get(name);
    const parentWorld = parent ? solve(parent) : ([0, 0, 0, 1] as Quat);
    const delta = pose[name] ?? ([0, 0, 0, 1] as Quat);
    const w = qNorm(qMul(parentWorld, delta));
    world.set(name, w);
    locals.set(name, qNorm(qMul(qInv(parentWorld), w)));
    return w;
  };
  for (const [name] of BONES) solve(name);
  return locals;
}

/** Compose world deltas: q('x', a) THEN q('y', b) etc. in listed order. */
const chain = (...qs: Quat[]): Quat => qs.reduce((acc, q) => qNorm(qMul(acc, q)), [0, 0, 0, 1] as Quat);

// ── clip authoring ──────────────────────────────────────────────────────────
interface ClipKey { t: number; pose: Pose }
interface ClipDef { name: string; duration: number; loop: boolean; keys: ClipKey[] }

const armsDown: Pose = {
  LeftArm: qAxis('z', -75), RightArm: qAxis('z', 75),
  LeftForeArm: qAxis('z', -12), RightForeArm: qAxis('z', 12),
};

function locomotion(duration: number, thighDeg: number, kneeBase: number, kneeAmp: number, armSwing: number, elbowFlex: number, sway: number): ClipKey[] {
  const keys: ClipKey[] = [];
  const N = 8;
  for (let k = 0; k <= N; k++) {
    const t = (duration * k) / N;
    const phi = (2 * Math.PI * k) / N;
    const s = Math.sin(phi);
    const kneeL = kneeBase + kneeAmp * (1 - Math.cos(phi));
    const kneeR = kneeBase + kneeAmp * (1 - Math.cos(phi + Math.PI));
    keys.push({
      t,
      pose: {
        ...armsDown,
        Spine: qAxis('x', 5),
        Spine2: qAxis('z', sway * s),
        Hips: qAxis('y', sway * 1.4 * s),
        Head: qAxis('x', -4),
        LeftUpLeg: qAxis('x', -thighDeg * s),
        RightUpLeg: qAxis('x', thighDeg * s),
        LeftLeg: qAxis('x', kneeL),
        RightLeg: qAxis('x', kneeR),
        LeftFoot: qAxis('x', -kneeL * 0.4 + thighDeg * 0.3 * s),
        RightFoot: qAxis('x', -kneeR * 0.4 - thighDeg * 0.3 * s),
        LeftArm: chain(qAxis('z', -75), qAxis('x', armSwing * s)),
        RightArm: chain(qAxis('z', 75), qAxis('x', armSwing * s)),
        LeftForeArm: chain(qAxis('z', -12), qAxis('x', -elbowFlex)),
        RightForeArm: chain(qAxis('z', 12), qAxis('x', -elbowFlex)),
      },
    });
  }
  return keys;
}

const guardPose: Pose = {
  ...armsDown,
  LeftArm: chain(qAxis('z', -35), qAxis('x', -50)),
  RightArm: chain(qAxis('z', 35), qAxis('x', -50)),
  LeftForeArm: chain(qAxis('z', -10), qAxis('x', -75)),
  RightForeArm: chain(qAxis('z', 10), qAxis('x', -75)),
  LeftUpLeg: qAxis('y', 10), RightUpLeg: qAxis('y', -10),
  Spine: qAxis('x', 4),
};

const CLIPS: ClipDef[] = [
  // idle_stand MUST stay first: the Babylon glTF loader initializes animated
  // node TRS from the first frame of the first animation in the file, so this
  // clip's first key IS the loaded rest state. Arms-down here means the
  // character is never seen at bind pose — the T-pose is structurally
  // unreachable. (Empirically verified on both this asset and the retired
  // Meshy hero via NullEngine probe.)
  {
    name: 'idle_stand', duration: 3.0, loop: true,
    keys: [0, 1.5, 3.0].map((t) => ({
      t,
      pose: {
        ...armsDown,
        Spine: qAxis('x', 2 + 2.5 * Math.sin(2 * Math.PI * t / 3)),
        Neck: qAxis('y', 3 * Math.sin(2 * Math.PI * t / 3)),
        LeftArm: chain(qAxis('z', -75), qAxis('x', 3 * Math.sin(2 * Math.PI * t / 3))),
        RightArm: chain(qAxis('z', 75), qAxis('x', 3 * Math.sin(2 * Math.PI * t / 3))),
      },
    })),
  },
  { name: 'run', duration: 0.6, loop: true, keys: locomotion(0.6, 42, 18, 22, 26, 30, 3.5) },
  { name: 'walk', duration: 1.0, loop: true, keys: locomotion(1.0, 24, 8, 10, 13, 14, 2) },
  {
    name: 'guard', duration: 1.2, loop: true,
    keys: [0, 0.3, 0.6, 0.9, 1.2].map((t) => ({
      t,
      pose: { ...guardPose, Spine: qAxis('x', 4 + 2.5 * Math.sin(2 * Math.PI * t / 0.6)) },
    })),
  },
  {
    name: 'jab', duration: 0.5, loop: false,
    keys: [
      { t: 0, pose: guardPose },
      {
        t: 0.15, pose: {
          ...guardPose,
          LeftArm: chain(qAxis('z', -82), qAxis('x', -88)),
          LeftForeArm: qAxis('z', -4),
          Hips: qAxis('y', -12), Spine2: qAxis('y', -8),
        },
      },
      { t: 0.5, pose: guardPose },
    ],
  },
  {
    name: 'hook', duration: 0.6, loop: false,
    keys: [
      { t: 0, pose: guardPose },
      {
        t: 0.2, pose: {
          ...guardPose,
          RightArm: chain(qAxis('z', 12), qAxis('y', 55)),
          RightForeArm: chain(qAxis('z', 8), qAxis('x', -85)),
          Hips: qAxis('y', 10),
        },
      },
      {
        t: 0.35, pose: {
          ...guardPose,
          RightArm: chain(qAxis('z', 12), qAxis('y', -45)),
          RightForeArm: chain(qAxis('z', 8), qAxis('x', -85)),
          Hips: qAxis('y', -16), Spine2: qAxis('y', -10),
        },
      },
      { t: 0.6, pose: guardPose },
    ],
  },
  {
    name: 'uppercut', duration: 0.7, loop: false,
    keys: [
      { t: 0, pose: guardPose },
      {
        t: 0.22, pose: {
          ...guardPose,
          LeftUpLeg: qAxis('x', -18), RightUpLeg: qAxis('x', -18),
          LeftLeg: qAxis('x', 42), RightLeg: qAxis('x', 42),
          Spine: qAxis('x', 12),
          RightArm: chain(qAxis('z', 60), qAxis('x', 25)),
          Hips: qAxis('y', 12),
        },
      },
      {
        t: 0.42, pose: {
          ...guardPose,
          RightArm: chain(qAxis('z', 55), qAxis('x', -70)),
          RightForeArm: chain(qAxis('z', 10), qAxis('x', -95)),
          Spine: qAxis('x', -4), Hips: qAxis('y', -14), Spine2: qAxis('y', -8),
        },
      },
      { t: 0.7, pose: guardPose },
    ],
  },
  {
    name: 'roundhouse', duration: 0.8, loop: false,
    keys: [
      { t: 0, pose: armsDown },
      {
        t: 0.25, pose: {
          ...armsDown,
          RightUpLeg: chain(qAxis('x', -80), qAxis('y', 25)),
          RightLeg: qAxis('x', 95),
          LeftArm: chain(qAxis('z', -45), qAxis('x', -20)),
          RightArm: chain(qAxis('z', 55), qAxis('x', 15)),
          Spine: qAxis('x', 6),
        },
      },
      {
        t: 0.45, pose: {
          ...armsDown,
          RightUpLeg: chain(qAxis('x', -85), qAxis('y', -65)),
          RightLeg: qAxis('x', 12),
          LeftArm: chain(qAxis('z', -55), qAxis('x', -25)),
          RightArm: chain(qAxis('z', 60), qAxis('x', 20)),
          Hips: qAxis('y', -25), Spine: qAxis('x', 8),
        },
      },
      { t: 0.8, pose: armsDown },
    ],
  },
  {
    name: 'high_kick', duration: 0.7, loop: false,
    keys: [
      { t: 0, pose: armsDown },
      {
        t: 0.28, pose: {
          ...armsDown,
          RightUpLeg: qAxis('x', -108),
          RightLeg: qAxis('x', 6),
          RightFoot: qAxis('x', 20),
          Spine: qAxis('x', 10),
          LeftArm: chain(qAxis('z', -40), qAxis('x', -15)),
          RightArm: chain(qAxis('z', 40), qAxis('x', -15)),
        },
      },
      { t: 0.7, pose: armsDown },
    ],
  },
  {
    name: 'jumpshot', duration: 0.9, loop: false,
    keys: [
      { t: 0, pose: armsDown },
      {
        t: 0.25, pose: {
          ...armsDown,
          LeftUpLeg: qAxis('x', -22), RightUpLeg: qAxis('x', -22),
          LeftLeg: qAxis('x', 55), RightLeg: qAxis('x', 55),
          LeftFoot: qAxis('x', -25), RightFoot: qAxis('x', -25),
          Spine: qAxis('x', 8),
          LeftArm: chain(qAxis('z', -60), qAxis('x', -25)),
          RightArm: chain(qAxis('z', 60), qAxis('x', -25)),
        },
      },
      {
        t: 0.5, pose: {
          LeftArm: chain(qAxis('z', -160), qAxis('x', -12)),
          RightArm: chain(qAxis('z', 150), qAxis('x', -18)),
          LeftForeArm: qAxis('z', -15),
          RightForeArm: chain(qAxis('z', 12), qAxis('x', -35)),
          Spine: qAxis('x', -6), Head: qAxis('x', -6),
        },
      },
      { t: 0.65, pose: {
          LeftArm: chain(qAxis('z', -150), qAxis('x', -30)),
          RightArm: chain(qAxis('z', 140), qAxis('x', -45)),
          RightForeArm: qAxis('z', 8),
          Spine: qAxis('x', -4),
        } },
      { t: 0.9, pose: armsDown },
    ],
  },
];

// ── geometry ────────────────────────────────────────────────────────────────
interface Part {
  material: string;
  positions: number[]; normals: number[]; uvs: number[];
  indices: number[]; joints: number[]; weights: number[];
}
const boneIndex = new Map(BONES.map(([n], i) => [n, i]));

function newPart(material: string): Part {
  return { material, positions: [], normals: [], uvs: [], indices: [], joints: [], weights: [] };
}

type Influence = [string, number][]; // [(boneName, weight)]
function pushVert(p: Part, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, inf: Influence) {
  p.positions.push(x, y, z);
  p.normals.push(nx, ny, nz);
  p.uvs.push(u, v);
  const total = inf.reduce((a, [, w]) => a + w, 0) || 1;
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  inf.slice(0, 4).forEach(([b, wt], i) => { j[i] = boneIndex.get(b)!; w[i] = wt / total; });
  p.joints.push(...j);
  p.weights.push(...w);
}

/** Tube along a principal axis with per-ring radius — limbs, torso, neck. */
function tube(p: Part, axis: 'x' | 'y', fixed: [number, number], from: number, to: number, r0: number, r1: number, segs: number, rings: number, infFor: (t: number) => Influence, rZScale = 1) {
  const base = p.positions.length / 3;
  for (let ri = 0; ri <= rings; ri++) {
    const t = ri / rings;
    const a = from + (to - from) * t;
    const r = r0 + (r1 - r0) * t;
    for (let si = 0; si <= segs; si++) {
      const th = (2 * Math.PI * si) / segs;
      const c = Math.cos(th), s = Math.sin(th);
      let x: number, y: number, z: number, nx: number, ny: number, nz: number;
      if (axis === 'y') {
        x = fixed[0] + r * c; y = a; z = fixed[1] + r * rZScale * s;
        nx = c; ny = 0; nz = s;
      } else {
        x = a; y = fixed[0] + r * c; z = fixed[1] + r * rZScale * s;
        nx = 0; ny = c; nz = s;
      }
      pushVert(p, x, y, z, nx, ny, nz, si / segs, t, infFor(t));
    }
  }
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = base + ri * (segs + 1) + si;
      const b = a + segs + 1;
      p.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/** Axis-aligned box (hands, shoes). */
function box(p: Part, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, inf: Influence, infFront?: Influence) {
  const faces: [number[], number[]][] = [
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
    [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, corners] of faces) {
    const base = p.positions.length / 3;
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    corners.forEach((c, i) => {
      const useFront = infFront && c[2] > (z0 + z1) / 2;
      pushVert(p, c[0], c[1], c[2], n[0], n[1], n[2], uv[i][0], uv[i][1], useFront ? infFront : inf);
    });
    p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** UV sphere (head, hair cap). */
function sphere(p: Part, cx: number, cy: number, cz: number, r: number, inf: Influence, opts: { lat?: number; lon?: number; keep?: (x: number, y: number, z: number) => boolean; scaleY?: number } = {}) {
  const lat = opts.lat ?? 10, lon = opts.lon ?? 12;
  const keep = opts.keep ?? (() => true);
  const idxMap = new Map<string, number>();
  const vid = (la: number, lo: number) => {
    const key = `${la}/${lo}`;
    if (idxMap.has(key)) return idxMap.get(key)!;
    const phi = (Math.PI * la) / lat;
    const th = (2 * Math.PI * lo) / lon;
    const x = cx + r * Math.sin(phi) * Math.cos(th);
    const y = cy + r * (opts.scaleY ?? 1) * Math.cos(phi);
    const z = cz + r * Math.sin(phi) * Math.sin(th);
    const id = p.positions.length / 3;
    pushVert(p, x, y, z, (x - cx) / r, (y - cy) / r, (z - cz) / r, lo / lon, la / lat, inf);
    idxMap.set(key, id);
    return id;
  };
  for (let la = 0; la < lat; la++) {
    for (let lo = 0; lo < lon; lo++) {
      const quad = [[la, lo], [la + 1, lo], [la + 1, lo + 1], [la, lo + 1]] as const;
      const pts = quad.map(([a, b]) => {
        const phi = (Math.PI * a) / lat, th = (2 * Math.PI * b) / lon;
        return [cx + r * Math.sin(phi) * Math.cos(th), cy + r * Math.cos(phi), cz + r * Math.sin(phi) * Math.sin(th)];
      });
      if (!pts.every((q) => keep(q[0], q[1], q[2]))) continue;
      const [a, b, c, d] = quad.map(([x, y]) => vid(x, y));
      p.indices.push(a, b, c, a, c, d);
    }
  }
}

// ── assemble parts ──────────────────────────────────────────────────────────
function buildParts(): Part[] {
  const parts: Part[] = [];
  const add = (m: string) => { const p = newPart(m); parts.push(p); return p; };

  // head + neck (skin)
  const skinP = add('skin');
  sphere(skinP, 0, 1.705, 0.01, 0.115, [['Head', 1]]);
  tube(skinP, 'y', [0, 0], 1.46, 1.62, 0.052, 0.048, 8, 1, () => [['Neck', 1]]);

  // hair — cap over the back/top of the skull, face left open
  const hairP = add('hair');
  sphere(hairP, 0, 1.715, -0.012, 0.122, [['Head', 1]], {
    scaleY: 0.98,
    keep: (x, y, z) => z < 0.045 || y > 1.76,
  });

  // torso (jersey) — height-banded spine weights
  const jerseyP = add('jersey');
  tube(jerseyP, 'y', [0, 0], 0.96, 1.50, 0.155, 0.185, 12, 4, (t) => {
    const y = 0.96 + t * 0.54;
    if (y < 1.08) return [['Hips', 0.4], ['Spine', 0.6]];
    if (y < 1.22) return [['Spine', 0.5], ['Spine1', 0.5]];
    if (y < 1.36) return [['Spine1', 0.5], ['Spine2', 0.5]];
    return [['Spine2', 1]];
  }, 0.68);

  // shorts (pelvis) — hips rigid
  const shortsP = add('shorts');
  tube(shortsP, 'y', [0, 0], 0.76, 1.00, 0.165, 0.16, 12, 2, () => [['Hips', 1]], 0.72);

  // arms — sleeve ring on jersey, rest skin
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? 1 : -1;
    // upper arm: sleeve portion
    tube(jerseyP, 'x', [1.47, 0], sx * 0.16, sx * 0.32, 0.058, 0.052, 8, 1, () => [[side + 'Arm', 1]]);
    // upper arm: skin portion
    tube(skinP, 'x', [1.47, 0], sx * 0.32, sx * 0.46, 0.052, 0.044, 8, 1, () => [[side + 'Arm', 1]]);
    // forearm
    tube(skinP, 'x', [1.47, 0], sx * 0.46, sx * 0.72, 0.044, 0.034, 8, 2,
      (t) => t < 0.25 ? [[side + 'Arm', 0.35], [side + 'ForeArm', 0.65]] : [[side + 'ForeArm', 1]]);
    // hand
    box(skinP, Math.min(sx * 0.72, sx * 0.84), Math.max(sx * 0.72, sx * 0.84), 1.425, 1.515, -0.032, 0.05, [[side + 'Hand', 1]]);
  }

  // legs (skin) + shoes
  for (const side of ['Left', 'Right'] as const) {
    const x = side === 'Left' ? 0.11 : -0.11;
    tube(skinP, 'y', [x, 0], 0.52, 0.90, 0.062, 0.078, 8, 2,
      (t) => t > 0.8 ? [[side + 'UpLeg', 0.7], ['Hips', 0.3]] : [[side + 'UpLeg', 1]]);
    tube(skinP, 'y', [x, 0], 0.10, 0.52, 0.04, 0.06, 8, 2,
      (t) => t > 0.8 ? [[side + 'Leg', 0.7], [side + 'UpLeg', 0.3]] : [[side + 'Leg', 1]]);
    const shoesP = add('shoes');
    box(shoesP, x - 0.055, x + 0.055, 0.0, 0.105, -0.065, 0.175,
      [[side + 'Foot', 1]], [[side + 'ToeBase', 1]]);
  }
  return parts;
}

// ── detail texture (128×128 fabric noise, white-based so factors tint) ──────
function crc32(buf: Buffer): number {
  let c, table = (crc32 as any)._t;
  if (!table) {
    table = (crc32 as any)._t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makeDetailPng(): Buffer {
  const S = 128;
  const raw = Buffer.alloc(S * (1 + S * 4));
  let o = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0;
    for (let x = 0; x < S; x++) {
      const weave = 6 * Math.sin(x * 0.9) * Math.sin(y * 0.9);
      const v = 243 + weave + (rnd() - 0.5) * 14;
      for (let c = 0; c < 3; c++) raw[o++] = Math.max(0, Math.min(255, Math.round(v)));
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── build document ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : 'scripts/avatar/out/fel-hero.glb';

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Scene');
doc.getRoot().setDefaultScene(scene);

const acc = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4', arr: Float32Array | Uint16Array): Accessor =>
  doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

// nodes
const nodeByName = new Map<string, Node>();
const armature = doc.createNode('Armature');
scene.addChild(armature);
for (const [name, parent, pos] of BONES) {
  const node = doc.createNode(name);
  const pp = parent ? bonePos.get(parent)! : [0, 0, 0];
  node.setTranslation([pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]]);
  nodeByName.set(name, node);
  if (parent) nodeByName.get(parent)!.addChild(node);
  else armature.addChild(node);
}

// skin (IBM = translate(-bindPos); rest rotations are identity)
const ibm = new Float32Array(BONES.length * 16);
BONES.forEach(([, , p], i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
});
const skin = doc.createSkin('Skeleton')
  .setInverseBindMatrices(acc('MAT4', ibm))
  .setSkeleton(nodeByName.get('Hips')!);
for (const [name] of BONES) skin.addJoint(nodeByName.get(name)!);

// materials
const detailTex = doc.createTexture('detail').setImage(makeDetailPng()).setMimeType('image/png');
const MAT_COLORS: Record<string, [number, number, number]> = {
  skin: [0.78, 0.55, 0.36],
  jersey: [0.72, 0.14, 0.17],
  shorts: [0.10, 0.13, 0.34],
  shoes: [0.88, 0.88, 0.86],
  hair: [0.10, 0.07, 0.05],
};
const materials = new Map(Object.entries(MAT_COLORS).map(([name, rgb]) => [
  name,
  doc.createMaterial(name)
    .setBaseColorFactor([...rgb, 1])
    .setBaseColorTexture(detailTex)
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0),
]));

// mesh — one primitive per part
const mesh = doc.createMesh('AthleteBody');
for (const part of buildParts()) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(part.positions)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(part.normals)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(part.uvs)))
    .setAttribute('JOINTS_0', acc('VEC4', new Float32Array(part.joints)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(part.weights)))
    .setIndices(acc('SCALAR', new Uint16Array(part.indices)))
    .setMaterial(materials.get(part.material)!);
  mesh.addPrimitive(prim);
}
const body = doc.createNode('Body').setMesh(mesh).setSkin(skin);
armature.addChild(body);

// animations — sample each bone's local quat at the union of its key times
const FPS = 30;
for (const clip of CLIPS) {
  const anim = doc.createAnimation(clip.name);
  const sampler = doc.createAnimationSampler().setInterpolation('LINEAR');
  // collect per-bone series
  const perBone = new Map<string, { t: number[]; q: Quat[] }>();
  for (const key of clip.keys) {
    const locals = poseToLocals(key.pose);
    for (const [name] of BONES) {
      if (!perBone.has(name)) perBone.set(name, { t: [], q: [] });
      perBone.get(name)!.t.push(key.t);
      perBone.get(name)!.q.push(locals.get(name)!);
    }
  }
  for (const [name, series] of perBone) {
    // ensure quaternion hemisphere continuity for LINEAR interpolation
    for (let i = 1; i < series.q.length; i++) {
      const a = series.q[i - 1], b = series.q[i];
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) {
        series.q[i] = [-b[0], -b[1], -b[2], -b[3]];
      }
    }
    const input = acc('SCALAR', new Float32Array(series.t));
    const output = acc('VEC4', new Float32Array(series.q.flat()));
    const s = doc.createAnimationSampler().setInterpolation('LINEAR').setInput(input).setOutput(output);
    const ch = doc.createAnimationChannel()
      .setTargetNode(nodeByName.get(name)!)
      .setTargetPath('rotation')
      .setSampler(s);
    anim.addSampler(s).addChannel(ch);
  }
  void sampler;
}

mkdirSync(dirname(outPath), { recursive: true });
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
await io.write(outPath, doc);

// sibling manifest — pipeline.mts inherits loop flags from it
const manifest = {
  fps: FPS,
  clips: CLIPS.map((c) => ({ name: c.name, loop: c.loop, seconds: c.duration })),
};
writeFileSync(outPath.replace(/\.glb$/, '.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`✔ FORGED ${outPath}`);
console.log(`  bones ${BONES.length} · clips ${CLIPS.length} (${CLIPS.map((c) => c.name).join(', ')})`);
console.log(`  materials: ${[...materials.keys()].join(', ')} (customization contract)`);
console.log(`  next: npx tsx scripts/avatar/validate-pose.mts ${outPath}`);
