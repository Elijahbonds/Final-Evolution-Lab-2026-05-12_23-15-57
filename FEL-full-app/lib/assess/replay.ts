// replay — the jump screen's synthetic captures, and the deterministic replay of a capture into a full result.
//
// WHY SYNTHETIC. The Mirror's recorded fixtures (lib/mirror/fixtures) cover the FRONT of a squat and a split squat;
// nothing in the repo films an overhead squat from the side, a knee-to-wall lunge, a single-leg squat or a
// hands-on-hips countermovement jump. Each is built here the way lib/mirror/fixtures/build.ts builds its own: joints in
// 3-D with bones of fixed length (its squatPose, solveMiddle and segment lengths), filmed through the app's own virtual
// webcam (lib/pose/synth.ts synthesize, the fixtures' pinned camera). The TRUTH is read from the joints, never from the
// image, so the geometry and the graders are checked against what the body did (spec §12 Phase 0: ±2°).
//
// WHAT THEY ARE NOT. A person. The synth's feet are rigid, its visibility model is kind to a far-side limb, and a
// clean take has no jitter; a noisy take adds the synth's seeded noise. The gold-standard capture (spec §12 Phase 1,
// Elijah's) is what tunes the thresholds; these only prove the arithmetic reads the right joint on the right side.
//
// Node or browser, no fs, deterministic: the same options give byte-identical frames.
import { synthesize, restPose, type JointClip, type Joints, type SynthOptions, type V3 } from '@/lib/pose/synth';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { FIXTURE_CAMERA, CLEAN_FILM, THIGH, SHIN, UPPER_ARM, FOREARM, solveMiddle, squatPose } from '@/lib/mirror/fixtures/build';
import type { Side } from './protocol';
import { calibrateFront, calibrateSide, type Calibration } from './calibration';

// ── vectors (build.ts keeps its own private; these match them) ───────────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const midV = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
function rotY(p: V3, pivot: V3, a: number): V3 {
  const x = p[0] - pivot[0], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [pivot[0] + x * c + z * s, p[1], pivot[2] - x * s + z * c];
}
/** Rotate about the Z axis (the lens axis): + turns +Y toward −X. */
function rotZ(p: V3, pivot: V3, a: number): V3 {
  const x = p[0] - pivot[0], y = p[1] - pivot[1], c = Math.cos(a), s = Math.sin(a);
  return [pivot[0] + x * c - y * s, pivot[1] + x * s + y * c, p[2]];
}
const mapJ = (j: Joints, f: (p: V3) => V3): Joints => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3)])) as Joints;
/** Turn a body built facing the camera side-on: `near` = the side that ends up toward the lens. */
export const turnSide = (j: Joints, near: Side): Joints => mapJ(j, (p) => rotY(p, [0, 0, 0], near === 'left' ? -Math.PI / 2 : Math.PI / 2));

/** 2-D interior angle at b (degrees) of three points already projected to a plane. */
function angle2(a: [number, number], b: [number, number], c: [number, number]): number {
  const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1];
  return deg(Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))));
}
/** Project onto the lens plane of a body built facing +Z (x, y) — the frontal plane — or its sagittal plane (z, y). */
const frontal = (p: V3): [number, number] => [p[0], p[1]];
const sagittal = (p: V3): [number, number] => [p[2], p[1]];

// ── a capture ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Frames as the live route sees them, plus the camera's shape. */
export interface Capture {
  frames: PoseFrame[];
  /** Image width ÷ height the landmarks are normalised to. */
  aspect: number;
  fps: number;
}

const ASPECT = FIXTURE_CAMERA.width / FIXTURE_CAMERA.height;
const SRC_FPS = 60;

/** Film a clip through the fixtures' pinned camera. Clean by default; `noise` adds the synth's seeded jitter. */
export function film(clip: JointClip, o: { fps?: number; t0?: number; noise?: boolean; seed?: number } = {}): Capture {
  const opt: SynthOptions = o.noise
    ? { seed: o.seed ?? 7, fps: o.fps ?? 30, t0: o.t0 ?? 0, dropRate: 0, missRate: 0, camera: { ...FIXTURE_CAMERA } }
    : { ...CLEAN_FILM, fps: o.fps ?? 30, t0: o.t0 ?? 0, camera: { ...FIXTURE_CAMERA } };
  return { frames: synthesize(clip, opt).frames, aspect: ASPECT, fps: o.fps ?? 30 };
}

/** Frames of several captures back to back on one clock, each shifted to start one frame after the last ended. */
export function concat(parts: readonly Capture[]): Capture {
  const frames: PoseFrame[] = [];
  let t0 = 0;
  for (const c of parts) {
    if (!c.frames.length) continue;
    const first = c.frames[0].t, gap = 1000 / c.fps;
    for (const f of c.frames) frames.push({ ...f, t: f.t - first + t0, ...(f.arrive !== undefined ? { arrive: f.arrive - first + t0 } : {}) });
    t0 = frames[frames.length - 1].t + gap;
  }
  return { frames, aspect: parts[0]?.aspect ?? ASPECT, fps: parts[0]?.fps ?? 30 };
}

/** One rep's depth curve: still, down, hold, up, still (seconds). */
function repCurve(still0: number, down: number, hold: number, up: number, still1: number, fps = SRC_FPS): number[] {
  const n = (s: number) => Math.max(1, Math.round(s * fps));
  const out: number[] = [];
  for (let i = 0; i < n(still0); i++) out.push(0);
  for (let i = 0, k = n(down); i < k; i++) out.push(ease((i + 1) / k));
  for (let i = 0; i < n(hold); i++) out.push(1);
  for (let i = 0, k = n(up); i < k; i++) out.push(ease(1 - (i + 1) / k));
  for (let i = 0; i < n(still1); i++) out.push(0);
  return out;
}
const reps = (count: number, curve: () => number[]) => Array.from({ length: count }, curve).flat();

/** Hands on the hips, elbows out: the CMJ standard and the single-leg squat's. */
function handsOnHips(j: Joints): Joints {
  const k = { ...j };
  for (const s of ['Left', 'Right'] as const) {
    const f = s === 'Left' ? 1 : -1;
    const hip = k[`${s}UpLeg`], sh = k[`${s}Arm`];
    k[`${s}Hand`] = add(hip, [0.06 * f, 0.06, 0.02]);
    k[`${s}ForeArm`] = add(midV(sh, k[`${s}Hand`]), [0.12 * f, 0, -0.04]);
  }
  return k;
}

// ── calibration stands ───────────────────────────────────────────────────────────────────────────────────────────

/** Standing still facing the camera, arms by the sides (the calibration hold). */
export function standFront(seconds = 3, o: { noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  return film({ fps: SRC_FPS, frames: Array.from({ length: Math.round(seconds * SRC_FPS) + 1 }, () => restPose()) }, o);
}

/** Standing still side-on, `near` side to the camera. */
export function standSide(near: Side = 'left', seconds = 2, o: { noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  return film({ fps: SRC_FPS, frames: Array.from({ length: Math.round(seconds * SRC_FPS) + 1 }, () => turnSide(restPose(), near)) }, o);
}

// ── T1 overhead squat, side view ─────────────────────────────────────────────────────────────────────────────────

export interface OhsOpts {
  /** Knee flexion at the bottom (deg). */
  kneeFlex?: number;
  /** Shin forward from vertical at the bottom (deg). */
  tibia?: number;
  /** Trunk forward from vertical at the bottom (deg). */
  trunk?: number;
  /** Shoulder flexion at the bottom (deg): 180 = arms in line with the trunk. */
  shoulderFlex?: number;
  /** Heels lift this far off the floor at the bottom (m). */
  heelRiseM?: number;
}
export const OHS_CLEAN: Required<OhsOpts> = { kneeFlex: 128, tibia: 36, trunk: 38, shoulderFlex: 175, heelRiseM: 0 };
const OHS_STAND = { kneeFlex: 2, tibia: 1, trunk: 0, shoulderFlex: 178, heelRiseM: 0 };
const OHS_STANCE = 0.12;

/** One overhead-squat frame built facing the camera: `d` 0 = standing, 1 = the bottom. */
export function ohsJoints(d: number, o: OhsOpts = {}): Joints {
  const b = { ...OHS_CLEAN, ...o };
  const p = (k: keyof typeof OHS_STAND) => lerp(OHS_STAND[k], b[k], d);
  const theta = rad(p('kneeFlex')), tau = rad(p('tibia')), lam = rad(p('trunk')), beta = rad(180 - p('shoulderFlex'));
  const lift = p('heelRiseM');
  const alpha = theta - tau;
  const j = restPose();
  for (const s of ['Left', 'Right'] as const) {
    const f = s === 'Left' ? 1 : -1;
    const ankle: V3 = [OHS_STANCE * f, 0.08 + lift, -0.02];
    const knee = add(ankle, [0, SHIN * Math.cos(tau), SHIN * Math.sin(tau)]);
    const hip = add(knee, [0.09 * f - OHS_STANCE * f, THIGH * Math.cos(alpha), -THIGH * Math.sin(alpha)]);
    j[`${s}Foot`] = ankle; j[`${s}Toe`] = [OHS_STANCE * f, 0.02, 0.11]; j[`${s}Leg`] = knee; j[`${s}UpLeg`] = hip;
  }
  const H = midV(j.LeftUpLeg, j.RightUpLeg);
  const u: V3 = [0, Math.cos(lam), Math.sin(lam)];
  j.Hips = add(H, mul(u, 0.03)); j.Chest = add(H, mul(u, 0.35)); j.Neck = add(H, mul(u, 0.57));
  j.Head = add(add(H, mul(u, 0.67)), [0, 0, 0.01]);
  const a: V3 = [0, Math.cos(lam + beta), Math.sin(lam + beta)];
  for (const s of ['Left', 'Right'] as const) {
    const f = s === 'Left' ? 1 : -1;
    const sh = add(add(H, mul(u, 0.5)), [0.19 * f, 0, 0]);
    j[`${s}Arm`] = sh; j[`${s}ForeArm`] = add(sh, mul(a, UPPER_ARM)); j[`${s}Hand`] = add(sh, mul(a, UPPER_ARM + FOREARM));
  }
  return j;
}

/** The truth of an overhead-squat frame, in its sagittal plane (what a side-on lens sees). */
export function ohsTruth(j: Joints) {
  const S = sagittal;
  const hipMid = midV(j.LeftUpLeg, j.RightUpLeg), shMid = midV(j.LeftArm, j.RightArm);
  const trunk = deg(Math.atan2(shMid[2] - hipMid[2], shMid[1] - hipMid[1]));
  const tibia = deg(Math.atan2(j.LeftLeg[2] - j.LeftFoot[2], j.LeftLeg[1] - j.LeftFoot[1]));
  return {
    kneeFlex: 180 - angle2(S(j.LeftUpLeg), S(j.LeftLeg), S(j.LeftFoot)),
    hipFlex: 180 - angle2(S(j.LeftArm), S(j.LeftUpLeg), S(j.LeftLeg)),
    trunk, tibia, trunkTibia: trunk - tibia,
    shoulderFlex: angle2(S(j.LeftUpLeg), S(j.LeftArm), S(j.LeftHand)),
    hipAboveKnee: (j.LeftUpLeg[1] - j.LeftLeg[1]) / THIGH,
  };
}

/** Overhead squats filmed side-on (left side to the camera, as TURN_CUE asks). `perRep` varies one rep. */
export function ohsSide(o: OhsOpts = {}, opts: { reps?: number; perRep?: (i: number) => OhsOpts; noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  const n = opts.reps ?? 3;
  const frames: Joints[] = [];
  for (let i = 0; i < n; i++) {
    const oi = { ...o, ...(opts.perRep?.(i) ?? {}) };
    for (const d of repCurve(i === 0 ? 1 : 0.4, 1, 0.5, 1, 0.5)) frames.push(turnSide(ohsJoints(d, oi), 'left'));
  }
  return film({ fps: SRC_FPS, frames }, opts);
}

/** Overhead squats filmed from the front (arms overhead; `kneeInL/R` caves a knee as squatPose does). */
export function ohsFront(o: { kneeInL?: number; kneeInR?: number } = {}, opts: { reps?: number; noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  const frames: Joints[] = [];
  for (let i = 0; i < (opts.reps ?? 3); i++) {
    for (const d of repCurve(i === 0 ? 1 : 0.4, 1, 0.5, 1, 0.5)) {
      const j = squatPose(d, o);
      // arms straight overhead, in line with the trunk
      const H = midV(j.LeftUpLeg, j.RightUpLeg), sh = midV(j.LeftArm, j.RightArm);
      const len = Math.hypot(...sub(sh, H));
      const u = mul(sub(sh, H), 1 / len);
      for (const s of ['Left', 'Right'] as const) {
        j[`${s}ForeArm`] = add(j[`${s}Arm`], mul(u, UPPER_ARM)); j[`${s}Hand`] = add(j[`${s}Arm`], mul(u, UPPER_ARM + FOREARM));
      }
      frames.push(j);
    }
  }
  return film({ fps: SRC_FPS, frames }, opts);
}

// ── T2 knee to wall, side view ───────────────────────────────────────────────────────────────────────────────────

export interface KneeWallOpts {
  /** The tested (front) leg's tibia angle at the deepest rock (deg). */
  tibiaMax?: number;
  /** The front heel lifts this far at the deepest rock (m): the rep is then invalid. */
  heelLiftM?: number;
}

/** One knee-to-wall frame built facing the camera, `tested` foot forward, `d` 0 = start, 1 = knee furthest forward. */
export function kneeWallJoints(tested: Side, d: number, o: KneeWallOpts = {}): Joints {
  const f = tested === 'left' ? 1 : -1;
  const tau = rad(lerp(15, o.tibiaMax ?? 44, d)), alpha = rad(35);
  const lift = (o.heelLiftM ?? 0) * d;
  const j = restPose();
  const T = tested === 'left' ? 'Left' : 'Right', B = tested === 'left' ? 'Right' : 'Left';
  const A: V3 = [0.10 * f, 0.08 + lift, 0.20];
  const K = add(A, [0, SHIN * Math.cos(tau), SHIN * Math.sin(tau)]);
  const Hf = add(K, [-0.01 * f, THIGH * Math.cos(alpha), -THIGH * Math.sin(alpha)]);
  const Hb: V3 = [Hf[0] - 0.18 * f, Hf[1], Hf[2]];
  const Ab: V3 = [-0.10 * f, 0.13, -0.30];
  j[`${T}Foot`] = A; j[`${T}Toe`] = [0.10 * f, 0.02, 0.33]; j[`${T}Leg`] = K; j[`${T}UpLeg`] = Hf;
  j[`${B}Foot`] = Ab; j[`${B}Toe`] = [-0.10 * f, 0.02, -0.20]; j[`${B}UpLeg`] = Hb;
  j[`${B}Leg`] = solveMiddle(Hb, Ab, THIGH, SHIN, [0, -0.2, 1]);
  const H = midV(Hf, Hb), rest = restPose(), restH = midV(rest.LeftUpLeg, rest.RightUpLeg);
  for (const k of ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) {
    j[k] = add(rest[k], sub(H, restH));
  }
  return j;
}

/** Knee-to-wall rocks filmed side-on, the TESTED side to the camera. */
export function kneeWall(tested: Side, o: KneeWallOpts = {}, opts: { reps?: number; perRep?: (i: number) => KneeWallOpts; noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  const frames: Joints[] = [];
  for (let i = 0; i < (opts.reps ?? 3); i++) {
    const oi = { ...o, ...(opts.perRep?.(i) ?? {}) };
    for (const d of repCurve(i === 0 ? 0.8 : 0.3, 0.8, 0.6, 0.8, 0.3)) frames.push(turnSide(kneeWallJoints(tested, d, oi), tested));
  }
  return film({ fps: SRC_FPS, frames }, opts);
}

/** The tested shin's angle from vertical in the sagittal plane. */
export function kneeWallTruth(j: Joints, tested: Side) {
  const T = tested === 'left' ? 'Left' : 'Right';
  return { tibia: deg(Math.atan2(j[`${T}Leg`][2] - j[`${T}Foot`][2], j[`${T}Leg`][1] - j[`${T}Foot`][1])) };
}

// ── T3 single-leg squat, front view ──────────────────────────────────────────────────────────────────────────────

export interface SlsOpts {
  /** Stance knee flexion at the bottom (deg). */
  depth?: number;
  /** The stance knee's sideways travel inward at the bottom (m), + = toward the midline. */
  kneeIn?: number;
  /** The free side's hip drops this many degrees at the bottom. */
  pelvicDrop?: number;
  /** The trunk leans sideways this many degrees at the bottom (toward the stance side). */
  trunkLean?: number;
  /** The free foot touches the floor at the bottom. */
  touchDown?: boolean;
}
export const SLS_CLEAN: Required<SlsOpts> = { depth: 62, kneeIn: 0, pelvicDrop: 1, trunkLean: 2, touchDown: false };

/** One single-leg squat frame, `stance` leg, built facing the camera. `d` 0 = standing on one leg, 1 = the bottom. */
export function slsJoints(stance: Side, d: number, o: SlsOpts = {}): Joints {
  const b = { ...SLS_CLEAN, ...o };
  const f = stance === 'left' ? 1 : -1;
  const S = stance === 'left' ? 'Left' : 'Right', F = stance === 'left' ? 'Right' : 'Left';
  const theta = rad(lerp(3, b.depth, d)), half = theta / 2;
  const A: V3 = [0.10 * f, 0.08, -0.02];
  const Kstraight = add(A, [0, SHIN * Math.cos(half), SHIN * Math.sin(half)]);
  const Hs = add(Kstraight, [0, THIGH * Math.cos(half), -THIGH * Math.sin(half)]);
  // the knee, rotated about its hip–ankle line toward the midline by the angle that puts it kneeIn off the line
  const axisLen = Math.hypot(...sub(A, Hs));
  const along = (THIGH * THIGH - SHIN * SHIN + axisLen * axisLen) / (2 * axisLen);
  const hOff = Math.sqrt(Math.max(1e-9, THIGH * THIGH - along * along));
  const phi = Math.asin(Math.max(-0.95, Math.min(0.95, (b.kneeIn * d) / hOff)));
  const K = solveMiddle(Hs, A, THIGH, SHIN, [-f * Math.sin(phi), 0, Math.cos(phi)]);
  const drop = rad(b.pelvicDrop * d);
  const Hf: V3 = [Hs[0] - 0.18 * f, Hs[1] - 0.18 * Math.tan(drop), Hs[2]];
  const j = restPose();
  j[`${S}Foot`] = A; j[`${S}Toe`] = [0.10 * f, 0.02, 0.11]; j[`${S}Leg`] = K; j[`${S}UpLeg`] = Hs; j[`${F}UpLeg`] = Hf;
  // the free leg: thigh forward, shin hanging; at a touch-down the foot reaches the floor
  const Kf = add(Hf, [0, -THIGH * Math.cos(rad(70)), THIGH * Math.sin(rad(70))]);
  let Af = add(Kf, [0, -SHIN, 0.03]);
  if (b.touchDown && d > 0.6) Af = [Af[0], 0.08, Hf[2] + 0.22];
  j[`${F}Leg`] = b.touchDown && d > 0.6 ? solveMiddle(Hf, Af, THIGH, SHIN, [0, 0, 1]) : Kf;
  j[`${F}Foot`] = Af; j[`${F}Toe`] = add(Af, [0, -0.06, 0.12]);
  // the upper body rides on the pelvis and leans sideways toward the stance leg
  const H = midV(Hs, Hf), rest = restPose(), restH = midV(rest.LeftUpLeg, rest.RightUpLeg);
  const lean = rad(b.trunkLean * d) * -f;
  for (const k of ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) {
    j[k] = rotZ(add(rest[k], sub(H, restH)), H, lean);
  }
  return handsOnHips(j);
}

/** The truth of a single-leg squat frame, in the frontal plane (what a facing lens sees) and in 3-D for depth. */
export function slsTruth(j: Joints, stance: Side) {
  const S = stance === 'left' ? 'Left' : 'Right', F = stance === 'left' ? 'Right' : 'Left';
  const f = stance === 'left' ? 1 : -1;
  const hip = j[`${S}UpLeg`], knee = j[`${S}Leg`], ankle = j[`${S}Foot`];
  const mag = 180 - angle2(frontal(hip), frontal(knee), frontal(ankle));
  const t = (knee[1] - hip[1]) / (ankle[1] - hip[1]);
  const lineX = hip[0] + (ankle[0] - hip[0]) * t;
  const inward = (knee[0] - lineX) * -f;   // toward the midline is −X for a left leg
  const u = sub(hip, knee), v = sub(ankle, knee);
  const k3 = 180 - deg(Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v))));
  const Hf = j[`${F}UpLeg`];
  const shMid = midV(j.LeftArm, j.RightArm), hipMid = midV(hip, Hf);
  return {
    fppa: inward >= 0 ? mag : -mag,
    pelvicTilt: deg(Math.atan2(hip[1] - Hf[1], Math.abs(hip[0] - Hf[0]))),
    trunkLean: Math.abs(deg(Math.atan2(shMid[0] - hipMid[0], shMid[1] - hipMid[1]))),
    kneeFlex: k3,
  };
}

/** Single-leg squats filmed from the front. */
export function singleLegSquat(stance: Side, o: SlsOpts = {}, opts: { reps?: number; perRep?: (i: number) => SlsOpts; noise?: boolean; seed?: number; fps?: number } = {}): Capture {
  const frames: Joints[] = [];
  for (let i = 0; i < (opts.reps ?? 5); i++) {
    const oi = { ...o, ...(opts.perRep?.(i) ?? {}) };
    for (const d of repCurve(i === 0 ? 0.8 : 0.3, 0.8, 0.3, 0.8, 0.3)) frames.push(slsJoints(stance, d, oi));
  }
  return film({ fps: SRC_FPS, frames }, opts);
}

// ── T5 countermovement jump, front view ──────────────────────────────────────────────────────────────────────────

export const G = 9.81;

export interface CmjJump {
  /** Jump height (m) → flight time 2·sqrt(2h/g). */
  heightM: number;
  /** Landing depth as squatPose depth (0..1): 0.5 ≈ hips 26 cm down, 0.1 a stiff landing. */
  landDepth?: number;
  /** Both knees cave this far on the landing (m). */
  landKneeIn?: number;
  /** The right foot lands this many ms after the left. */
  rightLateMs?: number;
  /** The hands leave the hips (an arm swing): not the standard jump. */
  armSwing?: boolean;
}
/** Flight time (s) of a jump of height h (m). */
export const flightOf = (h: number) => 2 * Math.sqrt((2 * h) / G);

/** Hands-on-hips CMJs filmed from the front. Truth: each jump's flight time and height. */
export function cmj(jumps: readonly CmjJump[], opts: { fps?: number; noise?: boolean; seed?: number } = {}): Capture & { truth: { flightMs: number; heightCm: number }[] } {
  const frames: Joints[] = [];
  const truth: { flightMs: number; heightCm: number }[] = [];
  const hold = (n: number, j: () => Joints) => { for (let i = 0; i < n; i++) frames.push(j()); };
  const standing = () => handsOnHips(squatPose(0));
  hold(Math.round(1.2 * SRC_FPS), standing);
  for (const jp of jumps) {
    const T = flightOf(jp.heightM), v0 = G * T / 2;
    truth.push({ flightMs: T * 1000, heightCm: jp.heightM * 100 });
    // the dip and the drive
    for (const d of [...repCurve(0, 0.35, 0.05, 0.25, 0)]) frames.push(handsOnHips(squatPose(0.55 * d)));
    // flight: the standing body, ballistic
    const nFlight = Math.max(2, Math.round(T * SRC_FPS));
    const late = (jp.rightLateMs ?? 0) / 1000;
    for (let i = 1; i <= nFlight; i++) {
      const t = (i / nFlight) * T, y = v0 * t - (G * t * t) / 2;
      let j = mapJ(standing(), (p) => [p[0], p[1] + y, p[2]]);
      if (late > 0) {
        // the right leg hangs higher so its foot lands `late` after the left: tucked by the drop it covers in that time
        const tuck = Math.min(0.2, v0 * late);
        for (const k of ['RightLeg', 'RightFoot', 'RightToe'] as const) j[k] = add(j[k], [0, k === 'RightLeg' ? tuck / 2 : tuck, 0]);
      }
      if (jp.armSwing) for (const s of ['Left', 'Right'] as const) { j[`${s}Hand`] = add(j[`${s}Arm`], [0, UPPER_ARM + FOREARM, 0]); j[`${s}ForeArm`] = add(j[`${s}Arm`], [0, UPPER_ARM, 0]); }
      frames.push(j);
    }
    if (late > 0) {
      // the left foot is down; the right one comes down over `late`
      const n = Math.max(1, Math.round(late * SRC_FPS)), tuck = Math.min(0.2, v0 * late);
      for (let i = 1; i <= n; i++) {
        const j = standing(), r = tuck * (1 - i / n);
        for (const k of ['RightLeg', 'RightFoot', 'RightToe'] as const) j[k] = add(j[k], [0, k === 'RightLeg' ? r / 2 : r, 0]);
        frames.push(j);
      }
    }
    // landing: absorb, stand back up, stand still
    const land = jp.landDepth ?? 0.5, kneeIn = jp.landKneeIn ?? 0;
    for (const d of repCurve(0, 0.15, 0.05, 0.45, 1.0)) frames.push(handsOnHips(squatPose(land * d, { kneeInL: kneeIn, kneeInR: kneeIn })));
  }
  return { ...film({ fps: SRC_FPS, frames }, opts), truth };
}

// ── the synthetic athlete's calibration ──────────────────────────────────────────────────────────────────────────

/** The calibration a synthetic session opens with: 3 s facing, 2 s side-on (left to the lens), clean or jittered. */
export function syntheticCalibration(o: { noise?: boolean; seed?: number } = {}): Calibration {
  const f = standFront(3, o), s = standSide('left', 2, { ...o, seed: (o.seed ?? 7) + 1 });
  const front = calibrateFront(f.frames, f.aspect), side = calibrateSide(s.frames, s.aspect);
  if (!front.ok || !side.ok) throw new Error(`[assess] synthetic calibration failed: ${!front.ok ? front.why : ''} ${!side.ok ? side.why : ''}`);
  return { aspect: f.aspect, front: front.value, side: side.value };
}
