// synth — synthetic camera pose streams with GROUND TRUTH, so every body detector is tested without a camera
// (movement play, phase 1, 2026-09-24).
//
// There was no recorded MediaPipe stream anywhere in the repo, and every pose test hand-built 12 points. This turns
// real motion (the owner's DeepMotion takes, CMU captures, any 18-joint clip) into what the phone would see:
//
//   joints (m)  ──toRoom──▶  the living room: facing the camera, travel taken out, feet pulled in under the hips
//               ──bodyPoints──▶  the 33 MediaPipe points in the world
//               ──virtual webcam──▶  image landmarks (x,y 0..1, z, visibility) + world landmarks (hip-centred)
//               ──noise / visibility / drops / misses / fps / latency (seeded)──▶  PoseFrame[]
//
// …and, from the SOURCE joints (never from the noisy stream), what really happened: each foot's height and contact,
// take-off / landing / apex of every jump, one foot or two, step contacts, and wrist events (the slam's strike, a dunk's
// reach, a shot's release, a punch). Detectors are graded against that.
//
// World frame here: metres, RIGHT-handed, Y up, the floor at y = 0, the player at the origin facing +Z, the camera on
// +Z looking back at them. MediaPipe's "left" is the subject's left, so facing the camera the left shoulder lands on
// the image's right (x[11] > x[12]); synthesize() refuses a stream where that is not so (a mirrored source).
//
// Pure: no DOM, no fs, deterministic for a seed.
import {
  LANDMARK_COUNT, CORE_POINTS, NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP,
  type Lm, type Wm, type PoseFrame,
} from './landmarks';

export type V3 = [number, number, number];

/** The 18 joints a clip carries — the same names as mocapRetarget's CANON, so a sources.mts JointStream plugs in. */
export const JOINTS = [
  'Hips', 'Chest', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToe', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToe',
] as const;
export type JointName = typeof JOINTS[number];
export type Joints = Record<JointName, V3>;

/**
 * Where the foot's MediaPipe points sit relative to the rig's Foot/Toe joints. Rigs disagree: DeepMotion's Foot
 * joint rides ~15 cm up the shin and its Toe is the ball of the foot; CMU's toe is the tip. toRoom() measures it.
 */
export interface FootModel {
  /** Metres to move the ankle point down the shin line from the Foot joint (so a planted ankle sits ~8.5 cm up). */
  ankleDrop: number;
  /** The heel point in the foot's own frame (along the foot, along the foot's up), from the ankle point. */
  heelF: number;
  heelU: number;
  /** Metres from the Toe joint on to the toe tip (MediaPipe's foot_index). */
  toeExtend: number;
}
export const DEFAULT_FOOT: FootModel = { ankleDrop: 0, heelF: -0.025, heelU: -0.0855, toeExtend: 0.05 };

/** A clip in the synth's world frame (see the header). */
export interface JointClip { fps: number; frames: Joints[]; foot?: FootModel }

// ── vectors ──────────────────────────────────────────────────────────────────────────────────────────────────────
const UP: V3 = [0, 1, 0];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3, fallback: V3 = [0, 0, 1]): V3 => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback; };
const flat = (a: V3): V3 => [a[0], 0, a[2]];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a with its component along unit n removed. */
const orth = (a: V3, n: V3): V3 => sub(a, mul(n, dot(a, n)));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : 0; };
const median = (v: number[]) => pct(v, 0.5);

const mapJoints = (j: Joints, fn: (p: V3, name: JointName) => V3): Joints =>
  Object.fromEntries(JOINTS.map((n) => [n, fn(j[n], n)])) as Joints;

/** The body's horizontal left and forward. Right-handed: facing +Z with the left on +X, forward = left × up. */
export function bodyAxes(j: Joints): { left: V3; fwd: V3 } {
  const left = norm(flat(add(sub(j.LeftUpLeg, j.RightUpLeg), sub(j.LeftArm, j.RightArm))), [1, 0, 0]);
  return { left, fwd: cross(left, UP) };
}
/** Which way the toes point (horizontal) — handedness-free, so it can check the labels. */
const toeFacing = (j: Joints): V3 => norm(flat(add(sub(j.LeftToe, j.LeftFoot), sub(j.RightToe, j.RightFoot))));
/** Which way the bent knees point (horizontal), or null when the legs are too straight to say. Also handedness-free. */
function kneeFacing(j: Joints): V3 | null {
  let v: V3 = [0, 0, 0];
  for (const s of ['Left', 'Right'] as const) {
    const H = j[`${s}UpLeg`], K = j[`${s}Leg`], A = j[`${s}Foot`];
    const axis = norm(sub(A, H));
    v = add(v, orth(sub(K, H), axis));   // the knee's offset from the hip–ankle line: forward when it bends
  }
  const f = flat(v);
  return len(f) > 0.03 ? norm(f) : null;
}

// ── the 33 points in the world ───────────────────────────────────────────────────────────────────────────────────
// Offsets are an average adult's (metres); MediaPipe's own face and hand points are this rough at 640×480.

type FootSide = 'Left' | 'Right';
function footPoints(j: Joints, s: FootSide, foot: FootModel, left: V3): { ankle: V3; heel: V3; tip: V3 } {
  const F = j[`${s}Foot`], T = j[`${s}Toe`], K = j[`${s}Leg`];
  const ankle = foot.ankleDrop > 0 ? add(F, mul(norm(sub(F, K), [0, -1, 0]), foot.ankleDrop)) : F;
  const f = norm(sub(T, F), [0, 0, 1]);
  // the foot's up: square to the sole, taken against the body's left so it survives a foot pointed straight down
  const c = cross(f, left);
  const u = len(c) > 0.3 ? norm(c) : norm(orth(UP, f), [0, 1, 0]);
  const heel = add(ankle, add(mul(f, foot.heelF), mul(u, foot.heelU)));
  // toes flex: the tip follows half the foot's pitch, so a planted ball keeps the tip on the floor at toe-off
  const tip = add(T, mul(norm([f[0], f[1] * 0.5, f[2]]), foot.toeExtend));
  return { ankle, heel, tip };
}

/** The 33 MediaPipe points (world, metres) for one frame of joints. */
export function bodyPoints(j: Joints, foot: FootModel = DEFAULT_FOOT): V3[] {
  const { left, fwd } = bodyAxes(j);
  const p: V3[] = new Array(LANDMARK_COUNT);
  // head: its up from the neck, its left from the shoulders, so a tilt or a look-up moves the face
  const hu = norm(sub(j.Head, j.Neck), [0, 1, 0]);
  const hl = norm(orth(sub(j.LeftArm, j.RightArm), hu), left);
  const hf = cross(hl, hu);
  const at = (o: V3, f: number, u: number, l: number): V3 => add(o, add(mul(hf, f), add(mul(hu, u), mul(hl, l))));
  const nose = at(j.Head, 0.10, 0.07, 0);
  p[0] = nose;
  p[1] = at(nose, -0.02, 0.035, 0.015); p[2] = at(nose, -0.025, 0.035, 0.032); p[3] = at(nose, -0.035, 0.035, 0.045);
  p[4] = at(nose, -0.02, 0.035, -0.015); p[5] = at(nose, -0.025, 0.035, -0.032); p[6] = at(nose, -0.035, 0.035, -0.045);
  p[7] = at(j.Head, -0.01, 0.07, 0.075); p[8] = at(j.Head, -0.01, 0.07, -0.075);
  p[9] = at(nose, -0.01, -0.035, 0.025); p[10] = at(nose, -0.01, -0.035, -0.025);
  // arms
  p[11] = j.LeftArm; p[12] = j.RightArm;
  p[13] = j.LeftForeArm; p[14] = j.RightForeArm;
  p[15] = j.LeftHand; p[16] = j.RightHand;
  // hands: along the forearm line, the thumb toward the body's front (a relaxed hand hangs thumb-forward)
  const hand = (s: 'Left' | 'Right', pinky: number, index: number, thumb: number) => {
    const H = j[`${s}Hand`], d = norm(sub(H, j[`${s}ForeArm`]), [0, -1, 0]);
    const th = norm(orth(fwd, d), norm(orth(UP, d), left));
    p[pinky] = add(H, add(mul(d, 0.07), mul(th, -0.02)));
    p[index] = add(H, add(mul(d, 0.085), mul(th, 0.01)));
    p[thumb] = add(H, add(mul(d, 0.045), mul(th, 0.035)));
  };
  hand('Left', 17, 19, 21); hand('Right', 18, 20, 22);
  // legs
  p[23] = j.LeftUpLeg; p[24] = j.RightUpLeg;
  p[25] = j.LeftLeg; p[26] = j.RightLeg;
  const lf = footPoints(j, 'Left', foot, left), rf = footPoints(j, 'Right', foot, left);
  p[27] = lf.ankle; p[28] = rf.ankle;
  p[29] = lf.heel; p[30] = rf.heel;
  p[31] = lf.tip; p[32] = rf.tip;
  return p;
}

/** Height of each foot's lowest point (heel or toe tip) — the floor line is read from these. */
function lowestFootY(j: Joints, foot: FootModel): [number, number] {
  const { left } = bodyAxes(j);
  const l = footPoints(j, 'Left', foot, left), r = footPoints(j, 'Right', foot, left);
  return [Math.min(l.heel[1], l.tip[1]), Math.min(r.heel[1], r.tip[1])];
}

// ── the living room ──────────────────────────────────────────────────────────────────────────────────────────────

export interface RoomOptions {
  /** Source units → metres (cm sources: 0.01). */
  scale: number;
  /** Source frame range [from, to). */
  from?: number;
  to?: number;
  /** Flip X: a left-handed source (the handedness check in synthesize() says when). */
  mirror?: boolean;
  /**
   * Turn the body to face the camera: 'auto' = its mean facing over faceRange; a number = the source's facing yaw
   * (deg) to undo; 'follow' = every frame by its own slow heading (a curved run faces the camera throughout).
   */
  yawDeg?: number | 'auto' | 'follow';
  /** Frames (relative to `from`) whose facing is used by 'auto'. Default: the whole range. */
  faceRange?: [number, number];
  /**
   * Root x/z travel: 'remove' (subtract the slow path, soft-clamp what is left), 'scale' (keep travelScale of the slow
   * path — a shuffle across a gym becomes a shuffle across the rug), 'clamp' (soft-clamp only), 'keep'.
   */
  travel?: 'remove' | 'scale' | 'clamp' | 'keep';
  /** For 'scale': the share of the slow path that is kept. */
  travelScale?: number;
  /** The moving average that counts as travel (s). */
  travelWindowSec?: number;
  /** Soft limit on what is left of the travel (m): the living room's ±0.5 m. */
  clampM?: number;
  /** < 1 pulls each low foot's fore-aft offset from its hip in (IK keeps the bones): an approach becomes steps in place. */
  strideScale?: number;
  /** Metres from the Toe joint to the toe tip (DeepMotion ToeBase is the ball: 0.05; CMU's FootEnd is the tip: 0). */
  toeExtend?: number;
  /** The floor line is the feet's rolling low over this window (s), which takes out a source's vertical drift; 0 = one floor. */
  floorWindowSec?: number;
  /**
   * The span MediaPipe's shoulder points should have (m). A rig whose shoulder joints sit closer together than a real
   * shoulder girdle (every CMU file shares one DAZ skeleton at 0.23 m) gets each arm moved out along the shoulder line
   * to it, so the image shoulder width, the ruler the body gates are measured in, is a person's. Only ever widens.
   */
  shoulderSpanM?: number;
}

export interface RoomInfo {
  yawDeg: number;
  /** The source's own travel that was taken out (m, start to end of the range, horizontal). */
  travelM: number;
  /** How far the source's floor wandered over the range (m) — taken out of every joint. */
  floorDriftM: number;
  /** The bent knees (or the toes) and the labels disagree about which way is forward: a mirrored (left-handed) source. */
  leftHanded: boolean;
  foot: FootModel;
  /** Metres each arm was moved out along the shoulder line (shoulderSpanM); 0 = the rig's own shoulders. */
  shoulderOutM: number;
}

/**
 * A source clip → the living room: metres, facing the camera, travel out, floor at 0. `frames` is the whole take
 * (its units, Y up); the travel path is read with the frames around the range so the range's ends are not skewed.
 */
export function toRoom(src: { fps: number; frames: Joints[] }, opt: RoomOptions): { clip: JointClip; info: RoomInfo } {
  const fps = src.fps;
  const from = Math.max(0, opt.from ?? 0), to = Math.min(src.frames.length, opt.to ?? src.frames.length);
  if (to - from < 2) throw new Error('[synth] toRoom: empty range');
  const W = Math.max(1, Math.round((opt.travelWindowSec ?? 1.0) * fps));
  // work on the range plus a travel window each side
  const a = Math.max(0, from - W), b = Math.min(src.frames.length, to + W);
  let fr = src.frames.slice(a, b).map((j) => mapJoints(j, (p) => [p[0] * opt.scale * (opt.mirror ? -1 : 1), p[1] * opt.scale, p[2] * opt.scale]));
  const off = from - a, n = to - from;
  // start at the origin
  const h0 = mid(fr[off].LeftUpLeg, fr[off].RightUpLeg);
  fr = fr.map((j) => mapJoints(j, (p) => [p[0] - h0[0], p[1], p[2] - h0[2]]));
  // Handedness is a property of the FILE, so the whole take votes: do the labels' forward and the anatomy agree? The
  // bent knees lead (they only bend forward); the toes only when the legs are too straight to say — DeepMotion turns
  // a foot backwards for whole stretches, and a window's own vote once turned the owner's dunk away from the camera.
  let kneeAgree = 0, kneeVotes = 0, toeAgree = 0, toeVotes = 0;
  for (const raw of src.frames) {
    const j = mapJoints(raw, (p) => [p[0] * (opt.mirror ? -1 : 1), p[1], p[2]]);
    const { fwd } = bodyAxes(j), knee = kneeFacing(j);
    if (knee) { kneeVotes++; if (dot(fwd, knee) >= 0) kneeAgree++; }
    toeVotes++; if (dot(fwd, toeFacing(j)) >= 0) toeAgree++;
  }
  const leftHanded = kneeVotes >= 10 ? kneeAgree / kneeVotes < 0.5 : toeVotes > 0 && toeAgree / toeVotes < 0.5;
  const sign = leftHanded ? -1 : 1;
  // facing: the labels' mean forward over faceRange
  const [f0, f1] = opt.faceRange ?? [0, n];
  let sx = 0, sz = 0;
  for (let i = off + Math.max(0, f0); i < off + Math.min(n, f1); i++) {
    const { fwd } = bodyAxes(fr[i]);
    sx += fwd[0]; sz += fwd[2];
  }
  // one turn for the clip ('auto' / a number), or 'follow': each frame turned by its own slow heading, so a curved or
  // figure-8 run becomes a run facing the camera (the stride's own hip swing is kept, it is faster than the window)
  let yawAt: number[];
  if (opt.yawDeg === 'follow') {
    const raw = fr.map((j) => { const { fwd } = bodyAxes(j); return Math.atan2(fwd[0] * sign, fwd[2] * sign); });
    for (let i = 1; i < raw.length; i++) { while (raw[i] - raw[i - 1] > Math.PI) raw[i] -= 2 * Math.PI; while (raw[i] - raw[i - 1] < -Math.PI) raw[i] += 2 * Math.PI; }
    const h = Math.floor(W / 2);
    yawAt = raw.map((_, i) => { const a0 = Math.max(0, i - h), b0 = Math.min(raw.length, i + h + 1); let t = 0; for (let k = a0; k < b0; k++) t += raw[k]; return t / (b0 - a0); });
  } else {
    const one = opt.yawDeg === undefined || opt.yawDeg === 'auto' ? Math.atan2(sx * sign, sz * sign) : (opt.yawDeg * Math.PI) / 180;
    yawAt = fr.map(() => one);
  }
  const yaw = yawAt[off];
  const turn = (p: V3, about: V3, a: number): V3 => {
    const c = Math.cos(-a), s = Math.sin(-a), x = p[0] - about[0], z = p[2] - about[2];
    return [x * c + z * s, p[1], -x * s + z * c];
  };
  // travel: 'remove' turns each frame about its slow hip path (so what is left of the travel is in the body's own
  // axes) and soft-clamps the rest to the room; 'clamp' only soft-clamps; 'keep' leaves the path
  const hip = fr.map((j) => mid(j.LeftUpLeg, j.RightUpLeg));
  const travelM = Math.hypot(hip[off + n - 1][0] - hip[off][0], hip[off + n - 1][2] - hip[off][2]);
  const mode = opt.travel ?? 'remove', cm = opt.clampM ?? 0.5;
  const kept = mode === 'scale' ? (opt.travelScale ?? 0.3) : 0;
  const slow = mode === 'remove' || mode === 'scale' ? movingAverageXZ(hip, W).map((q) => mul(q, 1 - kept)) : hip.map(() => [0, 0, 0] as V3);
  fr = fr.map((j, i) => mapJoints(j, (p) => turn(p, slow[i], yawAt[i])));
  if (mode !== 'keep') {
    fr = fr.map((j) => {
      const hp = mid(j.LeftUpLeg, j.RightUpLeg), r = Math.hypot(hp[0], hp[2]);
      const k = r > 1e-9 ? (cm * Math.tanh(r / cm)) / r : 1;
      return mapJoints(j, (p) => [p[0] + hp[0] * (k - 1), p[1], p[2] + hp[2] * (k - 1)]);
    });
  }
  fr = fr.slice(off, off + n);
  // rough floor for the stride weights (the real one is read after the foot model)
  const toeExtend = opt.toeExtend ?? DEFAULT_FOOT.toeExtend;
  const k = opt.strideScale ?? 1;
  if (k < 1) {
    const roughFloor = pct(fr.map((j) => Math.min(j.LeftToe[1], j.RightToe[1], j.LeftFoot[1], j.RightFoot[1])), 0.1);
    fr = fr.map((j) => pullFeetIn(j, k, roughFloor));
  }
  // the foot model, then the floor line at y = 0. Video-solved mocap lets the whole body sink or float over a take;
  // a rolling low of the feet (a jump is under half of any 2 s window) takes that drift out of every joint.
  const foot = calibrateFoot(fr, toeExtend);
  const lows = fr.map((j) => Math.min(...lowestFootY(j, foot)));
  const FW = Math.round((opt.floorWindowSec ?? 2) * fps), hw = Math.floor(FW / 2);
  let floorAt: number[];
  if (FW > 0 && n > FW) {
    const raw = lows.map((_, i) => pct(lows.slice(Math.max(0, i - hw), Math.min(n, i + hw + 1)), 0.1));
    const sw = Math.max(1, Math.floor(hw / 2));
    floorAt = raw.map((_, i) => { const a = Math.max(0, i - sw), b = Math.min(n, i + sw + 1); let t = 0; for (let k = a; k < b; k++) t += raw[k]; return t / (b - a); });
  } else {
    const one = pct(lows, 0.1);
    floorAt = lows.map(() => one);
  }
  fr = fr.map((j, i) => mapJoints(j, (p) => [p[0], p[1] - floorAt[i], p[2]]));
  const floorDriftM = Math.max(...floorAt) - Math.min(...floorAt);
  // last, a narrow rig's arms out to a person's shoulder span: after the facing, travel and stride work, which read the
  // shoulder line too and must see the rig as it was captured
  let shoulderOutM = 0;
  if (opt.shoulderSpanM) {
    const span = median(fr.map((j) => len(sub(j.LeftArm, j.RightArm))));
    shoulderOutM = Math.max(0, (opt.shoulderSpanM - span) / 2);
    if (shoulderOutM > 0) fr = fr.map((j) => widenShoulders(j, shoulderOutM));
  }
  return { clip: { fps, frames: fr, foot }, info: { yawDeg: (yaw * 180) / Math.PI, travelM, floorDriftM, leftHanded, foot, shoulderOutM } };
}

/** Each arm moved `out` metres along the shoulder line, away from the body: a longer collarbone, the arm's shape kept. */
function widenShoulders(j: Joints, out: number): Joints {
  const d = mul(norm(sub(j.LeftArm, j.RightArm), [1, 0, 0]), out);
  return {
    ...j,
    LeftArm: add(j.LeftArm, d), LeftForeArm: add(j.LeftForeArm, d), LeftHand: add(j.LeftHand, d),
    RightArm: sub(j.RightArm, d), RightForeArm: sub(j.RightForeArm, d), RightHand: sub(j.RightHand, d),
  };
}

/** Centred moving average of x/z, the ends padded by extending the path at its end velocity. */
function movingAverageXZ(p: V3[], W: number): V3[] {
  const n = p.length, h = Math.floor(W / 2), m = Math.max(1, Math.min(h, Math.floor(n / 4)));
  const v0 = mul(sub(p[m], p[0]), 1 / m), v1 = mul(sub(p[n - 1], p[n - 1 - m]), 1 / m);
  const at = (i: number): V3 => (i < 0 ? add(p[0], mul(v0, i)) : i >= n ? add(p[n - 1], mul(v1, i - n + 1)) : p[i]);
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    for (let d = -h; d <= h; d++) { const q = at(i + d); x += q[0]; z += q[2]; }
    out.push([x / (2 * h + 1), 0, z / (2 * h + 1)]);
  }
  return out;
}

/** Running in place: each LOW foot's fore-aft offset from its hip scaled by k; the knee re-solved so bones keep length. */
function pullFeetIn(j: Joints, k: number, floor: number): Joints {
  const { fwd } = bodyAxes(j);
  const out = { ...j };
  for (const s of ['Left', 'Right'] as const) {
    const H = j[`${s}UpLeg`], K = j[`${s}Leg`], A = j[`${s}Foot`], T = j[`${s}Toe`];
    const low = Math.min(A[1], T[1]) - floor;
    const w = clamp01((0.35 - low) / (0.35 - 0.12));   // a foot high in the air (knee drive, a tuck) keeps its shape
    const kk = 1 - (1 - k) * w;
    if (kk >= 0.999) continue;
    const df = dot(sub(A, H), fwd);
    let A2 = add(A, mul(fwd, df * (kk - 1)));
    const l1 = len(sub(K, H)), l2 = len(sub(A, K));
    const u = norm(sub(A2, H), [0, -1, 0]);
    const D = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, len(sub(A2, H))));
    A2 = add(H, mul(u, D));
    const pole = norm(orth(sub(K, H), u), fwd);
    const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
    const K2 = add(H, add(mul(u, along), mul(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)))));
    out[`${s}Leg`] = K2; out[`${s}Foot`] = A2; out[`${s}Toe`] = add(T, sub(A2, A));
  }
  return out;
}

/** Measure the foot model on the planted frames: the ankle at ~8.5 cm, the heel flat with the toe tip. */
function calibrateFoot(fr: Joints[], toeExtend: number): FootModel {
  const ANKLE_M = 0.085, HEEL_BACK = 0.05;
  const drops: number[] = [], tilts: number[] = [], heights: number[] = [];
  for (const s of ['Left', 'Right'] as const) {
    const ys = fr.map((j) => j[`${s}Foot`][1]);
    const lo = pct(ys, 0.05);
    for (let i = 0; i < fr.length; i++) {
      if (ys[i] > lo + 0.015) continue;
      const j = fr[i], F = j[`${s}Foot`], T = j[`${s}Toe`];
      const f = norm(sub(T, F));
      const tip = add(T, mul(norm([f[0], f[1] * 0.5, f[2]]), toeExtend));
      tilts.push(Math.asin(Math.max(-1, Math.min(1, -f[1]))));
      heights.push(F[1] - tip[1]);
      drops.push(F[1] - tip[1] - ANKLE_M);
    }
  }
  if (!tilts.length) return { ...DEFAULT_FOOT, toeExtend };
  // the Foot joint rides this far above a real ankle; move the ankle point down the shin by it (never up)
  const ankleDrop = Math.max(0, median(drops));
  const alpha = median(tilts), ha = median(heights) - ankleDrop;
  // heel, planted: HEEL_BACK behind the ankle point, level with the tip; expressed in the foot's (along, up) frame
  const d: [number, number] = [-HEEL_BACK, -Math.max(0.03, ha)];      // (forward, up)
  const f: [number, number] = [Math.cos(alpha), -Math.sin(alpha)], u: [number, number] = [Math.sin(alpha), Math.cos(alpha)];
  return { ankleDrop, heelF: d[0] * f[0] + d[1] * f[1], heelU: d[0] * u[0] + d[1] * u[1], toeExtend };
}

// ── the virtual webcam ───────────────────────────────────────────────────────────────────────────────────────────

export interface CameraSpec {
  width: number; height: number; hfovDeg: number;
  /** Metres in front of the player (on +Z). */
  distance: number;
  /** Lens height above the floor (m). */
  heightM: number;
  /** Height it aims at on the player's plane (default: level, its own height). */
  lookAtY?: number;
}
/** What poseSource asks getUserMedia for, a phone at hip height across a living room. NOT mirrored. */
export const DEFAULT_CAMERA: CameraSpec = { width: 640, height: 480, hfovDeg: 60, distance: 3.0, heightM: 1.1 };

export interface Camera { spec: CameraSpec; pos: V3; r: V3; u: V3; f: V3; fx: number; fy: number }
export function makeCamera(spec: Partial<CameraSpec> = {}): Camera {
  const s = { ...DEFAULT_CAMERA, ...spec };
  const pos: V3 = [0, s.heightM, s.distance];
  const f = norm(sub([0, s.lookAtY ?? s.heightM, 0], pos));
  const r = norm(cross(f, UP)), u = cross(r, f);
  const fx = s.width / 2 / Math.tan((s.hfovDeg * Math.PI) / 360);
  return { spec: s, pos, r, u, f, fx, fy: fx };
}
/** A world point → normalised image x, y (y down) and its depth along the lens axis. */
export function project(cam: Camera, p: V3): { x: number; y: number; depth: number } {
  const d = sub(p, cam.pos), depth = dot(d, cam.f);
  return {
    x: 0.5 + (cam.fx / cam.spec.width) * (dot(d, cam.r) / depth),
    y: 0.5 - (cam.fy / cam.spec.height) * (dot(d, cam.u) / depth),
    depth,
  };
}

// ── seeded randomness ────────────────────────────────────────────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    const u = Math.max(1e-12, rand()), v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// ── the stream ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface NoiseSpec {
  /** Image jitter σ in image-width units: torso + face, and limbs (MediaPipe lite at 640×480, est.). */
  imageTorso: number; imageLimb: number;
  /** World jitter σ in metres. */
  worldTorso: number; worldLimb: number;
  /** Depth (z) is this many times noisier than x/y. */
  depthScale: number;
}
export const DEFAULT_NOISE: NoiseSpec = { imageTorso: 0.002, imageLimb: 0.004, worldTorso: 0.008, worldLimb: 0.015, depthScale: 2 };

export interface SynthOptions {
  camera?: Partial<CameraSpec>;
  /** Camera frame rate. */
  fps?: number;
  /** Shutter timing jitter σ (ms). */
  frameJitterMs?: number;
  /** Capture time of the first frame (ms). */
  t0?: number;
  seed?: number;
  /** false = exact landmarks, visibility still modelled. */
  noise?: Partial<NoiseSpec> | false;
  /** Share of frames the camera never delivers (they are absent from the stream). */
  dropRate?: number;
  /** Share of delivered frames where the model finds no body (present: false). */
  missRate?: number;
  /** Capture → app latency (ms): camera + inference, stamped on `arrive`. */
  latencyMs?: number;
  latencyJitterMs?: number;
  gt?: GtOptions;
  /**
   * MOVEMENT PLAY P7 (2026-09-25): MOTION BLUR — a hand or foot point moving faster than `px` pixels per 1/30 s (its true
   * image position between delivered frames, so the same speed blurs at any camera rate) comes back UNSURE (visibility
   * under 0.5) and `mult`× noisier, the way the model loses a wrist at a punch's peak speed. At the default camera 6 px
   * is ~3 cm, ~1 m/s. Off by default: every earlier fixture and gate is unchanged (it draws no extra random numbers).
   */
  blur?: { px: number; mult: number } | false;
}
export interface ResolvedSynth {
  camera: CameraSpec; fps: number; frameJitterMs: number; t0: number; seed: number; noise: NoiseSpec | false;
  dropRate: number; missRate: number; latencyMs: number; latencyJitterMs: number; gt: Required<GtOptions>;
  blur?: { px: number; mult: number } | false;
}
/** The blur model's default (PLAN-P7 §6.3, est.): > 6 px per 1/30 s, 3× the noise. */
export const DEFAULT_BLUR = { px: 6, mult: 3 } as const;
/** The points the blur model reads: the wrists and hands (15–22), the ankles, heels and toes (27–32). */
const BLUR_POINTS = new Set([15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32]);

const TORSO_FACE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24]);
const TORSO_QUAD = [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_HIP, LEFT_HIP];
const FACE = [0, 1, 2, 3, 4, 5, 6, 9, 10];

/** Sample a clip at time ts (s) by linear interpolation. */
export function sampleClip(clip: JointClip, ts: number): Joints {
  const x = Math.max(0, Math.min(clip.frames.length - 1, ts * clip.fps));
  const i = Math.min(clip.frames.length - 2, Math.floor(x)), u = x - i;
  if (clip.frames.length < 2) return clip.frames[0];
  const a = clip.frames[i], b = clip.frames[i + 1];
  return mapJoints(a, (p, n) => lerp3(p, b[n], u));
}

/** One frame's exact (noise-free) image + world landmarks and each point's depth. */
export function renderFrame(cam: Camera, j: Joints, foot: FootModel = DEFAULT_FOOT): { image: Lm[]; world: Wm[]; depth: number[]; faceAway: boolean } {
  const pts = bodyPoints(j, foot);
  const hip = mid(pts[LEFT_HIP], pts[RIGHT_HIP]);
  const ph = project(cam, hip);
  const W = cam.spec.width;
  const image: Lm[] = [], world: Wm[] = [], depth: number[] = [];
  for (const p of pts) {
    const q = project(cam, p);
    image.push({ x: q.x, y: q.y, z: (cam.fx * (q.depth - ph.depth)) / (ph.depth * W), v: 1 });
    const d = sub(p, hip);
    world.push({ x: dot(d, cam.r), y: -dot(d, cam.u), z: dot(d, cam.f) });
    depth.push(q.depth);
  }
  // the face turned from the lens (a spin, a back to the camera): the model only guesses at it
  const faceAway = dot(norm(flat(sub(pts[NOSE], j.Head))), norm(flat(sub(cam.pos, j.Head)))) < -0.2;
  return { image, world, depth, faceAway };
}

const inFrame = (l: Lm) => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;
function insidePoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i], b = poly[k];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Throws when the left shoulder lands on the image's LEFT while the body faces the camera: a mirrored source. "Facing"
 * is read from the toes and the bent knees, which do not depend on the left/right labels (both must agree when the
 * knees are bent), and it is a majority over every such frame, so a glitched mocap foot (DeepMotion turns a foot
 * backwards for a few frames) cannot fail a whole take.
 */
export function assertHandedness(cam: Camera, clip: JointClip): void {
  let pass = 0, fail = 0, first = -1;
  for (let i = 0; i < clip.frames.length; i++) {
    const j = clip.frames[i];
    const toCam = norm(flat(sub(cam.pos, mid(j.LeftUpLeg, j.RightUpLeg))));
    if (dot(toeFacing(j), toCam) < Math.SQRT1_2) continue;
    const knee = kneeFacing(j);
    if (knee && dot(knee, toCam) < 0.5) continue;
    const { image } = renderFrame(cam, j, clip.foot);
    if (image[LEFT_SHOULDER].x > image[RIGHT_SHOULDER].x) pass++; else { fail++; if (first < 0) first = i; }
  }
  if (fail > pass) {
    throw new Error(`[synth] handedness: ${fail} of ${pass + fail} frames facing the camera have x[11] ≤ x[12] (first: frame ${first}) — a mirrored source (toRoom's mirror option)`);
  }
}

export interface Synthesized { frames: PoseFrame[]; gt: GroundTruth; settings: ResolvedSynth }

/** The hand and foot points that moved more than `px` pixels (image width `W`) since the last delivered frame. */
function blurredPoints(now: Lm[], prev: Lm[], px: number, W: number): Set<number> {
  const out = new Set<number>();
  for (const i of BLUR_POINTS) if (Math.hypot(now[i].x - prev[i].x, now[i].y - prev[i].y) * W > px) out.add(i);
  return out;
}

/** A clip → what a phone would deliver, plus the ground truth aligned to it. */
export function synthesize(clip: JointClip, opt: SynthOptions = {}): Synthesized {
  const settings: ResolvedSynth = {
    camera: { ...DEFAULT_CAMERA, ...opt.camera },
    fps: opt.fps ?? 30, frameJitterMs: opt.frameJitterMs ?? 1, t0: opt.t0 ?? 0, seed: opt.seed ?? 1,
    noise: opt.noise === false ? false : { ...DEFAULT_NOISE, ...opt.noise },
    dropRate: opt.dropRate ?? 0.02, missRate: opt.missRate ?? 0.01,
    latencyMs: opt.latencyMs ?? 66, latencyJitterMs: opt.latencyJitterMs ?? 8,
    gt: { ...DEFAULT_GT, ...opt.gt },
    ...(opt.blur ? { blur: opt.blur } : {}),
  };
  const cam = makeCamera(settings.camera);
  assertHandedness(cam, clip);
  const foot = clip.foot ?? DEFAULT_FOOT;
  const rand = mulberry32(settings.seed), gauss = gaussian(rand);
  const dur = (clip.frames.length - 1) / clip.fps;
  const aspect = settings.camera.width / settings.camera.height;
  const frames: PoseFrame[] = [];
  const times: number[] = [];   // source seconds of each delivered frame
  let lastArrive = -Infinity;
  let prevTrue: Lm[] | null = null, prevTs = 0;   // the last delivered frame's true image points and time (the blur model)
  for (let k = 0; ; k++) {
    const ideal = k / settings.fps;
    if (ideal > dur) break;
    const ts = Math.max(0, Math.min(dur, ideal + (gauss() * settings.frameJitterMs) / 1000));
    const dropped = rand() < settings.dropRate;
    const missed = rand() < settings.missRate;
    const lat = Math.max(1, settings.latencyMs + gauss() * settings.latencyJitterMs);
    if (dropped) continue;
    const t = settings.t0 + ts * 1000;
    const arrive = Math.max(lastArrive, t + lat);
    lastArrive = arrive;
    times.push(ts);
    const j = sampleClip(clip, ts);
    const { image, world, depth, faceAway } = renderFrame(cam, j, foot);
    const blurred = settings.blur && prevTrue ? blurredPoints(image, prevTrue, (settings.blur.px * Math.max(1e-3, ts - prevTs) * 30), settings.camera.width) : null;
    if (settings.blur) { prevTrue = image.map((l) => ({ ...l })); prevTs = ts; }
    // a body the model can find: 5 of the 9 core points in frame
    const inCount = CORE_POINTS.filter((i) => inFrame(image[i])).length;
    if (missed || inCount < 5) { frames.push({ t, present: false, image: [], arrive }); continue; }
    // visibility: off-screen, hidden behind the torso, or the face turned away
    const quad = TORSO_QUAD.map((i) => image[i]);
    const cx = quad.reduce((s, q) => s + q.x, 0) / 4, cy = quad.reduce((s, q) => s + q.y, 0) / 4;
    const grown = quad.map((q) => ({ x: cx + (q.x - cx) * 1.1, y: cy + (q.y - cy) * 1.1 }));
    const torsoDepth = TORSO_QUAD.reduce((s, i) => s + depth[i], 0) / 4;
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const l = image[i];
      // (with noise off the levels are fixed, so a still body gives identical frames)
      const spread = settings.noise ? rand() : 0.5;
      let v: number;
      if (!inFrame(l)) v = 0.05 + spread * 0.05;
      else if ((!TORSO_FACE.has(i) && depth[i] > torsoDepth + 0.08 && insidePoly(l.x, l.y, grown)) || (faceAway && FACE.includes(i))) v = 0.3 + spread * 0.15;
      else v = 0.9 + spread * 0.09;
      // motion blur: a fast hand or foot comes back unsure and noisier (P7)
      const blurMult = blurred?.has(i) && settings.blur ? settings.blur.mult : 1;
      if (blurMult > 1 && v >= 0.5) v = 0.3 + spread * 0.15;
      l.v = v;
      if (settings.noise) {
        const n = settings.noise, weak = blurMult > 1 ? blurMult : v < 0.5 ? 3 : 1;
        const si = (TORSO_FACE.has(i) ? n.imageTorso : n.imageLimb) * weak;
        const sw = (TORSO_FACE.has(i) ? n.worldTorso : n.worldLimb) * weak;
        l.x += gauss() * si; l.y += gauss() * si * aspect; l.z += gauss() * si * n.depthScale;
        const w = world[i];
        w.x += gauss() * sw; w.y += gauss() * sw; w.z += gauss() * sw * n.depthScale;
      }
    }
    frames.push({ t, present: true, image, world, arrive });
  }
  const gt = groundTruth(clip, times, settings);
  return { frames, gt, settings };
}

// ── ground truth ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface GtOptions {
  /** A foot is down when its lowest point is this close to the floor line (m). */
  contactM?: number;
  /** A flight this long or longer can be a jump (a running stride's flight is ~0.1–0.2 s). */
  minJumpMs?: number;
  /** Contact flickers shorter than this are merged away (mocap foot jitter). */
  debounceMs?: number;
  /** Both feet leaving within this = a two-foot take-off. */
  twoFootMs?: number;
  /** "Above the head" = the wrist this far above the Head joint (m) — roughly the crown. */
  headTopM?: number;
  /** Minimum peak speeds (m/s) for a strike (down), a release (up), a reach (up), a punch (out from the shoulder). */
  strikeMin?: number; releaseMin?: number; reachMin?: number; punchMin?: number;
  /** A flight counts as a jump only if the hips rose at least this much (m) and this share of g·t²/8 (less 5 cm). */
  minRiseM?: number;
  minRiseShare?: number;
  /** A kick: the ankle up past kickLiftM (m), topping out at kickTopM or higher, swung at kickMin (m/s) relative to the hips. */
  kickLiftM?: number;
  kickTopM?: number;
  kickMin?: number;
}
export const DEFAULT_GT: Required<GtOptions> = {
  contactM: 0.035, minJumpMs: 250, debounceMs: 50, twoFootMs: 100, headTopM: 0.15, strikeMin: 1.5, releaseMin: 0.8, reachMin: 1.5, punchMin: 2.5,
  minRiseM: 0.04, minRiseShare: 0.5, kickLiftM: 0.3, kickTopM: 0.5, kickMin: 2.0,
};

/** An instant on the stream's clock: capture ms, and the index of the stream frame that shows it. */
export interface GtAt { t: number; frame: number }
export type Foot = 'left' | 'right';
export interface GtJump {
  takeoff: GtAt;      // the last foot leaves: `frame` is the first frame with both feet off
  landing: GtAt;      // the first foot down: `frame` is the first frame with a foot down again
  apex: GtAt;         // hip height at its max in the flight: `frame` is the nearest frame
  feet: 1 | 2;
  takeoffFoot: Foot | 'both';
  landingFoot: Foot | 'both';
  flightMs: number;
  /** g·t²/8 from the flight time (m). */
  heightFlightM: number;
  /** Hip rise from the take-off instant to the apex (m) — the jump height in centre-of-mass terms. */
  hipRiseM: number;
}
export interface GtStep { foot: Foot; down: GtAt | null; up: GtAt | null }
/**
 * Wrist events, one per swing, read from the arm's own motion (the wrist relative to its shoulder, m/s). "Overhead" is
 * the wrist above the Head joint + headTopM (about the crown). Each is at the swing's own fastest instant:
 *   strike   a DOWNWARD swing that has the wrist overhead (the slam; its peak may fall below the head)
 *   reach    an UPWARD drive that takes the wrist from below the head to overhead (a jump's arm swing, a dunk's reach,
 *            the lift to a shot's set point; its peak is mostly below the head)
 *   release  an UPWARD push made while already overhead (a shot's release from the set point)
 *   punch    the extension out from the shoulder that ends near full reach, between the hips and the crown
 * speedWorld is the wrist's own speed at that instant.
 */
export interface GtWrist { kind: 'strike' | 'reach' | 'release' | 'punch'; hand: Foot; at: GtAt; speed: number; speedWorld: number; heightM: number }
/** A kick: the ankle's peak speed relative to the hips (m/s) in a lift where the leg nears straight; heightM = the foot's top. */
export interface GtKick { side: Foot; at: GtAt; speed: number; heightM: number }
export interface GroundTruth {
  contactM: number;
  /** Per stream frame (aligned with frames[]): each foot's height (m), contact, and the hip midpoint's height (m). */
  perFrame: { footH: [number, number][]; contact: [0 | 1, 0 | 1][]; hipH: number[] };
  jumps: GtJump[];
  /**
   * Every other time both feet were off the floor: running strides, skips, and flights where the hips did not rise
   * (a source floating its feet). NOT jumps — a detector that reports one of these as a jump is wrong.
   */
  flights: GtJump[];
  steps: GtStep[];
  wrist: GtWrist[];
  kicks: GtKick[];
}

const G = 9.81;

/** Ground truth from the clip's own joints, mapped onto the delivered frames (source seconds in `times`). */
export function groundTruth(clip: JointClip, times: number[], settings: Pick<ResolvedSynth, 't0' | 'gt'>): GroundTruth {
  const o = settings.gt, fps = clip.fps, n = clip.frames.length;
  const foot = clip.foot ?? DEFAULT_FOOT;
  const toMs = (ts: number) => settings.t0 + ts * 1000;
  // stream mapping: 'next' = first delivered frame at/after, 'near' = the closest one
  const atNext = (ts: number): GtAt => {
    let f = times.findIndex((x) => x >= ts - 1e-9);
    if (f < 0) f = times.length - 1;
    return { t: toMs(ts), frame: f };
  };
  const atNear = (ts: number): GtAt => {
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - ts) < Math.abs(times[best] - ts)) best = i;
    return { t: toMs(ts), frame: best };
  };
  // foot heights above the floor line (same rule toRoom uses to put it at 0)
  const lows = clip.frames.map((j) => lowestFootY(j, foot));
  const floor = pct(lows.map(([l, r]) => Math.min(l, r)), 0.1);
  const h: [number[], number[]] = [lows.map((x) => x[0] - floor), lows.map((x) => x[1] - floor)];
  const hip = clip.frames.map((j) => mid(j.LeftUpLeg, j.RightUpLeg)[1] - floor);
  const sampleArr = (arr: number[], ts: number) => { const x = Math.max(0, Math.min(n - 1, ts * fps)), a = Math.min(n - 2, Math.floor(x)); return n < 2 ? arr[0] : arr[a] + (arr[a + 1] - arr[a]) * (x - a); };
  const deb = Math.max(1, Math.round((o.debounceMs / 1000) * fps));
  const contact = h.map((hs) => debounce(hs.map((x) => x < o.contactM), deb));
  // Each foot's contact runs. contactM finds them (robust to mocap jitter); the instants are then taken where the
  // foot leaves / reaches its own stance level + 1 cm, so a 3.5 cm threshold does not shave ~30 ms off every flight.
  const REFINE_M = 0.01;
  interface Run { foot: 0 | 1; a: number; b: number; down: number; up: number }   // frames [a, b); times in s
  const runs: Run[] = [];
  for (const s of [0, 1] as const) {
    const hs = h[s];
    for (let a = 0; a < n; a++) {
      if (!contact[s][a]) continue;
      let b = a; while (b < n && contact[s][b]) b++;
      const thr = Math.min(o.contactM, median(hs.slice(a, b)) + REFINE_M);
      // touchdown: the first run frame at/below thr, interpolated from the frame before it
      let down = -Infinity;
      if (a > 0) {
        let k = a; while (k < b - 1 && hs[k] > thr) k++;
        const y0 = hs[k - 1], y1 = hs[k];
        down = y1 <= thr && y0 > y1 ? (k - 1 + Math.min(1, (y0 - thr) / (y0 - y1))) / fps : (a - 0.5) / fps;
      }
      // lift-off: the last run frame at/below thr, interpolated to the frame after it
      let up = Infinity;
      if (b < n) {
        let k = b - 1; while (k > a && hs[k] > thr) k--;
        const y0 = hs[k], y1 = hs[k + 1];
        up = y0 <= thr && y1 > y0 ? (k + Math.min(1, (thr - y0) / (y1 - y0))) / fps : (b - 0.5) / fps;
      }
      runs.push({ foot: s, a, b, down, up });
      a = b;
    }
  }
  runs.sort((x, y) => (x.down === y.down ? 0 : x.down < y.down ? -1 : 1) || x.foot - y.foot);
  const steps: GtStep[] = runs.map((r) => ({
    foot: r.foot === 0 ? 'left' : 'right',
    down: Number.isFinite(r.down) ? atNext(r.down) : null,
    up: Number.isFinite(r.up) ? atNext(r.up) : null,
  }));
  const downAt = (ts: number, s: 0 | 1) => runs.some((r) => r.foot === s && ts >= r.down && ts < r.up);
  // flights: both feet up; a jump when long enough
  const jumps: GtJump[] = [], flights: GtJump[] = [];
  const air = Array.from({ length: n }, (_, i) => !contact[0][i] && !contact[1][i]);
  for (let i = 1; i < n; i++) {
    if (!air[i] || air[i - 1]) continue;
    let e = i; while (e < n && air[e]) e++;
    if (e >= n) break;                                         // still in the air at the end: no landing to grade
    // take-off: the runs that ended as the flight began; landing: the runs that start as it ends
    const leaving = runs.filter((r) => r.b === i);
    const landing = runs.filter((r) => r.a === e);
    const tOff = Math.max(...leaving.map((r) => r.up));
    const tLand = Math.min(...landing.map((r) => r.down));
    const flightMs = (tLand - tOff) * 1000;
    const short = flightMs < o.minJumpMs;
    // one foot or two: when did the OTHER foot last leave the floor?
    let feet: 1 | 2 = 2, takeoffFoot: Foot | 'both' = 'both';
    if (leaving.length === 1) {
      const last = leaving[0].foot;
      const prior = runs.filter((r) => r.foot !== last && r.b <= i).pop();
      if ((tOff - (prior ? prior.up : -Infinity)) * 1000 > o.twoFootMs) { feet = 1; takeoffFoot = last === 0 ? 'left' : 'right'; }
    }
    let landingFoot: Foot | 'both' = landing.length === 2 ? 'both' : landing[0].foot === 0 ? 'left' : 'right';
    if (landing.length === 1) {
      const next = runs.find((r) => r.foot !== landing[0].foot && r.a > e);
      if (next && (next.down - tLand) * 1000 <= o.twoFootMs) landingFoot = 'both';
    }
    // apex: the hip's highest sample in the flight, refined on a parabola through its neighbours
    let top = i;
    for (let k = i; k < e; k++) if (hip[k] > hip[top]) top = k;
    let tApex = top / fps, hApex = hip[top];
    if (top > 0 && top < n - 1) {
      const y0 = hip[top - 1], y1 = hip[top], y2 = hip[top + 1], den = y0 - 2 * y1 + y2;
      if (den < 0) { const d = (0.5 * (y0 - y2)) / den; if (Math.abs(d) <= 1) { tApex = (top + d) / fps; hApex = y1 - 0.25 * (y0 - y2) * d; } }
    }
    const T = tLand - tOff;
    const jump: GtJump = {
      takeoff: atNext(tOff), landing: atNext(tLand), apex: atNear(tApex),
      feet, takeoffFoot, landingFoot, flightMs,
      heightFlightM: (G * T * T) / 8, hipRiseM: hApex - sampleArr(hip, tOff),
    };
    // A jump rises: the hips go up ~g·t²/8 in a real flight. A long stride, a skip, or the source floating its feet
    // (video-solved running does this) leaves the hips level — kept apart so no detector is graded on it as a jump.
    if (!short && jump.hipRiseM >= Math.max(o.minRiseM, o.minRiseShare * jump.heightFlightM - 0.05)) jumps.push(jump); else flights.push(jump);
    i = e;
  }
  // wrists
  const wrist: GtWrist[] = [];
  const kd = Math.max(1, Math.round(fps / 30));
  for (const s of ['Left', 'Right'] as const) {
    const hand: Foot = s === 'Left' ? 'left' : 'right';
    const W = clip.frames.map((j) => j[`${s}Hand`]), S = clip.frames.map((j) => j[`${s}Arm`]);
    // the ARM's own swing: the wrist relative to its shoulder, so a falling body does not read as a slam
    const vel = (P: V3[], i: number): V3 => { const a = Math.max(0, i - kd), b = Math.min(n - 1, i + kd); return mul(sub(P[b], P[a]), fps / Math.max(1, b - a)); };
    const V = W.map((_, i) => sub(vel(W, i), vel(S, i)));
    const Vw = W.map((_, i) => vel(W, i));
    const armLen = median(clip.frames.map((j) => len(sub(j[`${s}ForeArm`], j[`${s}Arm`])) + len(sub(j[`${s}Hand`], j[`${s}ForeArm`]))));
    const reach = W.map((w, i) => len(sub(w, S[i])));
    const radial = reach.map((_, i) => { const a = Math.max(0, i - kd), b = Math.min(n - 1, i + kd); return ((reach[b] - reach[a]) * fps) / Math.max(1, b - a); });
    const push = (kind: GtWrist['kind'], best: number, speed: number) =>
      wrist.push({ kind, hand, at: atNear(best / fps), speed, speedWorld: len(Vw[best]), heightM: W[best][1] - floor });
    const peaks = (on: (i: number) => boolean, val: (i: number) => number, min: number, kind: GtWrist['kind'], extra?: (i: number) => boolean) => {
      for (let i = 0; i < n; i++) {
        if (!on(i)) continue;
        let e = i; while (e < n && on(e)) e++;
        let best = i; for (let k = i; k < e; k++) if (val(k) > val(best)) best = k;
        if (val(best) >= min && (!extra || extra(best))) push(kind, best, val(best));
        i = e;
      }
    };
    const overhead = (i: number) => W[i][1] > clip.frames[i].Head[1] + o.headTopM;
    // strike: one per downward swing of the arm that has the wrist above the head (a hammer from overhead), at its
    // fastest. The whole swing is searched, not just its overhead part: a slam is still speeding up as the wrist passes
    // the head, so a window cut at head height put the "peak" on that crossing (30–120 ms early on the fixtures, at
    // 40–80 % of the speed), and one window held the flush and the landing swing together, so the flush went unreported.
    for (let i = 0; i < n; i++) {
      if (!(V[i][1] < 0)) continue;
      let e = i, best = i, high = false;
      while (e < n && V[e][1] < 0) { if (V[e][1] < V[best][1]) best = e; high ||= overhead(e); e++; }
      if (high && -V[best][1] >= o.strikeMin) push('strike', best, -V[best][1]);
      i = e;
    }
    // reach: one per upward drive of the arm that carries the wrist from below the head to above it (a jump's arm
    // swing, a dunk's reach, the lift to a shot's set point), at its fastest, which is mostly below the head.
    for (let i = 0; i < n; i++) {
      if (!(V[i][1] > 0)) continue;
      let e = i, best = i, high = false;
      while (e < n && V[e][1] > 0) { if (V[e][1] > V[best][1]) best = e; high ||= overhead(e); e++; }
      if (!overhead(i) && high && V[best][1] >= o.reachMin) push('reach', best, V[best][1]);
      i = e;
    }
    // release: a push made with the wrist already above the head (a shot's release from the set point): the fastest
    // local peak of the upward speed inside the overhead stretch. Its first frame is not a peak: an arm that is only
    // slowing from its reach up there has made no push. (Taking that frame put a "release" on every dunk's head-height
    // crossing, and a fast lift into the set point hid the shot's own push.)
    for (let i = 0; i < n; i++) {
      if (!overhead(i)) continue;
      let e = i; while (e < n && overhead(e)) e++;
      let best = -1;
      for (let k = i + 1; k < e && k + 1 < n; k++) {
        if (V[k][1] >= V[k - 1][1] && V[k][1] > V[k + 1][1] && (best < 0 || V[k][1] > V[best][1])) best = k;
      }
      if (best >= 0 && V[best][1] >= o.releaseMin) push('release', best, V[best][1]);
      i = e;
    }
    // punch: the fastest extension away from the shoulder that ends near full reach, at punching height
    peaks((i) => radial[i] > 1.0, (i) => radial[i], o.punchMin, 'punch', (i) => {
      const end = Math.min(n - 1, i + Math.round(0.15 * fps));
      let far = 0; for (let k = i; k <= end; k++) far = Math.max(far, reach[k]);
      const y = W[i][1], j = clip.frames[i];
      return far >= 0.85 * armLen && y < j.Head[1] + o.headTopM && y > mid(j.LeftUpLeg, j.RightUpLeg)[1];
    });
  }
  wrist.sort((a, b) => a.at.t - b.at.t);
  // kicks: the fastest swing of an ankle (relative to the hips) that ends with that leg near straight and the foot
  // up off the floor while the other foot is down — a heel flick (knee bent) or a tucked flight is not a kick
  const kicks: GtKick[] = [];
  for (const [s, other] of [['Left', 1], ['Right', 0]] as const) {
    const A = clip.frames.map((j) => j[`${s}Foot`]), H = clip.frames.map((j) => j[`${s}UpLeg`]);
    const legLen = median(clip.frames.map((j) => len(sub(j[`${s}Leg`], j[`${s}UpLeg`])) + len(sub(j[`${s}Foot`], j[`${s}Leg`]))));
    const rel = A.map((_, i) => { const a = Math.max(0, i - kd), b = Math.min(n - 1, i + kd); return len(sub(sub(A[b], A[a]), sub(H[b], H[a]))) * fps / Math.max(1, b - a); });
    const up = (i: number) => A[i][1] - floor > o.kickLiftM && contact[other][i];
    for (let i = 0; i < n; i++) {
      if (!up(i)) continue;
      let e = i; while (e < n && up(e)) e++;
      let best = i; for (let k = i; k < e; k++) if (rel[k] > rel[best]) best = k;
      let straight = 0, high = 0;
      for (let k = i; k < e; k++) { straight = Math.max(straight, len(sub(A[k], H[k])) / legLen); high = Math.max(high, A[k][1] - floor); }
      if (rel[best] >= o.kickMin && straight >= 0.85 && high >= o.kickTopM) kicks.push({ side: s === 'Left' ? 'left' : 'right', at: atNear(best / fps), speed: rel[best], heightM: high });
      i = e;
    }
  }
  kicks.sort((a, b) => a.at.t - b.at.t);
  // per stream frame
  const perFrame: GroundTruth['perFrame'] = { footH: [], contact: [], hipH: [] };
  for (const ts of times) {
    perFrame.footH.push([sampleArr(h[0], ts), sampleArr(h[1], ts)]);
    perFrame.contact.push([downAt(ts, 0) ? 1 : 0, downAt(ts, 1) ? 1 : 0]);
    perFrame.hipH.push(sampleArr(hip, ts));
  }
  return { contactM: o.contactM, perFrame, jumps, flights, steps, wrist, kicks };
}

/** Runs shorter than `min` frames take their neighbours' value (a foot does not touch down for one mocap frame). */
function debounce(v: boolean[], min: number): boolean[] {
  const out = [...v];
  let i = 0;
  while (i < out.length) {
    let e = i; while (e < out.length && out[e] === out[i]) e++;
    if (e - i < min && i > 0 && e < out.length) for (let k = i; k < e; k++) out[k] = !out[k];
    i = e;
  }
  return out;
}

// ── a test body ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A plain standing adult (~1.8 m), arms down, facing +Z (the camera), feet on y = 0, its Toe joint at the ball of
 * the foot (DEFAULT_FOOT). For unit tests and hand-scripted motion; real motion comes through toRoom().
 */
export function restPose(): Joints {
  const L = (x: number, y: number, z: number): V3 => [x, y, z];
  return {
    Hips: L(0, 0.98, 0), Chest: L(0, 1.30, 0), Neck: L(0, 1.52, 0), Head: L(0, 1.62, 0.01),
    LeftArm: L(0.19, 1.45, 0), LeftForeArm: L(0.21, 1.17, -0.02), LeftHand: L(0.22, 0.92, 0.0),
    RightArm: L(-0.19, 1.45, 0), RightForeArm: L(-0.21, 1.17, -0.02), RightHand: L(-0.22, 0.92, 0.0),
    LeftUpLeg: L(0.09, 0.95, 0), LeftLeg: L(0.095, 0.52, 0.01), LeftFoot: L(0.10, 0.08, -0.02), LeftToe: L(0.10, 0.02, 0.11),
    RightUpLeg: L(-0.09, 0.95, 0), RightLeg: L(-0.095, 0.52, 0.01), RightFoot: L(-0.10, 0.08, -0.02), RightToe: L(-0.10, 0.02, 0.11),
  };
}
/** Every joint moved by d. */
export const moveJoints = (j: Joints, d: V3): Joints => mapJoints(j, (p) => add(p, d));

// ── the fixture file ─────────────────────────────────────────────────────────────────────────────────────────────

/** lib/pose/__fixtures__/<name>.json, written by scripts/body/synth-streams.mts. */
export interface PoseFixture {
  name: string;
  description: string;
  /** The capture: file under ~/Downloads/fel-mocap-sources, its TRUE frame rate, and the source frame range [from, to). */
  source: { file: string; kind: string; license: string; fps: number; from: number; to: number };
  settings: { room: RoomOptions & { info: RoomInfo }; synth: ResolvedSynth };
  summary: {
    seconds: number; frames: number; present: number; jumps: number; steps: number;
    /** Gravity fitted to the hips in each jump's flight (m/s²): ~9.8 says the time base is right. */
    gFit: number[];
  };
  gt: GroundTruth;
  frames: PoseFrame[];
}
