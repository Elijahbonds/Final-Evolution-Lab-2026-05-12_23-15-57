// streamKit — small edits to a pose stream for tests and probes of the body reader (movement play, phase 2,
// 2026-09-24): a still stand held before a take (what the space check's calibration sees), a body gone from the
// frame for a while (lost / found), and scripted bodies (a squat, a calf raise, a ballistic jump, knee lifts) the
// adversarial review built its breaking streams from.
//
// Most fixtures start mid-motion (a jump at 0.4 s, a jog from the first frame), and the reader calibrates on a still
// stand the way a player would before playing (phase 4's space check). holdStill makes that stand from one of the
// take's own standing frames: the same pose repeated at the camera's rate, each copy with FRESH landmark jitter of the
// synth's own noise model (a repeated frame would be a statue, and a statue passes any stillness gate for free).
//
// The scripted bodies are synth.ts's rest body moved by hand: its truth comes from synthesize() like any clip's, so a
// stream can be rebuilt under any camera, rate or noise the fixtures (one camera, baked) cannot be.
//
// Pure: no DOM, no fs, deterministic for a seed.
import { LANDMARK_COUNT, type PoseFrame, emptyFrame } from './landmarks';
import { mulberry32, DEFAULT_NOISE, moveJoints, type NoiseSpec, type Joints, type JointClip, type V3 } from './synth';

// the synth's torso + face points (their jitter is the smaller one), as synth.ts TORSO_FACE
const TORSO_FACE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24]);

function gaussian(rand: () => number): () => number {
  return () => {
    const u = Math.max(1e-12, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export interface HoldOptions {
  /** Seconds held. */
  sec: number;
  /** The camera's rate. */
  fps: number;
  /** Capture time (ms) of the take's first frame: the stand ends one frame before it. */
  beforeT: number;
  seed?: number;
  noise?: NoiseSpec;
  /** Image width / height (the synth's 640×480). */
  aspect?: number;
  /** Capture → app latency stamped on `arrive` (ms). */
  latencyMs?: number;
}

/** `frame` held still for opt.sec, jittered like a live camera, ending one frame before opt.beforeT. */
export function holdStill(frame: PoseFrame, opt: HoldOptions): PoseFrame[] {
  if (!frame.present) throw new Error('[streamKit] holdStill needs a frame with a body');
  const n = Math.max(1, Math.round(opt.sec * opt.fps));
  const noise = opt.noise ?? DEFAULT_NOISE, aspect = opt.aspect ?? 640 / 480;
  const gauss = gaussian(mulberry32(opt.seed ?? 11));
  const out: PoseFrame[] = [];
  for (let k = n; k >= 1; k--) {
    const t = opt.beforeT - (k * 1000) / opt.fps;
    const image = frame.image.map((l, i) => {
      const s = (TORSO_FACE.has(i) ? noise.imageTorso : noise.imageLimb) * (l.v < 0.5 ? 3 : 1);
      return { x: l.x + gauss() * s, y: l.y + gauss() * s * aspect, z: l.z + gauss() * s * noise.depthScale, v: l.v };
    });
    const world = frame.world?.map((w, i) => {
      const s = (TORSO_FACE.has(i) ? noise.worldTorso : noise.worldLimb) * (frame.image[i].v < 0.5 ? 3 : 1);
      return { x: w.x + gauss() * s, y: w.y + gauss() * s, z: w.z + gauss() * s * noise.depthScale };
    });
    const f: PoseFrame = { t, present: true, image, arrive: t + (opt.latencyMs ?? 66) };
    if (world) f.world = world;
    out.push(f);
  }
  if (out.some((f) => f.image.length !== LANDMARK_COUNT)) throw new Error('[streamKit] a frame without 33 points');
  return out;
}

/** The body gone from the frame (the model finds none) for every frame captured in [fromT, toT). */
export function dropout(frames: PoseFrame[], fromT: number, toT: number): PoseFrame[] {
  return frames.map((f) => (f.t >= fromT && f.t < toT ? emptyFrame(f.t, f.arrive) : f));
}

// ── scripted bodies ──────────────────────────────────────────────────────────────────────────────────────────────

const G = 9.81;
const UPPER = ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const;
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The knee of a two-bone leg from hip H to ankle A (bone lengths l1, l2), bent forward (+z, toward the camera). */
function kneeFor(H: V3, A: V3, l1: number, l2: number): { K: V3; A: V3 } {
  const v = sub3(A, H), D = Math.min(l1 + l2 - 1e-4, len3(v)), u = scale3(v, 1 / len3(v));
  let p: V3 = [-u[0] * u[2], -u[1] * u[2], 1 - u[2] * u[2]];
  p = scale3(p, 1 / Math.max(1e-9, len3(p)));
  const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return { K: add3(H, add3(scale3(u, along), scale3(p, h))), A: add3(H, scale3(u, D)) };
}

/**
 * A crouch: the hips lowered `depth` m and moved back `back` m (away from the camera), the knees bent forward over
 * planted feet, the torso leaned forward `leanDeg`.
 */
export function crouch(j: Joints, depth: number, back = depth * 0.4, leanDeg = depth * 60): Joints {
  const out = { ...j };
  const d: V3 = [0, -depth, -back];
  const pv = add3(scale3(add3(j.LeftUpLeg, j.RightUpLeg), 0.5), d), a = (leanDeg * Math.PI) / 180;
  for (const n of UPPER) {
    const r = sub3(add3(j[n], d), pv);
    out[n] = [pv[0] + r[0], pv[1] + r[1] * Math.cos(a) - r[2] * Math.sin(a), pv[2] + r[1] * Math.sin(a) + r[2] * Math.cos(a)];
  }
  for (const s of ['Left', 'Right'] as const) {
    const H = add3(j[`${s}UpLeg`], d);
    const leg = kneeFor(H, j[`${s}Foot`], len3(sub3(j[`${s}Leg`], j[`${s}UpLeg`])), len3(sub3(j[`${s}Foot`], j[`${s}Leg`])));
    out[`${s}UpLeg`] = H; out[`${s}Leg`] = leg.K;
  }
  return out;
}

/** A calf raise: each foot turned about its ball (the Toe joint) `deg`, the body above riding up with the ankles. */
export function heelsUp(j: Joints, deg: number): Joints {
  const a = (deg * Math.PI) / 180, out = { ...j };
  let lift: V3 = [0, 0, 0];
  for (const s of ['Left', 'Right'] as const) {
    const T = j[`${s}Toe`], v = sub3(j[`${s}Foot`], T);
    const f: V3 = [T[0] + v[0], T[1] + v[1] * Math.cos(a) - v[2] * Math.sin(a), T[2] + v[1] * Math.sin(a) + v[2] * Math.cos(a)];
    lift = sub3(f, j[`${s}Foot`]);
    out[`${s}Foot`] = f;
  }
  for (const n of [...UPPER, 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'] as const) out[n] = add3(j[n], lift);
  return out;
}

/** One foot lifted `lift` m (and a third of that forward), the knee driven up: a running step's swing leg. */
export function kneeUp(j: Joints, side: 'Left' | 'Right', lift: number): Joints {
  if (lift <= 0) return j;
  const out = { ...j }, H = j[`${side}UpLeg`], A = j[`${side}Foot`];
  const leg = kneeFor(H, [A[0], A[1] + lift, A[2] + lift * 0.3], len3(sub3(j[`${side}Leg`], H)), len3(sub3(A, j[`${side}Leg`])));
  out[`${side}Leg`] = leg.K; out[`${side}Foot`] = leg.A;
  out[`${side}Toe`] = add3(j[`${side}Toe`], sub3(leg.A, A));
  return out;
}

/** The whole body turned `deg` about the vertical through the origin (+ = its left shoulder away from the camera). */
export const turnBody = (j: Joints, deg: number): Joints => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]])) as Joints;
};

/**
 * Both arms swung about the shoulders in the body's forward plane: u = 0 hanging, 0.5 straight out toward the camera,
 * 1 overhead (negative = back behind the hips). The forearm keeps its bend.
 */
export function armsSwing(j: Joints, u: number): Joints {
  const a = u * Math.PI, c = Math.cos(a), s = Math.sin(a), out = { ...j };
  for (const side of ['Left', 'Right'] as const) {
    const S = j[`${side}Arm`];
    const rot = (p: V3): V3 => { const d = sub3(p, S); return [S[0] + d[0], S[1] + d[1] * c - d[2] * s, S[2] + d[1] * s + d[2] * c]; };
    out[`${side}ForeArm`] = rot(j[`${side}ForeArm`]); out[`${side}Hand`] = rot(j[`${side}Hand`]);
  }
  return out;
}

/** Heels-up angle (deg) of a jump's toe-off and landing. */
const TOE_OFF_DEG = 35;

/**
 * A two-foot jump starting at 0 s: a dip of `dip` m over 0.35 s, a push that leaves the floor at v0 m/s (the hips
 * accelerating evenly through the dip and the calf raise), the ballistic flight on its toes, a toe-first landing, an
 * absorb of `absorb` m and the stand back up. `tOff` / `tLand` / `end` are its instants (s).
 */
export function scriptedJump(base: Joints, v0: number, dip = 0.3, absorb = 0.15, armSwing = false) {
  const raise = heelsUp(base, TOE_OFF_DEG).LeftFoot[1] - base.LeftFoot[1];
  const push = dip + raise, tPush = 0.35, tp = (2 * push) / v0, tf = (2 * v0) / G;
  const tOff = tPush + tp, tLand = tOff + tf, tFlat = tLand + 0.06, tLow = tFlat + 0.22, end = tLow + 0.5;
  // the book's arm swing: back through the dip, driven overhead by the toe-off, held up in the air, swung down as the
  // feet land (a fast downward swing from overhead: the truth's "strike", on the floor)
  const arms = (t: number) => (t < tPush ? -0.2 * ease(t / tPush) : t < tOff ? -0.2 + 1.2 * ease((t - tPush) / (tOff - tPush))
    : t < tLand - 0.05 ? 1 : 1 - ease((t - tLand + 0.05) / 0.2));
  const body = (t: number): Joints => {
    if (t <= 0 || t >= end) return base;
    if (t < tPush) return crouch(base, dip * ease(t / tPush));
    if (t < tOff) {
      const u = push * ((t - tPush) / tp) ** 2;
      return u < dip ? crouch(base, dip - u) : heelsUp(base, (TOE_OFF_DEG * (u - dip)) / raise);
    }
    if (t < tLand) { const x = t - tOff; return moveJoints(heelsUp(base, TOE_OFF_DEG), [0, v0 * x - (G * x * x) / 2, 0]); }
    if (t < tFlat) return heelsUp(base, TOE_OFF_DEG * (1 - (t - tLand) / (tFlat - tLand)));
    if (t < tLow) return crouch(base, absorb * Math.sin((((t - tFlat) / (tLow - tFlat)) * Math.PI) / 2));
    return crouch(base, absorb * (1 - ease((t - tLow) / (end - tLow))));
  };
  const pose = armSwing ? (t: number) => armsSwing(body(t), arms(t)) : body;
  return { pose, tOff, tLand, end, heightM: (v0 * v0) / (2 * G) };
}

/** A stretch of a script: its length (s) and the pose at a time (s) inside it. */
export type Beat = [sec: number, pose: (t: number) => Joints];
export const hold = (j: Joints, sec: number): Beat => [sec, () => j];
export const jumpBeat = (base: Joints, v0: number, dip?: number, armSwing = false): Beat => {
  const J = scriptedJump(base, v0, dip, undefined, armSwing);
  return [J.end, J.pose];
};
/** Running in place at `hz` steps per second, each knee driven so its foot lifts `lift` m. */
export const jogBeat = (base: Joints, sec: number, hz: number, lift: number): Beat => [sec, (t) => {
  const s = Math.sin(t * hz * Math.PI);
  return kneeUp(kneeUp(base, 'Left', Math.max(0, s) * lift), 'Right', Math.max(0, -s) * lift);
}];

/** The beats one after another, sampled at `fps` (the source clip's rate). */
export function script(beats: Beat[], fps = 120): JointClip {
  const dur = beats.reduce((a, b) => a + b[0], 0), frames: Joints[] = [];
  for (let k = 0; k <= Math.round(dur * fps); k++) {
    let t = k / fps, i = 0;
    while (i < beats.length - 1 && t > beats[i][0]) { t -= beats[i][0]; i++; }
    frames.push(beats[i][1](Math.min(t, beats[i][0])));
  }
  return { fps, frames };
}
