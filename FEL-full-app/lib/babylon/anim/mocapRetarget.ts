// mocapRetarget — ANY capture → POSE KEYS for buildPoseClip (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
//
// The opponents stop playing authored keyframes. Their motion comes from real captures — the owner's DeepMotion
// takes, CMU's basketball trials, Quaternius' CC0 library — and each source has its own skeleton, units, frame rate
// and facing. This file is the one place they become the rig's portable language: wrists and ankles as body-local
// targets, elbow poles, the torso's lean and turn, and the crouch. The two-bone solver (poseClip.ts) then fits the
// same keys to whichever body plays — a short female kit body and the owner's scan get the same move.
//
// It generalises scripts/mocap/dunk-pose.mts (the shipped dunk) and keeps ITS conventions exactly, because those are
// the ones measured in the game:
//   - targets are ROOT-relative body-local metres: [x·S, REF_HIPS + y·S, z·S], +x right, +y up, +z forward,
//     where (x, y, z) is the joint minus the hips and S scales the source LEG to the reference hero's 0.82 m;
//   - the crouch rides in hipsY only (hips = ankle height + the capture's hips-over-ankle); poseClip moves the solved body;
//   - facing is the MEDIAN hip-line yaw over the window; only the residual turn is keyed (Hips yaw), the mode's root
//     carries direction; torso lean is the Spine pitch, shoulders-vs-hips is the Spine yaw.
// Added over dunk-pose, because opponents are seen for whole possessions rather than 1.3 s:
//   - FRONT is settled anatomically (the toes), so a right-handed BVH and a left-handed engine cannot mirror a move;
//   - positions are Gaussian-smoothed in time (video capture jitter) before keys are sampled;
//   - elbow POLES come from the capture's own elbows, so an arm bends the way the person's did;
//   - a loop closes: the last stretch blends into the first key, so a looping idle never pops;
//   - mirror: a left-side move authored once plays for the right.
//
// Pure (numbers in, keys out) — tested in node with no engine.

import type { PoseKey } from './poseClip';

export type V3 = [number, number, number];

/** The joints a retarget reads. A source adapter fills these per frame (any units, any handedness). */
export const CANON = [
  'Hips', 'Chest', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToe', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToe',
] as const;
export type Canon = typeof CANON[number];

export interface JointStream {
  fps: number;
  frames: Record<Canon, V3>[];
  /** Which axis is up in the source (every source we use is +Y). */
  up?: V3;
}

export interface RetargetOpts {
  from: number;            // seconds into the stream
  to: number;
  /** Output duration (s); default = to − from (real time). */
  duration?: number;
  keyFps?: number;         // default 20
  smoothSec?: number;      // Gaussian sigma, default 0.035
  loop?: boolean;
  mirror?: boolean;
  /** Keep the crouch within these bounds (metres, reference body). */
  hipsYRange?: [number, number];
  /** A STRIKE's front is where it lands, not where the hips point: rotate the baseline so the peak hand reach ('hand') or
   *  the highest kick ('foot') points straight ahead. A roundhouse turns the hips ~90° through the kick, so the median hip
   *  facing put the kick 76° off to the side (measured on CMU 135_07). */
  aim?: 'hand' | 'foot';
}

const REF_LEG = 0.82;      // poseClip REF_LEG_LEN: forge hero hip→knee→ankle, metres
const REF_HIPS = 0.96;     // poseClip REF_HIPS_Y
const REF_ANKLE = 0.07;    // the hero's ankle joint over the floor at bind (rig-measured: kit 0.068, roster 0.073)

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const R2 = (v: number) => Math.round(v * 100) / 100;
const DEG = 180 / Math.PI;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };

/** Gaussian-smooth every joint's position over time. */
export function smoothStream(s: JointStream, sigmaSec: number): JointStream {
  const sig = sigmaSec * s.fps;
  if (sig < 0.5) return s;
  const r = Math.ceil(sig * 2.5);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sig * sig)));
  const frames = s.frames.map((_, f) => {
    const out = {} as Record<Canon, V3>;
    for (const j of CANON) {
      let acc: V3 = [0, 0, 0], ws = 0;
      for (let k = -r; k <= r; k++) {
        const g = f + k; if (g < 0 || g >= s.frames.length) continue;
        acc = add(acc, scl(s.frames[g][j], w[k + r])); ws += w[k + r];
      }
      out[j] = scl(acc, 1 / ws);
    }
    return out;
  });
  return { ...s, frames };
}

/** The frame's anatomical axes in source space: right along the hip line, up the source up, front toward the toes. */
function bodyAxes(fr: Record<Canon, V3>, up: V3, frontSign: number): { right: V3; up: V3; front: V3 } {
  let right = sub(fr.RightUpLeg, fr.LeftUpLeg);
  right = norm(sub(right, scl(up, dot(right, up))));
  const front = scl(norm(cross(right, up)), frontSign);
  return { right, up, front };
}

/** +1 or −1 so that cross(right, up)·sign points where the toes point, decided over the whole window. */
export function frontSignOf(s: JointStream, f0: number, f1: number): number {
  const up = s.up ?? [0, 1, 0];
  const votes: number[] = [];
  for (let f = f0; f <= f1; f++) {
    const fr = s.frames[f];
    const { right } = bodyAxes(fr, up, 1);
    const c = norm(cross(right, up));
    const toe = add(sub(fr.LeftToe, fr.LeftFoot), sub(fr.RightToe, fr.RightFoot));
    votes.push(Math.sign(dot(toe, c)) || 1);
  }
  return median(votes) >= 0 ? 1 : -1;
}

export interface RetargetReport { keys: PoseKey[]; duration: number; scale: number; baseYawDeg: number; frontSign: number }

export function retargetToPoseKeys(stream: JointStream, o: RetargetOpts): RetargetReport {
  const s = smoothStream(stream, o.smoothSec ?? 0.035);
  const up = norm(s.up ?? [0, 1, 0]);
  const f0 = Math.max(0, Math.floor(o.from * s.fps)), f1 = Math.min(s.frames.length - 1, Math.ceil(o.to * s.fps));
  if (f1 <= f0) throw new Error(`[mocapRetarget] empty window ${o.from}–${o.to}s of a ${(s.frames.length / s.fps).toFixed(2)}s stream`);
  const frontSign = frontSignOf(s, f0, f1);

  // BASELINE FACING — the median hip-line direction over the window. Every frame is expressed in this one frame, so
  // a spin reads as a yaw key rather than as the whole body being re-authored in its own moving frame.
  const refAx = bodyAxes(s.frames[f0], up, frontSign);
  const hipYaws: number[] = [];
  for (let f = f0; f <= f1; f++) {
    const ax = bodyAxes(s.frames[f], up, frontSign);
    hipYaws.push(Math.atan2(dot(ax.front, refAx.right), dot(ax.front, refAx.front)));
  }
  const baseYaw = median(hipYaws);
  // rotate the reference pair together, so right stays the anatomical right whatever the source's handedness
  const base = {
    front: norm(add(scl(refAx.front, Math.cos(baseYaw)), scl(refAx.right, Math.sin(baseYaw)))),
    right: norm(sub(scl(refAx.right, Math.cos(baseYaw)), scl(refAx.front, Math.sin(baseYaw)))),
    up,
  };
  if (o.aim) {
    let best: V3 | null = null, bestScore = -Infinity;
    for (let f = f0; f <= f1; f++) {
      const fr = s.frames[f];
      for (const side of ['Left', 'Right'] as const) {
        const j = o.aim === 'hand' ? fr[`${side}Hand`] : fr[`${side}Foot`];
        const d = sub(j, fr.Hips), flat = sub(d, scl(up, dot(d, up)));
        const score = o.aim === 'hand' ? len(flat) : dot(j, up);
        if (score > bestScore && len(flat) > 1e-6) { bestScore = score; best = norm(flat); }
      }
    }
    if (best) {
      const th = Math.atan2(dot(best, base.right), dot(best, base.front));
      const f2 = norm(add(scl(base.front, Math.cos(th)), scl(base.right, Math.sin(th))));
      const r2 = norm(sub(scl(base.right, Math.cos(th)), scl(base.front, Math.sin(th))));
      base.front = f2; base.right = r2;
    }
  }
  const local = (v: V3): V3 => [dot(v, base.right), dot(v, up), dot(v, base.front)];

  // SCALE — the source LEG (hip→knee→ankle) to the reference hero's 0.82 m (poseClip REF_LEG_LEN), over the whole stream.
  // It was the torso (hips→head) first, and that planted nothing: Meshy's rig puts Head far higher up the skull than
  // CMU's, so its torso read long, every target shrank, and a standing body's ankles were keyed 0.33–0.54 m off the
  // floor (measured on ElijahGuard / the strikes). Legs are the one span every rig agrees on, and the one the feet need.
  const all = s.frames.length;
  const legLen = (fr: Record<Canon, V3>) => (len(sub(fr.LeftUpLeg, fr.LeftLeg)) + len(sub(fr.LeftLeg, fr.LeftFoot)) + len(sub(fr.RightUpLeg, fr.RightLeg)) + len(sub(fr.RightLeg, fr.RightFoot))) / 2;
  const leg = pct(Array.from({ length: all }, (_, i) => legLen(s.frames[i])), 0.9);
  const S = REF_LEG / (leg || 1);
  // THE CROUCH, per frame, from the capture's own legs: the rig's hips sit where the capture's hips-over-lowest-ankle puts
  // them above the reference ankle height. It was "hips below the stream's tallest standing frame" first, which kept the
  // hips at the hero's full 0.96 m while an athletic stance's bent knees shortened the legs — so the ankles were keyed
  // 0.10–0.21 m off the floor on every CMU clip (rig-measured), and in the game the ground snap dragged the whole body
  // down to fix it. Now a bent-knee stance lowers the hips and the lowest foot always lands at ankle height.
  const hipsOverFloor = (fr: Record<Canon, V3>) => dot(fr.Hips, up) - Math.min(dot(fr.LeftFoot, up), dot(fr.RightFoot, up));
  const [yLo, yHi] = o.hipsYRange ?? [-0.45, 0.04];

  const dur = o.duration ?? (f1 - f0) / s.fps;
  const kfps = o.keyFps ?? 20;
  const nKeys = Math.max(2, Math.round(dur * kfps) + 1);
  const sampleAt = (u: number) => {
    const x = f0 + u * (f1 - f0), a = Math.floor(x), b = Math.min(f1, a + 1), t = x - a;
    const out = {} as Record<Canon, V3>;
    for (const j of CANON) out[j] = add(scl(s.frames[a][j], 1 - t), scl(s.frames[b][j], t));
    return out;
  };
  const keyOf = (fr: Record<Canon, V3>, t: number): PoseKey => {
    const ax = bodyAxes(fr, up, frontSign);
    // the rig's yaw convention (basketball.ts, measured): +yaw turns the RIGHT shoulder forward, i.e. the front toward
    // the body's LEFT — so a front that has turned toward +right is a NEGATIVE yaw
    const hipYaw = -Math.atan2(dot(ax.front, base.right), dot(ax.front, base.front)) * DEG;
    const shoulder = sub(fr.RightArm, fr.LeftArm);
    const shoulderFront = norm(cross(norm(sub(shoulder, scl(up, dot(shoulder, up)))), up));
    const sf = dot(shoulderFront, ax.front) < 0 ? scl(shoulderFront, -1) : shoulderFront;
    const spineYaw = -Math.atan2(dot(sf, ax.right), dot(sf, ax.front)) * DEG;
    const neckRel = sub(fr.Neck, fr.Hips);
    const pitch = Math.atan2(dot(neckRel, ax.front), dot(neckRel, up)) * DEG;
    const hY = Math.max(yLo, Math.min(yHi, REF_ANKLE + hipsOverFloor(fr) * S - REF_HIPS));
    // Targets are relative to the UN-lowered hips: buildPoseClip solves every key with the hips at bind and applies hipsY
    // afterwards as a translation of the whole solved body (poseClip.ts). Folding hY into the targets as well counted the
    // crouch twice — the rig measured the ankles 0.15 m under the floor the moment the crouch was keyed correctly.
    const P = (j: Canon): V3 => { const v = local(sub(fr[j], fr.Hips)); return [R2(v[0] * S), R2(REF_HIPS + v[1] * S), R2(v[2] * S)]; };
    const pole = (sh: Canon, el: Canon, wr: Canon): V3 | undefined => {
      const mid = scl(add(fr[sh], fr[wr]), 0.5), d = sub(fr[el], mid);
      if (len(d) < 0.02 * (1 / S)) return undefined;   // nearly straight: the solver's default pole
      const v = norm(local(d)); return [R2(v[0]), R2(v[1]), R2(v[2])];
    };
    const poles: PoseKey['poles'] = {};
    const pl = pole('LeftArm', 'LeftForeArm', 'LeftHand'), pr = pole('RightArm', 'RightForeArm', 'RightHand');
    if (pl) poles.Left = pl; if (pr) poles.Right = pr;
    return {
      t: R2(t),
      bones: { Hips: [0, Math.round(Math.max(-110, Math.min(110, hipYaw))), 0], Spine: [Math.round(Math.max(-90, Math.min(60, pitch))), Math.round(Math.max(-40, Math.min(40, spineYaw))), 0] },
      hands: { Left: P('LeftHand'), Right: P('RightHand') },
      poles,
      feet: { Left: P('LeftFoot'), Right: P('RightFoot') },
      hipsY: R2(hY),
    };
  };
  let keys = Array.from({ length: nKeys }, (_, k) => keyOf(sampleAt(k / (nKeys - 1)), (k / (nKeys - 1)) * dur));
  if (o.loop) keys = closeLoop(keys);
  if (o.mirror) keys = keys.map(mirrorKey);
  return { keys, duration: R2(dur), scale: +S.toFixed(3), baseYawDeg: Math.round(baseYaw * DEG), frontSign };
}

const lerp3 = (a: V3, b: V3, u: number): V3 => [R2(a[0] + (b[0] - a[0]) * u), R2(a[1] + (b[1] - a[1]) * u), R2(a[2] + (b[2] - a[2]) * u)];

/** Blend the last ~20% of the keys toward the first key so a loop's seam is continuous. */
export function closeLoop(keys: PoseKey[]): PoseKey[] {
  const n = keys.length, first = keys[0], span = Math.max(1, Math.round(n * 0.2));
  return keys.map((k, i) => {
    if (i < n - span) return k;
    const u = i === n - 1 ? 1 : (i - (n - span - 1)) / span;
    const m = (a?: V3, b?: V3) => (a && b ? lerp3(a, b, u) : a);
    return {
      ...k,
      bones: Object.fromEntries(Object.entries(k.bones ?? {}).map(([bn, v]) => [bn, lerp3(v as V3, (first.bones?.[bn] ?? v) as V3, u).map(Math.round) as V3])),
      hands: { Left: m(k.hands?.Left, first.hands?.Left), Right: m(k.hands?.Right, first.hands?.Right) },
      feet: { Left: m(k.feet?.Left, first.feet?.Left), Right: m(k.feet?.Right, first.feet?.Right) },
      poles: { Left: m(k.poles?.Left, first.poles?.Left), Right: m(k.poles?.Right, first.poles?.Right) },
      hipsY: k.hipsY != null && first.hipsY != null ? R2(k.hipsY + (first.hipsY - k.hipsY) * u) : k.hipsY,
    } as PoseKey;
  });
}

/** Left ↔ right: swap the sides, negate x and every yaw. */
export function mirrorKey(k: PoseKey): PoseKey {
  const mx = (v?: V3): V3 | undefined => (v ? [R2(-v[0]), v[1], v[2]] : undefined);
  const sw = <T extends { Left?: V3; Right?: V3 }>(o?: T) => (o ? { Left: mx(o.Right), Right: mx(o.Left) } : undefined);
  return {
    ...k,
    bones: Object.fromEntries(Object.entries(k.bones ?? {}).map(([bn, v]) => [bn, [v[0], -v[1], -v[2]] as V3])),
    hands: sw(k.hands), feet: sw(k.feet), poles: sw(k.poles),
  } as PoseKey;
}
