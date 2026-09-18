// Ship pass 3, rung 4 — the owner's DeepMotion take → a clip for the hero.
//   inventory → SEGMENT (motion energy) → RETARGET (bone-name map, root motion
//   dropped, toes dropped) → a JSON clip under public/models/clips/mocap/.
// The runtime builds it with buildQuatClip on the live skeleton (like the
// authored suite), so nothing here depends on Blender.
//   npx tsx scripts/mocap/retarget.mts public/models/clips/golf_swing.glb golf_swing_full [--lead 0.4 --tail 0.3]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FEL_BONES = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
const ENERGY_BONES = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine', 'Hips']);
const strip = (n: string) => n.replace(/^mixamorig:?/, '');
const qAngle = (a: number[], b: number[]) => 2 * Math.acos(Math.min(1, Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])));

export interface MocapPoseKey { t: number; bones?: Record<string, [number, number, number]>; hands?: { Left?: [number, number, number]; Right?: [number, number, number] }; feet?: { Left?: [number, number, number]; Right?: [number, number, number] }; hipsY?: number }
export interface MocapClipJson { name: string; source: string; segment: [number, number]; duration: number; tracks: Record<string, [number, number, number, number, number][]>; poseKeys?: MocapPoseKey[] }

// ── Forward kinematics of the take → pose keys ─────────────────────────────
// The take's local rotations only mean the same thing on a rig with the same
// bind frames. Wrists and ankles as hips-relative TARGETS mean the same thing
// on any body: the runtime fits them with the two-bone solver (poseClip.ts).
// glTF → Babylon world is an x-mirror (the importer's root), so x is negated.
type V = [number, number, number]; type Q = [number, number, number, number];
const qMul = (a: Q, b: Q): Q => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
const qRot = (q: Q, v: V): V => { const u: V = [q[0], q[1], q[2]], w = q[3]; const uv: V = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]; const uuv: V = [u[1]*uv[2]-u[2]*uv[1], u[2]*uv[0]-u[0]*uv[2], u[0]*uv[1]-u[1]*uv[0]]; return [v[0] + 2*(w*uv[0] + uuv[0]), v[1] + 2*(w*uv[1] + uuv[1]), v[2] + 2*(w*uv[2] + uuv[2])]; };
const slerp = (a: Q, b: Q, t: number): Q => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b; d = Math.abs(d); if (d > 0.9995) { const r: Q = [a[0]+(bb[0]-a[0])*t, a[1]+(bb[1]-a[1])*t, a[2]+(bb[2]-a[2])*t, a[3]+(bb[3]-a[3])*t]; const n = Math.hypot(...r); return [r[0]/n, r[1]/n, r[2]/n, r[3]/n]; } const th = Math.acos(d), s0 = Math.sin((1-t)*th)/Math.sin(th), s1 = Math.sin(t*th)/Math.sin(th); return [a[0]*s0+bb[0]*s1, a[1]*s0+bb[1]*s1, a[2]*s0+bb[2]*s1, a[3]*s0+bb[3]*s1]; };

export function poseKeysFromTake(doc: import('@gltf-transform/core').Document, tracks: Record<string, { t: number[]; q: number[][] }>, t0: number, t1: number, step = 1 / 15, grip = 0): MocapPoseKey[] {
  const nodes = doc.getRoot().listNodes();
  const parent = new Map<import('@gltf-transform/core').Node, import('@gltf-transform/core').Node>();
  for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
  const byBone = new Map<string, import('@gltf-transform/core').Node>(); for (const n of nodes) byBone.set(strip(n.getName()), n);
  const hipsN = byBone.get('Hips'); if (!hipsN) return [];
  const sample = (bone: string, time: number): Q | null => {
    const tr = tracks[bone]; if (!tr) return null;
    let i = tr.t.findIndex((v) => v >= time); if (i < 0) return tr.q[tr.q.length - 1] as Q; if (i === 0) return tr.q[0] as Q;
    const f = (time - tr.t[i - 1]) / Math.max(1e-6, tr.t[i] - tr.t[i - 1]); return slerp(tr.q[i - 1] as Q, tr.q[i] as Q, f);
  };
  // world transform of a node at `time`: walk up to the scene root
  const world = (n: import('@gltf-transform/core').Node, time: number): { p: V; q: Q } => {
    const chain: import('@gltf-transform/core').Node[] = []; for (let c: import('@gltf-transform/core').Node | undefined = n; c; c = parent.get(c)) chain.unshift(c);
    let p: V = [0, 0, 0], q: Q = [0, 0, 0, 1], s: V = [1, 1, 1];
    for (const c of chain) {
      const lt = c.getTranslation() as V, ls = c.getScale() as V; const lq = (sample(strip(c.getName()), time) ?? (c.getRotation() as Q));
      const scaled: V = [lt[0]*s[0], lt[1]*s[1], lt[2]*s[2]]; const r = qRot(q, scaled); p = [p[0]+r[0], p[1]+r[1], p[2]+r[2]]; q = qMul(q, lq); s = [s[0]*ls[0], s[1]*ls[1], s[2]*ls[2]];
    }
    return { p, q };
  };
  const rel = (bone: string, time: number, hips: V): V | null => { const n = byBone.get(bone); if (!n) return null; const w = world(n, time).p; return [-(w[0] - hips[0]), w[1] - hips[1], w[2] - hips[2]]; };
  // body scale: the take's hips height at rest vs the reference hips (0.96 m)
  const hips0 = world(hipsN, t0).p; const legN = byBone.get('LeftFoot'); const legLen = legN ? Math.abs(hips0[1] - world(legN, t0).p[1]) : 0.9;
  const SCALE = 0.96 / Math.max(0.2, legLen + 0.06);
  const REF = 0.96, R = (v: number) => Math.round(v * 1000) / 1000, deg = (r: number) => Math.round(r * 180 / Math.PI);
  const keys: MocapPoseKey[] = [];
  for (let time = t0; time <= t1 + 1e-6; time += step) {
    const hips = world(hipsN, time).p;
    const neck = rel('Neck', time, hips) ?? rel('Head', time, hips), lh = rel('LeftHand', time, hips), rh = rel('RightHand', time, hips), lf = rel('LeftFoot', time, hips), rf = rel('RightFoot', time, hips);
    const lu = rel('LeftUpLeg', time, hips), ru = rel('RightUpLeg', time, hips), la = rel('LeftArm', time, hips), ra = rel('RightArm', time, hips);
    if (!lh || !rh || !lf || !rf || !neck) continue;
    // Two-hand grip (golf, a bat): a single-camera capture lets the hands drift
    // apart (measured 0.7–1.4 m on the golf take); pull both wrists to their
    // midpoint, `grip` metres apart along the line between them.
    if (grip > 0) {
      const mid: V = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2, (lh[2] + rh[2]) / 2];
      const d: V = [rh[0] - lh[0], rh[1] - lh[1], rh[2] - lh[2]]; const n = Math.hypot(...d) || 1; const u: V = [d[0] / n, d[1] / n, d[2] / n];
      for (let i = 0; i < 3; i++) { lh[i] = mid[i] - u[i] * grip / 2; rh[i] = mid[i] + u[i] * grip / 2; }
    }
    const P = (v: V): V => [R(v[0] * SCALE), R(REF + v[1] * SCALE), R(v[2] * SCALE)];
    const yawOf = (a: V | null, b: V | null) => a && b ? Math.atan2(-(b[2] - a[2]), b[0] - a[0]) : 0;
    const hipYaw = deg(yawOf(lu, ru)), shoulderYaw = deg(yawOf(la, ra));
    const pitch = deg(Math.atan2(neck[2], neck[1]));
    keys.push({ t: R(time - t0), bones: { Hips: [0, Math.max(-90, Math.min(90, hipYaw)), 0], Spine: [Math.max(-30, Math.min(50, pitch)), Math.max(-45, Math.min(45, shoulderYaw - hipYaw)), 0] }, hands: { Left: P(lh), Right: P(rh) }, feet: { Left: P(lf), Right: P(rf) }, hipsY: R(Math.max(-0.3, Math.min(0.05, (hips[1] - hips0[1]) * SCALE))) });
  }
  return keys;
}

export async function retargetTake(file: string, name: string, lead = 0.4, tail = 0.3, grip = 0): Promise<MocapClipJson> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
  const anim = doc.getRoot().listAnimations().find((a) => a.listChannels().length > 5) ?? doc.getRoot().listAnimations()[0];
  if (!anim) throw new Error('no animation in ' + file);
  const tracks: Record<string, { t: number[]; q: number[][] }> = {};
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(); if (!node || ch.getTargetPath() !== 'rotation') continue;
    const bone = strip(node.getName()); if (!FEL_BONES.has(bone)) continue;
    const s = ch.getSampler()!; const t = Array.from(s.getInput()!.getArray()!); const o = Array.from(s.getOutput()!.getArray()!);
    const q: number[][] = []; for (let i = 0; i + 3 < o.length; i += 4) q.push([o[i], o[i+1], o[i+2], o[i+3]]);
    tracks[bone] = { t, q };
  }
  // segment: energy over a shared time grid (union of key times, sampled by nearest key)
  const times = [...new Set(Object.values(tracks).flatMap((x) => x.t))].sort((a, b) => a - b);
  const at = (tr: { t: number[]; q: number[][] }, time: number) => { let i = tr.t.findIndex((v) => v >= time); if (i < 0) i = tr.t.length - 1; return tr.q[i]; };
  const energy = times.map((tm, i) => i === 0 ? 0 : Object.entries(tracks).filter(([b]) => ENERGY_BONES.has(b)).reduce((s, [, tr]) => s + qAngle(at(tr, times[i - 1]), at(tr, tm)) / Math.max(1e-3, tm - times[i - 1]), 0));
  const sorted = [...energy].sort((a, b) => a - b); const floor = (sorted[Math.floor(sorted.length * 0.9)] ?? 0) * 0.3;
  let best = { from: 0, to: 0, sum: 0 }, start = -1, sum = 0;
  for (let i = 0; i < times.length; i++) {
    if (energy[i] > floor) { if (start < 0) { start = i; sum = 0; } sum += energy[i]; }
    else if (start >= 0) { if (sum > best.sum) best = { from: start, to: i, sum }; start = -1; }
  }
  if (start >= 0 && sum > best.sum) best = { from: start, to: times.length - 1, sum };
  const t0 = Math.max(0, times[best.from] - lead), t1 = Math.min(times[times.length - 1], times[Math.min(best.to, times.length - 1)] + tail);
  const out: MocapClipJson = { name, source: file.split('/').pop()!, segment: [+t0.toFixed(3), +t1.toFixed(3)], duration: +(t1 - t0).toFixed(3), tracks: {} };
  out.poseKeys = poseKeysFromTake(doc, tracks, t0, t1, 1 / 15, grip);
  for (const [bone, tr] of Object.entries(tracks)) {
    const keys: [number, number, number, number, number][] = [];
    // include the last key before t0 (held pose) and every key inside the window
    let prev = -1; for (let i = 0; i < tr.t.length; i++) { if (tr.t[i] < t0) prev = i; }
    if (prev >= 0) keys.push([0, ...tr.q[prev]] as never);
    for (let i = 0; i < tr.t.length; i++) if (tr.t[i] >= t0 && tr.t[i] <= t1) keys.push([+(tr.t[i] - t0).toFixed(4), ...tr.q[i].map((v) => +v.toFixed(5))] as never);
    if (keys.length) out.tracks[bone] = keys;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, name] = process.argv.slice(2);
  const flag = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
  const lead = flag('--lead', 0.4), tail = flag('--tail', 0.3), grip = flag('--grip', 0);   // --grip 0.1: two hands on one club
  const clip = await retargetTake(file, name, lead, tail, grip);
  mkdirSync('public/models/clips/mocap', { recursive: true });
  writeFileSync(`public/models/clips/mocap/${name}.json`, JSON.stringify(clip));
  const hy = (clip.poseKeys ?? []).flatMap((k) => [k.hands?.Left?.[1] ?? 0, k.hands?.Right?.[1] ?? 0]);
  console.log(`${name}: segment ${clip.segment[0]}s → ${clip.segment[1]}s (${clip.duration} s), ${Object.keys(clip.tracks).length} bones, ${Object.values(clip.tracks).reduce((n, k) => n + k.length, 0)} keys, ${clip.poseKeys?.length ?? 0} pose keys (hands ${Math.min(...hy).toFixed(2)}..${Math.max(...hy).toFixed(2)} m) → public/models/clips/mocap/${name}.json`);
}
