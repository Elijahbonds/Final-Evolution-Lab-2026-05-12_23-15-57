// The Movement Screen's stations as landmark fixtures — P1's harness (build.ts: a body built in 3-D, filmed through
// lib/pose/synth.ts's virtual webcam with FIXTURE_CAMERA) grown to the lengths and the faults the phase-3 graders need
// (MIRROR-COACH P3, 2026-09-26).
//
// WHY NOT THE 17 FILES. The screen's clean fixtures (stand_front, stand_back, stand_side, single_leg_*) are one second
// of stillness each, with no fault in any of them: enough to walk the runner, not enough to grade a 30-second stance or
// to prove a flag. These are built the same way — 3-D joints, bones of fixed length, the synth's camera, NOT mirrored
// (synthesize() refuses a mirrored source) — and the fault is put in the JOINTS, so its size is known in centimetres
// before the camera ever sees it. The one exception is the heel line: the synth's foot model derives the heel point
// from the ankle and the toe with the body's own left/right axis, so no joint can tilt it; the heel-line fault is a
// rotation of the filmed heel point about the filmed ankle, in the image, by a known angle (tiltHeel below).
//
// Synthetic, and said so: the synth's jitter (DEFAULT_NOISE) stands in for a phone's, no real person is in any of
// these, and a real MediaPipe read carries biases they do not (the P1 report's "Owner action": a real recording).
//
// Pure: no fs. Not imported by the app — tests and probes only.
import { restPose, synthesize, type JointClip, type Joints, type SynthOptions, type V3 } from '@/lib/pose/synth';
import { LEFT_ANKLE, LEFT_HEEL, MIRROR_INDEX, RIGHT_ANKLE, RIGHT_HEEL } from '@/lib/pose/landmarks';
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { CLEAN_FILM, FIXTURE_CAMERA, SHIN, THIGH, singleLegPose, solveMiddle } from './build';
import { adapterFromPose } from './index';

const FPS = 30;
/** The fixture camera's aspect (640×480): what the harness would pass the graders for this camera. */
export const STATION_ASPECT = FIXTURE_CAMERA.width / FIXTURE_CAMERA.height;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mapJ = (j: Joints, f: (p: V3) => V3): Joints => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3)])) as Joints;
/** Rotate about the vertical through the origin: + turns +Z toward +X (build.ts rotY). */
function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
/** The LEFT shoulder to the camera (build.ts toSide): the body then faces the image's LEFT. */
export const toSide = (j: Joints): Joints => mapJ(j, (p) => rotY(p, -Math.PI / 2));
/** The other shoulder to the camera: the body faces the image's RIGHT (the graders must not care). */
export const toOtherSide = (j: Joints): Joints => mapJ(j, (p) => rotY(p, Math.PI / 2));
/** Back to the camera (build.ts toBack). */
export const toBack = (j: Joints): Joints => mapJ(j, (p) => rotY(p, Math.PI));

// ── standing faults, in the joints ───────────────────────────────────────────────────────────────────────────────
export interface StandShape {
  /** Raise one shoulder (and its arm with it) this many cm. */
  shoulderUp?: { side: 'left' | 'right'; cm: number };
  /** Drop one hip this many cm, its knee bending forward to keep the foot planted. */
  hipDrop?: { side: 'left' | 'right'; cm: number };
  /** Soften both knees (hips down 1 cm) and put one or both knees this many cm INSIDE the hip–ankle line. */
  kneeIn?: { left?: number; right?: number };
  /** Carry the head this many cm forward of the trunk (the neck halfway). */
  headForwardCm?: number;
}

export function standPose(o: StandShape = {}): Joints {
  const j = restPose();
  if (o.shoulderUp) {
    const S = o.shoulderUp.side === 'left' ? 'Left' : 'Right';
    const up: V3 = [0, o.shoulderUp.cm / 100, 0];
    j[`${S}Arm`] = add(j[`${S}Arm`], up); j[`${S}ForeArm`] = add(j[`${S}ForeArm`], up); j[`${S}Hand`] = add(j[`${S}Hand`], up);
  }
  if (o.hipDrop) {
    const S = o.hipDrop.side === 'left' ? 'Left' : 'Right';
    j[`${S}UpLeg`] = add(j[`${S}UpLeg`], [0, -o.hipDrop.cm / 100, 0]);
    j[`${S}Leg`] = solveMiddle(j[`${S}UpLeg`], j[`${S}Foot`], THIGH, SHIN, [0, 0, 1]);
  }
  if (o.kneeIn) {
    for (const s of ['Left', 'Right'] as const) {
      const hip = j[`${s}UpLeg`] = add(j[`${s}UpLeg`], [0, -0.01, 0]);
      const cm = (s === 'Left' ? o.kneeIn.left : o.kneeIn.right) ?? 0;
      const foot = j[`${s}Foot`];
      // the knee's reach off the hip–ankle line with the hips 1 cm down (~6.6 cm), turned inward by the angle that puts
      // it `cm` inside the line; inward for the left leg (x > 0) is −X, for the right +X
      const D = Math.hypot(foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]);
      const along = (THIGH * THIGH - SHIN * SHIN + D * D) / (2 * D);
      const h = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
      const phi = Math.asin(Math.max(-0.95, Math.min(0.95, cm / 100 / h)));
      const mid = s === 'Left' ? -1 : 1;
      j[`${s}Leg`] = solveMiddle(hip, foot, THIGH, SHIN, [mid * Math.sin(phi), 0, Math.cos(phi)]);
    }
    j.Hips = add(j.Hips, [0, -0.01, 0]);
    for (const k of ['Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) j[k] = add(j[k], [0, -0.01, 0]);
  }
  if (o.headForwardCm) {
    j.Head = add(j.Head, [0, 0, o.headForwardCm / 100]);
    j.Neck = add(j.Neck, [0, 0, o.headForwardCm / 200]);
  }
  return j;
}

// ── one leg ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SingleLegShape {
  stance: 'left' | 'right';
  /** Seconds on both feet before the knee comes up (the athlete settling as the count starts). */
  settleSec?: number;
  /** Seconds on one leg. */
  holdSec?: number;
  /** A sideways sway of the whole body above the stance foot: amplitude (cm) and rate (Hz). */
  swayCm?: number;
  swayHz?: number;
  /** When (s into the hold) the free foot comes down to the floor for half a second. */
  touchDownsAt?: number[];
  /** The free foot is never lifted (the athlete never got onto one leg). */
  neverLift?: boolean;
  /** Seconds at the start still on the OTHER leg (the previous station's pose — the athlete has not switched yet). */
  startOnOtherLegSec?: number;
}

export function singleLegClip(o: SingleLegShape): JointClip {
  const settle = o.settleSec ?? 1, hold = o.holdSec ?? 30;
  const both = restPose(), one = singleLegPose(o.stance), other = singleLegPose(o.stance === 'left' ? 'right' : 'left');
  const frames: Joints[] = [];
  for (let i = 0; i < Math.round((o.startOnOtherLegSec ?? 0) * FPS); i++) frames.push(other);
  const n = Math.round((settle + hold) * FPS);
  const lerpJ = (a: Joints, b: Joints, u: number): Joints =>
    Object.fromEntries(Object.entries(a).map(([k, p]) => [k, (p as V3).map((v, i) => v + ((b as Record<string, V3>)[k][i] - v) * u) as V3])) as Joints;
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    let u = o.neverLift ? 0 : Math.max(0, Math.min(1, (t - settle) / 0.5));   // half a second to lift the knee
    for (const td of o.touchDownsAt ?? []) {
      const k = t - settle - td;
      if (k > 0 && k < 0.8) u = Math.min(u, Math.abs(k - 0.4) < 0.25 ? 0 : Math.abs(k - 0.4) / 0.4);   // down, then up
    }
    let j = lerpJ(both, one, u);
    if (o.swayCm && u >= 1) {   // on one leg only: the straight standing leg has no reach to sway over (build.ts solveMiddle)
      const dx = (o.swayCm / 100) * Math.sin(2 * Math.PI * (o.swayHz ?? 1) * t);
      const St = o.stance === 'left' ? 'Left' : 'Right';
      // everything above the stance foot moves; the stance knee is re-solved so the foot stays planted
      j = mapJ(j, (p) => p);
      for (const k of Object.keys(j) as (keyof Joints)[]) {
        if (k === `${St}Foot` || k === `${St}Toe`) continue;
        j[k] = add(j[k], [dx, 0, 0]);
      }
      j[`${St}Leg`] = solveMiddle(j[`${St}UpLeg`], j[`${St}Foot`], THIGH, SHIN, [0, 0, 1]);
    }
    frames.push(j);
  }
  return { fps: FPS, frames };
}

/** A still stance, `seconds` long. */
export function standClip(pose: Joints, seconds = 14): JointClip {
  return { fps: FPS, frames: Array.from({ length: Math.round(seconds * FPS) }, () => pose) };
}

/**
 * One foot TURNED about the vertical through its ankle, `deg` inward (+) or outward (−), the heel not tilted at all —
 * the review's case (MIRROR-COACH P3 review, 2026-09-26): the synth's heel point follows the foot's forward line, so a
 * turned foot moves the heel sideways from behind exactly as a real one would move MediaPipe's.
 */
export function turnFoot(j: Joints, side: 'left' | 'right', deg: number): Joints {
  if (!deg) return j;
  const S = side === 'left' ? 'Left' : 'Right';
  // inward is toward the other foot: −X for the left foot (x > 0), +X for the right; rotY's + turns +Z toward +X
  const a = ((side === 'left' ? -1 : 1) * deg * Math.PI) / 180;
  const ankle = j[`${S}Foot`], toe = j[`${S}Toe`];
  const r = rotY([toe[0] - ankle[0], toe[1] - ankle[1], toe[2] - ankle[2]], a);
  return { ...j, [`${S}Toe`]: [ankle[0] + r[0], ankle[1] + r[1], ankle[2] + r[2]] as V3 };
}

/**
 * A single-leg clip that ends with the free foot put DOWN `earlySec` before its last frame, and kept down — the athlete
 * stepping off because their own count of thirty ended before the hold clock did (MIRROR-COACH P3 review, 2026-09-26).
 * The clip keeps its length: its last `earlySec` are on both feet (a quarter second to put the foot down).
 */
export function withStepOff(clip: JointClip, earlySec: number): JointClip {
  const n = clip.frames.length, k = Math.max(1, Math.round(earlySec * clip.fps));
  const both = restPose(), ease = Math.max(1, Math.round(0.25 * clip.fps));
  const frames = clip.frames.map((f, i) => {
    const into = i - (n - k);
    if (into < 0) return f;
    const u = Math.min(1, (into + 1) / ease);
    return Object.fromEntries(Object.entries(f).map(([name, p]) =>
      [name, (p as V3).map((v, c) => v + ((both as Record<string, V3>)[name][c] - v) * u) as V3])) as Joints;
  });
  return { ...clip, frames };
}

// ── filming, and what a test does to the film ───────────────────────────────────────────────────────────────────

/** A jittered take: the synth's default noise, nothing dropped or missed (the runner's frames are all good shots). */
export const JITTER = (seed: number): SynthOptions => ({ seed, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0 });

/** Film a clip as the Mirror's adapter hands it over. Clean by default. */
export function film(clip: JointClip, opt: SynthOptions = CLEAN_FILM): AdapterFrame[] {
  return adapterFromPose(synthesize(clip, { ...opt, camera: { ...FIXTURE_CAMERA } }).frames);
}

/** What a mirrored (selfie) camera gives: x flipped AND MediaPipe's labels swapped (lib/pose/landmarks.ts MIRROR_INDEX). */
export const mirrored = (frames: readonly AdapterFrame[]): AdapterFrame[] =>
  frames.map((f) => ({ ...f, landmarks: f.landmarks.map((_, i) => { const s = f.landmarks[MIRROR_INDEX[i]]; return { ...s, x: 1 - s.x }; }) }));

/** Every landmark's visibility set to `v` (a dim room, or a busy background). */
export const dimmed = (frames: readonly AdapterFrame[], v: number): AdapterFrame[] =>
  frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, visibility: v })) }));

/** Every landmark moved by (dx, dy) in the image — a body half out of the shot. */
export const shifted = (frames: readonly AdapterFrame[], dx: number, dy = 0): AdapterFrame[] =>
  frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })) }));

/** A phone propped crooked: the whole image turned `deg` about its centre (+ = clockwise on screen), in pixel units. */
export function rolled(frames: readonly AdapterFrame[], deg: number, aspect = STATION_ASPECT): AdapterFrame[] {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return frames.map((f) => ({
    ...f,
    landmarks: f.landmarks.map((l) => {
      const x = (l.x - 0.5) * aspect, y = l.y - 0.5;
      return { ...l, x: 0.5 + (x * c - y * s) / aspect, y: 0.5 + x * s + y * c };
    }),
  }));
}

/**
 * One heel line tilted by `deg` in the image, the heel OUTSIDE its ankle (away from the other foot): the filmed heel
 * point is rotated about the filmed ankle, the segment's length kept, in pixel units (x × aspect). See the header.
 */
export function tiltHeel(frames: readonly AdapterFrame[], side: 'left' | 'right', deg: number, aspect = STATION_ASPECT): AdapterFrame[] {
  const A = side === 'left' ? LEFT_ANKLE : RIGHT_ANKLE, H = side === 'left' ? LEFT_HEEL : RIGHT_HEEL;
  const O = side === 'left' ? RIGHT_ANKLE : LEFT_ANKLE;
  return frames.map((f) => {
    if (!f.present || !f.landmarks.length) return f;
    const a = f.landmarks[A], h = f.landmarks[H], o = f.landmarks[O];
    const out = Math.sign(a.x - o.x) || 1;
    const vx = (h.x - a.x) * aspect, vy = h.y - a.y;
    const r = (deg * Math.PI) / 180 * out;   // + turns the downward segment's foot toward +x·out… outward
    const nx = vx * Math.cos(r) + vy * Math.sin(r), ny = -vx * Math.sin(r) + vy * Math.cos(r);
    const L = f.landmarks.slice();
    L[H] = { ...h, x: a.x + nx / aspect, y: a.y + ny };
    return { ...f, landmarks: L };
  });
}
