// sources — every capture the opponents' motion comes from, read into ONE joint stream (EVERYONE-BODY-MOCAP-OPPONENTS,
// 2026-09-14). lib/babylon/anim/mocapRetarget.ts takes it from there.
//
//   deepmotion  the owner's takes (.bvh): Mixamo names without the prefix, cm, 24–60 fps.   Owner's own capture.
//   cmu         CMU Graphics Lab subject 06 (.bvh, the cgspeed DAZ-friendly conversion): hip / abdomen / chest / rShldr…,
//               120 fps. License: free to include in commercially-sold products; the data itself may not be resold,
//               even converted (mocap.cs.cmu.edu). Owner approved these terms 2026-09-14.
//   ual         Quaternius Universal Animation Library 2 [Standard] (.glb): UE mannequin names (pelvis, upperarm_l…),
//               one glTF animation per move. CC0 1.0.
import { readFileSync } from 'node:fs';
import { NodeIO, type Node as GNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as bvhNs from '../../lib/babylon/anim/bvh.ts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const B = ((bvhNs as unknown as { default?: typeof bvhNs }).default ?? bvhNs) as typeof bvhNs;
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;
type V3 = [number, number, number];
type Canon = (typeof RT.CANON)[number];
export type JointStream = { fps: number; frames: Record<Canon, V3>[]; up?: V3 };

export type SourceKind = 'deepmotion' | 'cmu' | 'ual' | 'meshy';

export const LICENSE: Record<SourceKind, string> = {
  deepmotion: "owner's own DeepMotion capture",
  cmu: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu) — free in commercial products, not for resale of the data',
  ual: 'Quaternius Universal Animation Library 2 — CC0 1.0',
  meshy: "owner's Meshy animation exports (~/Downloads/FEL_hero_upload/Elijah*.glb)",
};

const MAPS: Record<SourceKind, Record<Canon, string>> = {
  deepmotion: {
    Hips: 'Hips', Chest: 'Spine2', Neck: 'Neck', Head: 'Head',
    LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
    LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', LeftToe: 'LeftToeBase', RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot', RightToe: 'RightToeBase',
  },
  cmu: {
    Hips: 'hip', Chest: 'chest', Neck: 'neck', Head: 'head',
    LeftArm: 'lShldr', LeftForeArm: 'lForeArm', LeftHand: 'lHand', RightArm: 'rShldr', RightForeArm: 'rForeArm', RightHand: 'rHand',
    LeftUpLeg: 'lThigh', LeftLeg: 'lShin', LeftFoot: 'lFoot', LeftToe: 'lFootEnd', RightUpLeg: 'rThigh', RightLeg: 'rShin', RightFoot: 'rFoot', RightToe: 'rFootEnd',
  },
  meshy: {
    Hips: 'Hips', Chest: 'Spine02', Neck: 'neck', Head: 'Head',
    LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
    LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', LeftToe: 'LeftToeBase', RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot', RightToe: 'RightToeBase',
  },
  ual: {
    Hips: 'pelvis', Chest: 'spine_03', Neck: 'neck_01', Head: 'Head',
    LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
    LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToe: 'ball_l', RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToe: 'ball_r',
  },
};

export function readBvhStream(file: string, kind: 'deepmotion' | 'cmu'): JointStream {
  const bvh = B.parseBvh(readFileSync(file, 'utf8'));
  const map = MAPS[kind];
  const idx = Object.fromEntries(RT.CANON.map((c) => {
    const i = B.jointIndex(bvh, map[c]);
    if (i < 0) throw new Error(`[sources] ${file}: no joint "${map[c]}" for ${c}`);
    return [c, i];
  })) as Record<Canon, number>;
  const frames = bvh.frames.map((_, f) => {
    const fk = B.forwardKinematics(bvh, f);
    return Object.fromEntries(RT.CANON.map((c) => [c, fk.pos[idx[c]]])) as Record<Canon, V3>;
  });
  return { fps: 1 / bvh.frameTime, frames };
}

// ── glTF: sample each node's TRS at t, compose world matrices down the hierarchy ──────────────────────────────────
type Q = [number, number, number, number];
const qmul = (a: Q, b: Q): Q => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q: Q, v: V3): V3 => { const [x, y, z, w] = q; const uv: V3 = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]]; const uuv: V3 = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]]; return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])]; };
function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b; d = Math.abs(d);
  if (d > 0.9995) { const r: Q = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]; const n = Math.hypot(...r); return [r[0] / n, r[1] / n, r[2] / n, r[3] / n]; }
  const th = Math.acos(d), s0 = Math.sin((1 - t) * th) / Math.sin(th), s1 = Math.sin(t * th) / Math.sin(th);
  return [a[0] * s0 + bb[0] * s1, a[1] * s0 + bb[1] * s1, a[2] * s0 + bb[2] * s1, a[3] * s0 + bb[3] * s1];
}

const glbCache = new Map<string, Awaited<ReturnType<NodeIO['read']>>>();
export async function listGlbAnimations(file: string): Promise<{ name: string; duration: number }[]> {
  const doc = await loadGlb(file);
  return doc.getRoot().listAnimations().map((a) => ({ name: a.getName(), duration: Math.max(...a.listSamplers().map((s) => { const t = s.getInput()!.getArray()!; return t[t.length - 1]; })) }));
}
async function loadGlb(file: string) {
  let d = glbCache.get(file);
  if (!d) { d = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file); glbCache.set(file, d); }
  return d;
}

export async function readGlbStream(file: string, animName: string, fps = 30, kind: 'ual' | 'meshy' = 'ual'): Promise<JointStream> {
  const doc = await loadGlb(file);
  const root = doc.getRoot();
  const anim = root.listAnimations().find((a) => a.getName() === animName);
  if (!anim) throw new Error(`[sources] ${file}: no animation "${animName}"`);
  type Track = [Float32Array, Float32Array, boolean];   // input, output, STEP
  const tracks = new Map<GNode, { T?: Track; R?: Track; S?: Track }>();
  let dur = 0;
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode(), s = ch.getSampler(); if (!n || !s) continue;
    const inp = s.getInput()!.getArray() as Float32Array, out = s.getOutput()!.getArray() as Float32Array;
    dur = Math.max(dur, inp[inp.length - 1]);
    const e = tracks.get(n) ?? {}; const path = ch.getTargetPath();
    const tr: Track = [inp, out, s.getInterpolation() === 'STEP'];
    if (path === 'translation') e.T = tr; else if (path === 'rotation') e.R = tr; else if (path === 'scale') e.S = tr;
    tracks.set(n, e);
  }
  const parent = new Map<GNode, GNode>();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const sample = (tr: Track | undefined, t: number, k: 3 | 4, def: number[]) => {
    if (!tr) return def;
    const [inp, out, step] = tr; let i = 0; while (i < inp.length - 2 && inp[i + 1] < t) i++;
    const u = step || inp.length < 2 ? 0 : Math.max(0, Math.min(1, (t - inp[i]) / ((inp[i + 1] - inp[i]) || 1)));
    const a = Array.from(out.slice(i * k, i * k + k)), b = Array.from(out.slice((i + 1) * k, (i + 1) * k + k));
    if (b.length < k) return a;
    return k === 4 ? slerp(a as Q, b as Q, u) : a.map((v, j) => v + (b[j] - v) * u);
  };
  const map = MAPS[kind];
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const frames: Record<Canon, V3>[] = [];
  const N = Math.max(2, Math.round(dur * fps) + 1);
  for (let f = 0; f < N; f++) {
    const t = Math.min(dur, f / fps);
    const world = new Map<GNode, { p: V3; q: Q; s: V3 }>();
    const w = (n: GNode): { p: V3; q: Q; s: V3 } => {
      const hit = world.get(n); if (hit) return hit;
      const tr = tracks.get(n);
      const lp = sample(tr?.T, t, 3, n.getTranslation()) as V3, lq = sample(tr?.R, t, 4, n.getRotation()) as Q, ls = sample(tr?.S, t, 3, n.getScale()) as V3;
      const par = parent.get(n);
      let res: { p: V3; q: Q; s: V3 };
      if (!par) res = { p: lp, q: lq, s: ls };
      else { const P = w(par); const o = qrot(P.q, [lp[0] * P.s[0], lp[1] * P.s[1], lp[2] * P.s[2]]); res = { p: [P.p[0] + o[0], P.p[1] + o[1], P.p[2] + o[2]], q: qmul(P.q, lq), s: [P.s[0] * ls[0], P.s[1] * ls[1], P.s[2] * ls[2]] }; }
      world.set(n, res); return res;
    };
    frames.push(Object.fromEntries(RT.CANON.map((c) => {
      const n = byName.get(map[c]); if (!n) throw new Error(`[sources] ${file}: no node "${map[c]}"`);
      return [c, w(n).p];
    })) as Record<Canon, V3>);
  }
  // Meshy's exports are not reliably Y-up (the running clip lies along Z). The body says which way is up: the median
  // direction from between the feet to the head. Only for meshy — a UAL knockdown lies down on purpose.
  if (kind === 'meshy') {
    const ups = frames.map((f) => { const m: V3 = [(f.LeftFoot[0] + f.RightFoot[0]) / 2, (f.LeftFoot[1] + f.RightFoot[1]) / 2, (f.LeftFoot[2] + f.RightFoot[2]) / 2]; const d: V3 = [f.Head[0] - m[0], f.Head[1] - m[1], f.Head[2] - m[2]]; const l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l] as V3; });
    const med = (i: 0 | 1 | 2) => [...ups.map((u) => u[i])].sort((a, b) => a - b)[Math.floor(ups.length / 2)];
    const u: V3 = [med(0), med(1), med(2)]; const l = Math.hypot(...u) || 1;
    return { fps, frames, up: [u[0] / l, u[1] / l, u[2] / l] };
  }
  return { fps, frames };
}
