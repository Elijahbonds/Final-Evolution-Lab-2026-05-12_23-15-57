// rideKit — the scripted bodies the ride reader is gated on (movement play P8, 2026-09-26): a board stance turned side-on,
// its toe / heel leans and its nose / tail weight shifts, a hand down to the board's edge, a quarter-turn of the shoulders,
// a kick-push, a steering wheel held in two wrists, arms out as wings, idle sway, running and walking in place, high
// knees, a wave and a stretch — and the camera's LEFT / RIGHT LABEL FLIP with the back to the lens.
//
// Like streamKit (P2), each body is synth.ts's rest body moved by hand, so its truth comes from synthesize() and a stream
// can be rebuilt under any camera, rate, noise or latency. Every one is SCRIPTED: no owner take and no capture of a grab
// exists (PLAN-P8 §1.5), so nothing here claims to be real motion; the real CMU windows live in __fixtures__/ride.
//
// The frame: synth's world (metres, y up, the camera on +Z looking back at the player, who faces +Z with the left on +X).
// A stance is the facing body turned about the vertical (streamKit.turnBody: + = the left shoulder AWAY from the camera),
// so a REGULAR rider (left foot forward, the left shoulder toward the screen) is turned by −θ and a GOOFY one by +θ.
//
// Pure: no DOM, no fs, deterministic for a seed.
import { MIRROR_INDEX, NOSE, type PoseFrame } from './landmarks';
import { restPose, bodyAxes, mulberry32, moveJoints, type Joints, type V3 } from './synth';
import { crouch, kneeUp, turnBody, scriptedJump, type Beat } from './streamKit';

export type Lead = 'L' | 'R';
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, 1]; };
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const mapJ = (j: Joints, fn: (p: V3, k: keyof Joints) => V3): Joints =>
  Object.fromEntries(Object.entries(j).map(([k, p]) => [k, fn(p as V3, k as keyof Joints)])) as Joints;
export const lerpJoints = (a: Joints, b: Joints, u: number): Joints => mapJ(a, (p, k) => [p[0] + (b[k][0] - p[0]) * u, p[1] + (b[k][1] - p[1]) * u, p[2] + (b[k][2] - p[2]) * u]);

/** Rodrigues: p turned `a` radians about the unit axis k through `pivot`. */
function rot(p: V3, pivot: V3, k: V3, a: number): V3 {
  const v = sub(p, pivot), c = Math.cos(a), s = Math.sin(a);
  return add(pivot, add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))));
}
/** A two-bone limb from root R toward the end target E (clamped to its reach), its middle joint bent toward `bend`. */
export function limb(R: V3, E: V3, l1: number, l2: number, bend: V3): { mid: V3; end: V3 } {
  const v = sub(E, R), D = Math.max(1e-3, Math.min(l1 + l2 - 1e-4, len(v))), u = norm(v);
  let p = sub(bend, mul(u, dot(bend, u)));
  p = len(p) > 1e-9 ? norm(p) : norm(cross(u, [0, 0, 1]));
  const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return { mid: add(R, add(mul(u, along), mul(p, h))), end: add(R, mul(u, D)) };
}

const R0 = restPose();
const UPPER_ARM = len(sub(R0.LeftForeArm, R0.LeftArm));   // 0.28
const FOREARM = len(sub(R0.LeftHand, R0.LeftForeArm));     // 0.25
const THIGH = len(sub(R0.LeftLeg, R0.LeftUpLeg));
const SHIN = len(sub(R0.LeftFoot, R0.LeftLeg));

// ── the board stance ─────────────────────────────────────────────────────────────────────────────────────────────

/** The stance before it is turned: soft knees (6 cm down) and the feet 0.24 m wider (stance.mts's body, PLAN-P8 §1.3). */
export function stanceBase(depth = 0.06, widen = 0.12): Joints {
  const j = crouch(R0, depth);
  const l = bodyAxes(j).left, o = { ...j };
  for (const s of ['Left', 'Right'] as const) {
    const sg = s === 'Left' ? 1 : -1;
    for (const n of [`${s}Foot`, `${s}Toe`, `${s}Leg`] as const) o[n] = add(j[n], mul(l, sg * widen * (n.endsWith('Leg') ? 0.5 : 1)));
  }
  return o;
}
/** turnBody's angle (deg) for a rider θ° off square with this lead: regular (left forward) −θ, goofy +θ. */
export const stanceYaw = (theta: number, lead: Lead): number => (lead === 'L' ? -1 : 1) * theta;
/** A facing body turned into the stance. */
export const inStance = (j: Joints, theta: number, lead: Lead): Joints => turnBody(j, stanceYaw(theta, lead));

/** The whole body tipped `deg` about an axis through the middle of its feet on the floor. */
function tip(j: Joints, axis: V3, deg: number): Joints {
  const piv: V3 = [(j.LeftFoot[0] + j.RightFoot[0]) / 2, 0, (j.LeftFoot[2] + j.RightFoot[2]) / 2];
  return mapJ(j, (p) => rot(p, piv, axis, (deg * Math.PI) / 180));
}
/**
 * A toe (+deg) or heel (−deg) lean: the body tipped about its own LEFT axis (the ankle line), so the hips go out over the
 * toes or the heels. Measured on the synth (stance.mts): +8° reads +0.11 m on the body normal at every θ 0–75°.
 */
export const edgeTilt = (j: Joints, deg: number): Joints => tip(j, bodyAxes(j).left, deg);
/**
 * A nose (+deg) / tail (−deg) weight shift: the body tipped about its forward axis — the hips over one foot — with BOTH
 * FEET PLANTED on the board (the knees re-solved to them): a real shift never lifts a foot. Not a lean.
 */
export function noseTailTilt(j: Joints, deg: number): Joints {
  const o = tip(j, bodyAxes(j).fwd, deg);
  for (const s of ['Left', 'Right'] as const) {
    const k = limb(o[`${s}UpLeg`], j[`${s}Foot`], THIGH, SHIN, sub(o[`${s}Leg`], o[`${s}UpLeg`]));
    o[`${s}Leg`] = k.mid; o[`${s}Foot`] = j[`${s}Foot`]; o[`${s}Toe`] = j[`${s}Toe`];
  }
  return o;
}

// ── a hand to the board's edge ───────────────────────────────────────────────────────────────────────────────────

/**
 * A GRAB, in the body's own frame (the body facing +Z before it is turned into the stance): the knees tucked up `tuck` m
 * toward the hips (as in the air), the trunk folded forward, and one hand reaching `depth` m below its own knee, in front
 * of the shins (the toe edge, +Z) or behind the heels (the heel edge). The other arm stays down. SCRIPTED: no capture of a
 * grab exists anywhere (PLAN-P8 §1.5).
 */
export function grabPose(j: Joints, hand: 'Left' | 'Right', edge: 'toe' | 'heel', depth = 0.08, tuck = 0.38, u = 1): Joints {
  const c = crouch(j, 0.26 * u, 0.04 * u, 48 * u);
  const o = { ...c };
  // the knees tucked: each foot pulled up toward its hip, the knee bent forward and up toward the chest
  for (const s of ['Left', 'Right'] as const) {
    const H = c[`${s}UpLeg`], A = add(c[`${s}Foot`], [0, tuck * u, 0.02 * u]);
    const k = limb(H, A, THIGH, SHIN, [0, 0.6, 1]);
    o[`${s}Leg`] = k.mid; o[`${s}Toe`] = add(c[`${s}Toe`], sub(k.end, c[`${s}Foot`])); o[`${s}Foot`] = k.end;
  }
  // the hand to the board's edge: `depth` under its own knee, in front of the shins (toe) or behind the heels (heel)
  const K = o[`${hand}Leg`], S = o[`${hand}Arm`], F = o[`${hand}Foot`];
  const target: V3 = [K[0], K[1] - depth, edge === 'toe' ? Math.max(K[2], F[2]) + 0.06 : Math.min(F[2], K[2]) - 0.1];
  const want = add(o[`${hand}Hand`], mul(sub(target, o[`${hand}Hand`]), u));
  const a = limb(S, want, UPPER_ARM, FOREARM, [0, 0, -1]);
  o[`${hand}ForeArm`] = a.mid; o[`${hand}Hand`] = a.end;
  // the free arm out and up for balance (a rider never lets it hang into the tuck)
  const free = hand === 'Left' ? 'Right' : 'Left', sg = free === 'Left' ? 1 : -1, FS = o[`${free}Arm`];
  const up: V3 = add(FS, [sg * 0.42, 0.12, -0.05]);
  const fa = limb(FS, add(o[`${free}Hand`], mul(sub(up, o[`${free}Hand`]), u)), UPPER_ARM, FOREARM, [0, -1, 0]);
  o[`${free}ForeArm`] = fa.mid; o[`${free}Hand`] = fa.end;
  return o;
}

/** The tuck with BOTH hands held at the knees (`above` m over them): a crouch in the air, never a grab. */
export function tuckPose(j: Joints, above = 0.04, u = 1): Joints {
  const o = grabPose(j, 'Left', 'toe', -above, 0.38, u);
  const K = o.RightLeg, S = o.RightArm;
  const want = add(o.RightHand, mul(sub([K[0], K[1] + above, K[2] + 0.06], o.RightHand), u));
  const a = limb(S, want, UPPER_ARM, FOREARM, [0, 0, -1]);
  o.RightForeArm = a.mid; o.RightHand = a.end;
  return o;
}

/**
 * A hop with a grab in its flight: the jump (streamKit.scriptedJump), and between take-off and landing the knees tucked
 * and one hand down at the board's edge — tucked in over the flight's first `inSec` and let go over its last `outSec`,
 * the hips kept on the jump's own path (the feet come up to them, not the hips down to the feet). `turn` maps a facing
 * body into the stance (inStance), so the grab is built in the body's own frame.
 */
export function grabHopBeat(base: Joints, v0: number, hand: 'Left' | 'Right', edge: 'toe' | 'heel', depth = 0.08, turn: (j: Joints) => Joints = (j) => j, inSec = 0.12, outSec = 0.1): Beat {
  return airPoseHopBeat(base, v0, (u) => grabPose(base, hand, edge, depth, 0.38, u), turn, inSec, outSec);
}
/** The same hop with the knees tucked and both hands AT the knees (not below): G4's negative. */
export const tuckHopBeat = (base: Joints, v0: number, turn: (j: Joints) => Joints = (j) => j): Beat =>
  airPoseHopBeat(base, v0, (u) => tuckPose(base, 0.04, u), turn, 0.12, 0.1);
/** A hop whose flight blends into `air(u)` (u 0 → 1 over `inSec`, back over `outSec`), the hips kept on the jump's path. */
function airPoseHopBeat(base: Joints, v0: number, air: (u: number) => Joints, turn: (j: Joints) => Joints, inSec: number, outSec: number): Beat {
  const J = scriptedJump(base, v0, 0.25);
  return [J.end, (t) => {
    if (t <= J.tOff || t >= J.tLand) return turn(J.pose(t));
    const x = t - J.tOff, y = v0 * x - (9.81 * x * x) / 2;
    const u = Math.min(ease(x / inSec), ease((J.tLand - t) / outSec));
    return turn(moveJoints(air(u), [0, y + 0.26 * u, 0]));
  }];
}
/** A hop and a quarter-turn in its flight (the rider's spin, started with a real turn): `deg` turnBody's sign. `early` (s):
 *  the turn starts that long BEFORE the take-off, in the push, as real riders wind it (review fix, 2026-09-26: the scripted
 *  turn began only at take-off, so its quarter always reached a mode after the hop's A — +170 to +260 ms — while 5 of the 6
 *  real hop turns reach it with or before the A, −90 to 0 ms); 0 is the take-off-only turn the gates were first built on. */
export function turnHopBeat(base: Joints, v0: number, deg: number, turn: (j: Joints) => Joints = (j) => j, stay = false, early = 0): Beat {
  const J = scriptedJump(base, v0, 0.25);
  const t0 = J.tOff - early, turnSec = Math.min(0.3, (J.tLand - J.tOff) * 0.7);
  return [J.end + (stay ? 0 : 0.5), (t) => {
    const u = t <= t0 ? 0 : t < t0 + turnSec ? ease((t - t0) / turnSec) : stay ? 1 : t < J.end ? 1 : 1 - ease((t - J.end) / 0.5);
    return turnAbout(turn(J.pose(Math.min(t, J.end))), deg * u);
  }];
}

// ── the arms: a steering wheel, wings ────────────────────────────────────────────────────────────────────────────

/**
 * Both hands on a steering wheel in front of the chest (its centre `ahead` m in front of the shoulders and `drop` m below
 * them, radius r), turned `deg` (+ = clockwise from the driver's seat = a RIGHT turn: the left hand up, the right down).
 * Elbows bent down and out. `grip` 0 lowers the arms back to the sides.
 */
export function wheelArms(j: Joints, deg: number, grip = 1, r = 0.19, ahead = 0.36, drop = 0.22): Joints {
  const o = { ...j };
  const mid: V3 = mul(add(j.LeftArm, j.RightArm), 0.5);
  const centre: V3 = add(mid, [0, -drop, ahead]);
  const a = (deg * Math.PI) / 180;
  for (const s of ['Left', 'Right'] as const) {
    const sg = s === 'Left' ? 1 : -1;
    const onWheel: V3 = add(centre, [sg * r * Math.cos(a), sg * r * Math.sin(a), 0]);
    const S = j[`${s}Arm`];
    const target = add(j[`${s}Hand`], mul(sub(onWheel, j[`${s}Hand`]), grip));
    const L = limb(S, target, UPPER_ARM, FOREARM, [sg * 0.6, -1, 0]);
    o[`${s}ForeArm`] = L.mid; o[`${s}Hand`] = L.end;
  }
  return o;
}

/**
 * Both arms out to the sides as wings, nearly straight: the mean elevation `pitch` (deg above the shoulder line, + = up
 * = climb) and the bank `bank` (+ = the right wing down, the left up = a right bank). `spread` 0 folds them to the sides.
 */
export function wingArms(j: Joints, bank: number, pitch = 0, spread = 1): Joints {
  const o = { ...j };
  const { left } = bodyAxes(j);
  for (const s of ['Left', 'Right'] as const) {
    const sg = s === 'Left' ? 1 : -1;
    const el = ((pitch + sg * bank) * Math.PI) / 180;
    const S = j[`${s}Arm`];
    const dir = add(mul(left, sg * Math.cos(el)), [0, Math.sin(el), 0]);
    const reach = (UPPER_ARM + FOREARM) * 0.99;
    const out = add(S, mul(dir, reach));
    const target = add(j[`${s}Hand`], mul(sub(out, j[`${s}Hand`]), spread));
    const L = limb(S, target, UPPER_ARM, FOREARM, [0, -0.3, -1]);
    o[`${s}ForeArm`] = L.mid; o[`${s}Hand`] = L.end;
  }
  return o;
}

/** One arm up waving over the head, the hand swinging side to side at 2 Hz (a wave to the room, not a steer). */
export const waveBeat = (base: Joints, sec: number, hand: 'Left' | 'Right' = 'Right'): Beat => [sec, (t) => {
  const o = { ...base }, S = base[`${hand}Arm`], sg = hand === 'Left' ? 1 : -1;
  const up = Math.min(1, t / 0.4);
  const sway = Math.sin(t * 2 * Math.PI * 2) * 0.18;
  const target: V3 = add(S, [sg * (0.18 + sway) * up, 0.45 * up - 0.5 * (1 - up), 0.05]);
  const L = limb(S, target, UPPER_ARM, FOREARM, [sg, -0.3, 0]);
  o[`${hand}ForeArm`] = L.mid; o[`${hand}Hand`] = L.end;
  return o;
}];

/** A stretch: both arms up and over, then a side bend each way and a forward fold, back to a stand (~`sec` s). */
export const stretchBeat = (base: Joints, sec = 4): Beat => [sec, (t) => {
  const u = t / sec;
  const o = { ...base };
  const up = u < 0.15 ? ease(u / 0.15) : u > 0.85 ? 1 - ease((u - 0.85) / 0.15) : 1;
  for (const s of ['Left', 'Right'] as const) {
    const sg = s === 'Left' ? 1 : -1, S = base[`${s}Arm`];
    const target: V3 = add(S, [sg * 0.05, 0.52 * up - 0.5 * (1 - up), 0]);
    const L = limb(S, target, UPPER_ARM, FOREARM, [sg, 0, -0.3]);
    o[`${s}ForeArm`] = L.mid; o[`${s}Hand`] = L.end;
  }
  // side bends (the trunk tipped about the forward axis through the hips), then a forward fold
  const hip = mul(add(base.LeftUpLeg, base.RightUpLeg), 0.5);
  const side = u > 0.2 && u < 0.5 ? Math.sin(((u - 0.2) / 0.3) * 2 * Math.PI) * 22 : 0;
  const fold = u > 0.55 && u < 0.85 ? Math.sin(((u - 0.55) / 0.3) * Math.PI) * 55 : 0;
  const UP = ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const;
  for (const n of UP) {
    let p = o[n];
    p = rot(p, hip, [0, 0, 1], (side * Math.PI) / 180);
    p = rot(p, hip, [1, 0, 0], (fold * Math.PI) / 180);
    o[n] = p;
  }
  return o;
}];

// ── moving in place ──────────────────────────────────────────────────────────────────────────────────────────────

/** Standing, the hips swaying ±`amp` m side to side at `hz` and the arms drifting: the idle a player never stops doing. */
export const swayBeat = (base: Joints, sec: number, amp = 0.025, hz = 0.25): Beat => [sec, (t) => {
  const s = Math.sin(t * 2 * Math.PI * hz), c = Math.cos(t * 2 * Math.PI * hz * 0.7);
  const UP = ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'RightUpLeg'] as const;
  const { left } = bodyAxes(base);
  const o = { ...base };
  for (const n of UP) o[n] = add(base[n], add(mul(left, amp * s * (n.endsWith('UpLeg') ? 1 : 0.8)), [0, 0, 0.008 * c]));
  for (const n of ['LeftHand', 'RightHand'] as const) o[n] = add(o[n], [0.02 * c, 0.015 * s, 0.03 * s]);
  for (const s2 of ['Left', 'Right'] as const) {   // the knees follow the hips over planted feet
    const k = limb(o[`${s2}UpLeg`], base[`${s2}Foot`], THIGH, SHIN, [0, 0, 1]);
    o[`${s2}Leg`] = k.mid;
  }
  return o;
}];

/**
 * Running (or walking) in place at `hz` STEPS per second, each foot lifted `lift` m, with the arms swinging. `lead`
 * starts the step with that foot. High knees: a big `lift` (0.25+) drives the knee to the hip line.
 */
export const runBeat = (base: Joints, sec: number, hz: number, lift: number, armSwing = 0.12): Beat => [sec, (t) => {
  const s = Math.sin(t * hz * Math.PI);
  let o = kneeUp(kneeUp(base, 'Left', Math.max(0, s) * lift), 'Right', Math.max(0, -s) * lift);
  if (armSwing > 0) {
    o = { ...o };
    for (const side of ['Left', 'Right'] as const) {
      const sg = side === 'Left' ? -1 : 1;
      const S = o[`${side}Arm`], a = sg * s * armSwing * 3;
      const r = (p: V3): V3 => rot(p, S, [1, 0, 0], a);
      o[`${side}ForeArm`] = r(o[`${side}ForeArm`]); o[`${side}Hand`] = r(o[`${side}Hand`]);
    }
  }
  return o;
}];

// ── a quarter-turn of the shoulders ──────────────────────────────────────────────────────────────────────────────

/**
 * From `from` (a stance), the whole body turned a further `deg` about the vertical over `turnSec` (+ = the left shoulder
 * away from the camera, streamKit's sign), held `holdSec`, and back over `backSec` (0 = it stays turned).
 */
export const turnBeat = (from: Joints, deg: number, turnSec = 0.3, holdSec = 0.4, backSec = 0.4): Beat => [turnSec + holdSec + backSec, (t) => {
  const u = t < turnSec ? ease(t / turnSec) : t < turnSec + holdSec ? 1 : backSec > 0 ? 1 - ease((t - turnSec - holdSec) / backSec) : 1;
  return turnAbout(from, deg * u);
}];
/** A body turned `deg` about the vertical through its own hips, turnBody's sign (turnBody turns about the origin). */
export function turnAbout(j: Joints, deg: number): Joints {
  const hip = mul(add(j.LeftUpLeg, j.RightUpLeg), 0.5);
  return mapJ(j, (p) => rot(p, [hip[0], 0, hip[2]], [0, 1, 0], (deg * Math.PI) / 180));
}

// ── a kick-push ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A skate push from a stance built by `stance(j)`: the REAR foot (the one not leading) comes off the board, reaches down
 * to the ground ahead of it along the board's axis, sweeps back, and returns — the lead foot planted throughout. In the
 * body's own frame before the turn: a regular rider's rear foot is the RIGHT one (−X).
 */
export const kickPushBeat = (base: Joints, lead: Lead, sec = 0.9, lift = 0.1, reach = 0.25): Beat => [sec, (t) => {
  const rear = lead === 'L' ? 'Right' : 'Left', sg = rear === 'Right' ? -1 : 1;
  const u = t / sec;
  // up (0–0.2), across to the ground ahead (0.2–0.4, down), the sweep back on the ground (0.4–0.7), up and home (0.7–1)
  const up = u < 0.2 ? ease(u / 0.2) : u < 0.4 ? 1 - ease((u - 0.2) / 0.2) : u < 0.7 ? 0 : u < 0.85 ? ease((u - 0.7) / 0.15) : 1 - ease((u - 0.85) / 0.15);
  const along = u < 0.4 ? ease(u / 0.4) * 0.6 : u < 0.7 ? 0.6 - 1.6 * ease((u - 0.4) / 0.3) : -1 + ease((u - 0.7) / 0.3);
  const o = { ...base };
  const F = base[`${rear}Foot`];
  const A: V3 = [F[0] - sg * 0.08 * Math.abs(along), F[1] + up * lift, F[2] + along * reach * 0.3];
  const k = limb(base[`${rear}UpLeg`], A, THIGH, SHIN, [0, 0, 1]);
  o[`${rear}Leg`] = k.mid; o[`${rear}Toe`] = add(base[`${rear}Toe`], sub(k.end, F)); o[`${rear}Foot`] = k.end;
  return o;
}];

// ── the camera's label flip ──────────────────────────────────────────────────────────────────────────────────────

/**
 * THE LABEL FLIP (PLAN-P8 §8.3): a pose model looking at a body's BACK often swaps its left and right labels. Every frame
 * whose face the model cannot see (the synth's face-away rule sets the nose's visibility under 0.5) comes back with
 * every left point's numbers under the right's name and back — positions kept, names swapped, image and world alike.
 * `rate` < 1 flips only that share of the face-away frames, in runs (a model does not flicker every frame).
 */
export function labelFlipWhenAway(frames: readonly PoseFrame[], opt: { rate?: number; seed?: number } = {}): PoseFrame[] {
  const rand = mulberry32(opt.seed ?? 5), rate = opt.rate ?? 1;
  let on = false;
  return frames.map((f) => {
    if (!f.present || !f.image.length) return f;
    const away = f.image[NOSE].v < 0.5;
    if (!away) { on = false; return f; }
    if (!on) on = rand() < rate;
    if (!on) return f;
    const image = MIRROR_INDEX.map((m) => ({ ...f.image[m] }));
    const g: PoseFrame = { ...f, image };
    if (f.world) g.world = MIRROR_INDEX.map((m) => ({ ...f.world![m] }));
    return g;
  });
}
