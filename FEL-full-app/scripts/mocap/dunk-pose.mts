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
// DUNK MOTION phase 5 (2026-09-23): THE JUMP, NOT THE APPROACH. The window used to be frames 14..66 squeezed into 1.3 s — 3.5 s of
// capture at 2.67× — and frames 14..48 are the owner's APPROACH (the hips' "climb" from 0.8 to 2.2 m there is DeepMotion's root
// drift, not a rise). So the flight's first 0.9 s played his run-up, sped up, while the game's body was already in the air: the
// ball carried low at the hip into the rise, the "unnatural" part of every plain dunk. The jump is frames 49..59: the plant (the
// hips' last dip, f50), both hands whipping the ball from the waist to the face in 0.13 s, overhead and cocked by the apex (f58).
// It plays at 1.23× its real length (0.667 s → 0.82 s): a touch of hang time, not a fast-forward. The flush is the game's own
// (dunk_flush_two from the SLAM), so the window ends at the apex, before the capture's own throw-down.
const FROM = Number(flag('from', '49')), TO = Number(flag('to', '59')), STEP = Number(flag('step', '1'));
const DUR = Number(flag('dur', '0.82'));

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
type Key = { t: number; hipYaw: number; pitch: number; spineYaw: number; lh: V; rh: V; lf: V; rf: V; hY: number };
const raw: Key[] = [];
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
  // DUNK-POSTURE-LEGS (2026-09-08): the targets are HIPS-relative in the capture but ROOT-relative in the clip — the
  // crouch (hipsY) has to be carried into them, or a foot that is on the floor under crouched hips lands 0.25 m in the
  // air (measured: both ankles 0.33 / 0.47 m over the floor at the plant, the loaded legs pulled up under the body).
  const handY = Math.max(lh[1], rh[1]) * SCALE + REF_HIPS; handMin = Math.min(handMin, handY); handMax = Math.max(handMax, handY);
  raw.push({ t, hipYaw, pitch, spineYaw, lh, rh, lf, rf, hY });
}

// DUNK-BALL-ARMS-RIM R3 (2026-09-14): the BALL hand's carry. The capture cocks the right hand back behind the hip (0.75–0.85 s:
// 0.25–0.46 m behind the root) and whips it through the belly to over the head by 0.95 — its wind-up, 2.67× time-compressed
// onto the clip. On the hero it measured ~21 m/s at 0.95 s and 0.42 m behind the shoulder (mocapDunkCarry.test.ts), and in
// the game the ball rode that hand: six frames of a 0.3–0.47 m/frame palm on every power make. The dunker in this mode is
// holding the ball, so the hand CARRIES it up in front of the chest between the capture's own last in-front key and its
// first over-the-head key; everything else (the off hand, the torso, the legs) stays the capture's.
// (phase 5: the jump window has no wind-up to replace — the ball goes up the front in both hands on its own — so these spans only
// run when asked for, e.g. --carry-from 0.65 --carry-to 0.95 on the old approach window)
const CARRY = { from: Number(flag('carry-from', '99')), to: Number(flag('carry-to', '99')) };
// The OFF hand's rise into the reach: the capture's 0.9 → 0.95 key climbs 0.62 m (12.8 m/s on the hero); live it was a 0.34 m
// one-frame pop of the left palm at clip 0.94 on a self-lob make. It rises over 0.85 → 1.0 with the body instead.
const RISE = { from: Number(flag('rise-from', '99')), to: Number(flag('rise-to', '99')) };
/** A hand straight from the capture's key at `from` to its key at `to` (the keys between are the capture's whip). */
function span(hand: 'lh' | 'rh', from: number, to: number): void {
  const kFrom = raw.find((k) => k.t >= from - 1e-6), kTo = raw.find((k) => k.t >= to - 1e-6);
  if (!kFrom || !kTo || kTo.t <= kFrom.t) return;
  const a = kFrom[hand], b = kTo[hand];
  for (const k of raw) if (k.t > kFrom.t && k.t < kTo.t) {
    const u = (k.t - kFrom.t) / (kTo.t - kFrom.t);
    k[hand] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
}
span('rh', CARRY.from, CARRY.to);
span('lh', RISE.from, RISE.to);
// DUNK MOTION phase 5: the ball hand swings up from BESIDE the hip, not through it. At the plant the capture has it back by the
// hip (the rip before the arm swing) at x 0.14 — inside the pelvis's width — so the swing forward took the ball through the hip
// for two frames (mocapDunkCarry.test.ts). A ball hand low and not yet in front keeps a hip's width out to the side.
const BALL_CLEAR_X = Number(flag('ball-clear', '0.24'));
for (const k of raw) {
  const y = REF_HIPS + k.hY + k.rh[1] * SCALE, z = k.rh[2] * SCALE;
  if (y < 1.45 && z < 0.12 && k.rh[0] * SCALE < BALL_CLEAR_X) k.rh = [BALL_CLEAR_X / SCALE, k.rh[1], k.rh[2]];
}
const keys = raw.map(({ t, hipYaw, pitch, spineYaw, lh, rh, lf, rf, hY }) => {
  const P = (v: V): string => `[${R(v[0] * SCALE)}, ${R(REF_HIPS + hY + v[1] * SCALE)}, ${R(v[2] * SCALE)}]`;
  // THE CROUCH IS CARRIED ONCE, NOT TWICE (dunk pass, 2026-09-16). poseClip solves the foot
  // targets into LOCAL LEG ROTATIONS on an untranslated body and then emits `hipsY` as its own
  // Hips translation track — and the legs hang off Hips, so that translation already lowers the
  // ankles. Baking hY into the target as well charged the crouch to the feet a second time:
  // at t=0 the target says 0.08 (an ankle 8 cm off the floor, correct) and the foot rendered at
  // 0.08 - 0.25 = -0.170, a boot through the court on the OPENING FRAME of every dunk. The
  // note above this describes the opposite symptom, feet floating 0.25 m up, which is what the
  // same bake fixed before poseClip carried hipsY on its own track.
  const PF = (v: V): string => `[${R(v[0] * SCALE)}, ${R(REF_HIPS + v[1] * SCALE)}, ${R(v[2] * SCALE)}]`;
  return `    { t: ${t}, bones: { Hips: [0, ${hipYaw}, 0], Spine: [${Math.max(-25, Math.min(45, pitch))}, ${spineYaw}, 0] }, hands: { Left: ${P(lh)}, Right: ${P(rh)} }, feet: { Left: ${PF(lf)}, Right: ${PF(rf)} }, hipsY: ${R(hY)} },`;
});

const src = `// mocapDunk — the owner's REAL dunk capture (public/mocap/dunk.json, DeepMotion,
// 92 frames @ 15 fps, 16 world joints in cm), as POSE KEYS: wrists and ankles as
// hips-relative targets and the torso's lean, frames ${FROM}..${TO} mapped to ${DUR} s: THE JUMP — the plant, both hands taking
// the ball up the front to over the head, cocked at the apex (DUNK MOTION phase 5; the old window was the run-up at 2.67×).${CARRY.from < 90 ? `
// The ball hand's carry is replaced ${CARRY.from}–${CARRY.to} s.` : ''}${RISE.from < 90 ? ` The off hand's rise is replaced ${RISE.from}–${RISE.to} s.` : ''}
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
