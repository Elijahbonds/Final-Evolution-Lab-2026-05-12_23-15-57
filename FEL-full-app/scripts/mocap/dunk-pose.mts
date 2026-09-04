// dunk-pose — turn the owner's dunk capture (public/mocap/dunk.json: 16 world
// joints per frame, cm, 15 fps) into POSE KEYS for buildPoseClip: wrists and
// ankles as hips-relative targets, torso lean from the hips→neck line, hips yaw
// from the hip line. The two-bone solver fits them to whichever body plays.
//
// Replaces the joint-angle retarget in mocapDunk.ts, whose arm keys rotated
// about X — on the FEL rig the arm's own axis, a twist — so the dunk's hands
// never rose above the head (measured 2026-09-03 by coreClips.test.ts).
//
//   npx tsx scripts/mocap/dunk-pose.mts [--out lib/babylon/anim/authored/mocapDunk.ts]
import { readFileSync, writeFileSync } from 'node:fs';

const flag = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = flag('out', 'lib/babylon/anim/authored/mocapDunk.ts');
const FROM = Number(flag('from', '14')), TO = Number(flag('to', '66')), STEP = Number(flag('step', '2'));
const DUR = Number(flag('dur', '1.3'));

interface Cap { joints: string[]; fps: number; frames: number[][][] }
const cap: Cap = JSON.parse(readFileSync('public/mocap/dunk.json', 'utf8'));
const ix = Object.fromEntries(cap.joints.map((n, i) => [n, i]));
type V = [number, number, number];
const J = (f: number, n: string): V => cap.frames[f][ix[n]] as V;
// 3-frame box smooth in metres, hips-relative, x mirrored (source +x is the subject's left)
const rel = (f: number, n: string): V => {
  const acc: V = [0, 0, 0]; let k = 0;
  for (const g of [f - 1, f, f + 1]) { if (g < 0 || g >= cap.frames.length) continue; const h = J(g, 'Hips'), p = J(g, n); acc[0] += -(p[0] - h[0]) / 100; acc[1] += (p[1] - h[1]) / 100; acc[2] += (p[2] - h[2]) / 100; k++; }
  return [acc[0] / k, acc[1] / k, acc[2] / k];
};
const hipsY = (f: number) => { let s = 0, k = 0; for (const g of [f - 1, f, f + 1]) if (g >= 0 && g < cap.frames.length) { s += J(g, 'Hips')[1] / 100; k++; } return s / k; };

// Body scale: source hips→head at the upright frames vs the forge hero's 0.64 m.
const upright = [...Array(TO - FROM + 1)].map((_, i) => rel(FROM + i, 'Head')[1]).sort((a, b) => a - b);
const srcTorso = upright[Math.floor(upright.length * 0.8)];
const SCALE = 0.64 / srcTorso;
const REF_HIPS = 0.96;
const R = (v: number) => Math.round(v * 100) / 100;
const deg = (r: number) => Math.round(r * 180 / Math.PI);

// Standing hips height in the source: the highest hips before take-off is not
// known from the file, so take the median of the frames before the rise begins.
const rise = (() => { for (let f = FROM; f < TO; f++) if (hipsY(f + 2) - hipsY(f) > 0.12) return f; return TO; })();
const pre = [...Array(Math.max(1, rise - FROM))].map((_, i) => hipsY(FROM + i)).sort((a, b) => a - b);
const standing = pre[pre.length - 1] + 0.10;   // the crouch is ~10 cm below standing at its shallowest

// Baseline facing: the capture's axes are not the dunker's. Take the median hip-line
// yaw over the window as "forward", rotate every target into that frame and keep
// only the residual turn (the mode's root carries the approach direction).
const yawOfRaw = (g: number, a: string, b: string) => { const A = rel(g, a), B = rel(g, b); return Math.atan2(-(B[2] - A[2]), B[0] - A[0]); };
const medianN = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const BASE_YAW = medianN([...Array(TO - FROM + 1)].map((_, i) => yawOfRaw(FROM + i, 'LeftUpLeg', 'RightUpLeg')));
const face = (v: V): V => { const c = Math.cos(-BASE_YAW), sn = Math.sin(-BASE_YAW); return [v[0] * c + v[2] * sn, v[1], -v[0] * sn + v[2] * c]; };
const keys: string[] = [];
let handMin = 9, handMax = -9;
for (let f = FROM; f <= TO; f += STEP) {
  const t = R(((f - FROM) / (TO - FROM)) * DUR);
  const neck = face(rel(f, 'Neck')), lh = face(rel(f, 'LeftHand')), rh = face(rel(f, 'RightHand')), lf = face(rel(f, 'LeftFoot')), rf = face(rel(f, 'RightFoot'));
  // torso: pitch = lean forward (+z) about x; yaw from the shoulder/hip lines
  const pitch = deg(Math.atan2(neck[2], neck[1]));
  // yaw lines are the noisiest signal in a single-camera capture: median over ±3 frames, clamped
  const yawOf = (g: number, a: string, b: string) => deg(yawOfRaw(g, a, b) - BASE_YAW);   // right side forward of left → positive yaw (measured convention); relative to the baseline facing
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const win = [...Array(7)].map((_, i) => Math.min(cap.frames.length - 1, Math.max(0, f - 3 + i)));
  const hipYaw = Math.max(-35, Math.min(35, median(win.map((g) => yawOf(g, 'LeftUpLeg', 'RightUpLeg')))));
  const shoulderYaw = median(win.map((g) => yawOf(g, 'LeftArm', 'RightArm')));
  const spineYaw = Math.max(-30, Math.min(30, shoulderYaw - hipYaw));
  const hY = Math.max(-0.25, Math.min(0, (hipsY(f) - standing) * SCALE));
  const P = (v: V): string => `[${R(v[0] * SCALE)}, ${R(REF_HIPS + v[1] * SCALE)}, ${R(v[2] * SCALE)}]`;
  const handY = Math.max(lh[1], rh[1]) * SCALE + REF_HIPS; handMin = Math.min(handMin, handY); handMax = Math.max(handMax, handY);
  keys.push(`    { t: ${t}, bones: { Hips: [0, ${hipYaw}, 0], Spine: [${Math.max(-25, Math.min(45, pitch))}, ${spineYaw}, 0] }, hands: { Left: ${P(lh)}, Right: ${P(rh)} }, feet: { Left: ${P(lf)}, Right: ${P(rf)} }, hipsY: ${R(hY)} },`);
}

const src = `// mocapDunk — the owner's REAL dunk capture (public/mocap/dunk.json, DeepMotion,
// 92 frames @ 15 fps, 16 world joints in cm), as POSE KEYS: wrists and ankles as
// hips-relative targets and the torso's lean, frames ${FROM}..${TO} mapped to ${DUR} s.
// GENERATED by scripts/mocap/dunk-pose.mts — edit the script, not this file.
//
// The two-bone solver fits the targets to whichever body plays (ship pass 3,
// rung 1), so the same capture drives the shipped hero and the MPFB2 candidate.
// The global hip rise is dropped (DunkMode applies the jump arc to the root);
// only the crouch below standing is carried in hipsY.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type PoseKey } from '../poseClip';

export const DUNK_MOCAP_DURATION = ${DUR};
export const DUNK_MOCAP_KEYS: PoseKey[] = [
${keys.join('\n')}
];

export function buildMocapDunk(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_mocap', DUNK_MOCAP_DURATION, DUNK_MOCAP_KEYS);
}
`;
writeFileSync(OUT, src);
console.log(`dunk-pose: baseline facing ${deg(BASE_YAW)}°; ${keys.length} keys, frames ${FROM}..${TO} → ${DUR}s, scale ${SCALE.toFixed(3)} (source torso ${srcTorso.toFixed(2)} m), standing hips ${standing.toFixed(2)} m, rise at f${rise}, hand height ${handMin.toFixed(2)}..${handMax.toFixed(2)} m → ${OUT}`);
