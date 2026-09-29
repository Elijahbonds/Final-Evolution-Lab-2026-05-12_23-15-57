// The Mirror's landmark fixtures, built in 3-D and filmed through the app's own virtual webcam
// (MIRROR-COACH P1 baseline, 2026-09-25).
//
// WHY THESE EXIST. Every Mirror audit (squat, lunge, the screen's framing) was tested on a dozen hand-placed points, and
// one of those hand-built frames put the subject's left shoulder on the image's LEFT — a mirrored subject — which is how
// the knee-valgus check shipped reading backwards (squat-audit.ts, fixed the same day). A body built in 3-D and filmed
// by lib/pose/synth.ts cannot do that: synthesize() refuses a mirrored source (assertHandedness), and the knees here
// bend because two bones of fixed length meet at them, not because a test typed an x. Later phases (the screen's
// graders, the lunge mount, the side-view hinge, the push-up) prove themselves against the same files.
//
// WHAT A FIXTURE IS. A JointClip (18 joints per frame, metres, the synth's world: Y up, floor at 0, camera on +Z at
// 3 m, lens 1.1 m up, 640×480, 60° wide, NOT mirrored) filmed noise-free with nothing dropped, so the file holds the
// geometry alone. `truth` is read from the JOINTS, never from the image: what the body really did (how far each knee sat
// inside its own hip–ankle line at the bottom, the trunk angle, the elbow angle…), in centimetres and degrees. An audit
// is graded against that.
//
// WHAT THEY ARE NOT. Synthetic. The synth's visibility model marks a far-side limb in a side view as fully visible
// (a real MediaPipe run marks it lower), its feet are a rigid model, and no fixture has the jitter a real phone gives —
// scripts/probes/_mirror-baseline.mts adds the synth's seeded noise on top where that matters. Nothing here stands in
// for a recording of a real person; the knee cue stays silent until one exists (cue-engine.ts VALGUS_CUE_VERIFIED).
//
// Pure: no fs, deterministic. lib/mirror/fixtures/*.json are these, written by the probe (`--write`); fixtures.test.ts
// checks the files still match.
import { synthesize, restPose, type CameraSpec, type Joints, type JointClip, type V3, type SynthOptions } from '@/lib/pose/synth';
import type { PoseFrame as LibPoseFrame } from '@/lib/pose/landmarks';

export const FIXTURE_FORMAT = 'fel-mirror-fixture/1' as const;
export type FixtureView = 'front' | 'back' | 'side';
export type FixturePattern = 'squat' | 'lunge' | 'hinge' | 'pushup' | 'stand' | 'singleLeg' | 'seated';
/** Ground truth: numbers (cm, degrees), labels, flags — all read from the joints. */
export type FixtureTruth = Record<string, number | string | boolean>;

export interface FixtureDef {
  name: string;
  pattern: FixturePattern;
  /** Which way the camera sees the body. Side = the subject's LEFT shoulder to the camera (screen.ts TURN_CUE.side). */
  view: FixtureView;
  description: string;
  clip: () => JointClip;
  /** What the body really did, from the joints. */
  truth: () => FixtureTruth;
}

// ── vectors ──────────────────────────────────────────────────────────────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
const orth = (a: V3, n: V3): V3 => sub(a, mul(n, dot(a, n)));
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
/** One decimal, and never -0 (JSON writes -0 as 0, so a file would otherwise disagree with its builder). */
const r1 = (x: number) => { const r = Math.round(x * 10) / 10; return Object.is(r, -0) ? 0 : r; };
/** Smooth 0→1 (a movement accelerates and settles; a linear ramp would jerk at both ends). */
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };

/** Rotate p about `pivot` around the X axis: + turns +Y toward +Z (a forward lean for a body facing +Z). */
function rotX(p: V3, pivot: V3, a: number): V3 {
  const y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}
/** Rotate p about `pivot` around the Y axis: + turns +Z toward +X. */
function rotY(p: V3, pivot: V3, a: number): V3 {
  const x = p[0] - pivot[0], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [pivot[0] + x * c + z * s, p[1], pivot[2] - x * s + z * c];
}
const mapJ = (j: Joints, f: (p: V3) => V3): Joints => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3)])) as Joints;

/** Interior angle at b (degrees) between a–b–c. */
export function angleAt(a: V3, b: V3, c: V3): number {
  const u = norm(sub(a, b)), v = norm(sub(c, b));
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v)))));
}

// ── the body ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Segment lengths (m), close to lib/pose/synth.ts restPose (thigh 0.430, shin 0.441, upper arm 0.281, forearm 0.251). */
export const THIGH = 0.43, SHIN = 0.44, UPPER_ARM = 0.28, FOREARM = 0.25;
const UPPER: (keyof Joints)[] = ['Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

/**
 * Two bones of fixed length from `root` to `end`; the middle joint bends toward `pole` (a knee forward, an elbow back).
 * Throws when the end is out of reach by more than a millimetre — a builder asking for a leg longer than a leg.
 */
export function solveMiddle(root: V3, end: V3, l1: number, l2: number, pole: V3): V3 {
  const axis = sub(end, root), D0 = len(axis);
  if (D0 > l1 + l2 + 1e-3) throw new Error(`[fixtures] out of reach: ${D0.toFixed(4)} m > ${(l1 + l2).toFixed(4)} m`);
  const D = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-6, D0));
  const u = norm(axis);
  const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return add(root, add(mul(u, along), mul(norm(orth(pole, u)), h)));
}

/** How far the middle joint sits off the root–end line (m) — the "h" of solveMiddle, for sizing a sideways knee. */
function offLine(root: V3, end: V3, l1: number, l2: number): number {
  const D = Math.min(l1 + l2 - 1e-6, len(sub(end, root)));
  const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  return Math.sqrt(Math.max(0, l1 * l1 - along * along));
}

/**
 * A knee's sideways offset from its own hip–ankle line, in the WORLD, + = toward the body's midline (x = 0), in cm.
 * The same geometry squat-audit.ts kneeInwardRatio reads from the image, here from the joints — the ground truth.
 */
export function kneeInwardCm(hip: V3, knee: V3, ankle: V3): number {
  const t = (knee[1] - hip[1]) / (ankle[1] - hip[1]);
  const lineX = hip[0] + (ankle[0] - hip[0]) * t;
  return (knee[0] - lineX) * Math.sign(0 - hip[0]) * 100;
}

// ── frames over time ─────────────────────────────────────────────────────────────────────────────────────────────
const FPS = 30;
/** Stand still `hold0` frames, go 0→1 over `down`, hold `bottom`, 1→0 over `up`, stand `hold1`: the depth per frame. */
function repCurve(hold0: number, down: number, bottom: number, up: number, hold1: number): number[] {
  const d: number[] = [];
  for (let i = 0; i < hold0; i++) d.push(0);
  for (let i = 0; i < down; i++) d.push(ease((i + 1) / down));
  for (let i = 0; i < bottom; i++) d.push(1);
  for (let i = 0; i < up; i++) d.push(ease(1 - (i + 1) / up));
  for (let i = 0; i < hold1; i++) d.push(0);
  return d;
}
const REP = () => repCurve(30, 30, 15, 30, 15);   // 1 s still (the audits calibrate), 1 s down, ½ s hold, 1 s up, ½ s still

// ── squat (front) ────────────────────────────────────────────────────────────────────────────────────────────────
export interface SquatOpts {
  /** Each knee's sideways travel at the bottom, measured off its own hip–ankle line (m): + = INWARD (caving), − = out. */
  kneeInL?: number;
  kneeInR?: number;
}
const SQUAT_STANCE = 0.13;      // ankle x: a little wider than the hips (0.09), toes forward
const SQUAT_DROP = 0.525;       // the hip joints fall this far: level with the knee joints at the bottom
const SQUAT_BACK = 0.20;        // …and sit back this far
const SQUAT_LEAN = 40;          // trunk forward from vertical at the bottom (deg)
const SQUAT_REACH = 80;         // arms raised forward for balance at the bottom (deg of shoulder flexion)

function squatHipsAnkles(d: number) {
  const drop = SQUAT_DROP * d + 0.005, back = SQUAT_BACK * d;
  return {
    drop, back,
    lh: [0.09, 0.95 - drop, -back] as V3, rh: [-0.09, 0.95 - drop, -back] as V3,
    la: [SQUAT_STANCE, 0.08, -0.02] as V3, ra: [-SQUAT_STANCE, 0.08, -0.02] as V3,
  };
}

/** One bodyweight squat frame at depth d (0 = standing, 1 = hips level with the knees). */
export function squatPose(d: number, o: SquatOpts = {}): Joints {
  const j = restPose();
  const { drop, back, lh, rh, la, ra } = squatHipsAnkles(d);
  // arms forward for balance (in the upright frame, about each shoulder)
  for (const s of ['Left', 'Right'] as const) {
    const sh = j[`${s}Arm`];
    j[`${s}ForeArm`] = rotX(j[`${s}ForeArm`], sh, -rad(SQUAT_REACH * d));
    j[`${s}Hand`] = rotX(j[`${s}Hand`], sh, -rad(SQUAT_REACH * d));
  }
  // the pelvis sits down and back; the upper body rides with it and leans forward over the feet
  j.Hips = [0, 0.98 - drop, -back];
  for (const k of UPPER) j[k] = rotX(add(j[k], [0, -drop, -back]), j.Hips, rad(SQUAT_LEAN * d));
  j.LeftUpLeg = lh; j.RightUpLeg = rh;
  j.LeftFoot = la; j.RightFoot = ra;
  j.LeftToe = [SQUAT_STANCE, 0.02, 0.11]; j.RightToe = [-SQUAT_STANCE, 0.02, 0.11];
  // the knees: two bones each, bent toward a pole turned in (or out) by the angle that puts the knee `kneeIn` off its
  // line at the bottom; the angle grows with depth, so a standing knee is straight over the foot
  const bottom = squatHipsAnkles(1);
  const knee = (hip: V3, ankle: V3, inward: number, midSign: number, hBottom: number) => {
    const phi = Math.asin(Math.max(-0.95, Math.min(0.95, inward / hBottom))) * d;
    return solveMiddle(hip, ankle, THIGH, SHIN, [midSign * Math.sin(phi), 0, Math.cos(phi)]);
  };
  j.LeftLeg = knee(lh, la, o.kneeInL ?? 0, -1, offLine(bottom.lh, bottom.la, THIGH, SHIN));
  j.RightLeg = knee(rh, ra, o.kneeInR ?? 0, +1, offLine(bottom.rh, bottom.ra, THIGH, SHIN));
  return j;
}

function squatTruth(o: SquatOpts): FixtureTruth {
  const b = squatPose(1, o), s = squatPose(0, o);
  const inL = kneeInwardCm(b.LeftUpLeg, b.LeftLeg, b.LeftFoot), inR = kneeInwardCm(b.RightUpLeg, b.RightLeg, b.RightFoot);
  return {
    // + = the knee sat INSIDE its own hip–ankle line (caving toward the midline), − = outside it (pushed out)
    kneeInwardCmLeft: r1(inL), kneeInwardCmRight: r1(inR),
    kneeCaves: inL >= 3 || inR >= 3,
    kneeCavesLeft: inL >= 3, kneeCavesRight: inR >= 3,
    kneePushedOut: inL <= -3 || inR <= -3,
    // hip joint vs knee joint height at the bottom (+ = the hip is BELOW the knee)
    hipBelowKneeCm: r1((b.LeftLeg[1] - b.LeftUpLeg[1]) * 100),
    kneeFlexionDegBottom: r1(180 - angleAt(b.LeftUpLeg, b.LeftLeg, b.LeftFoot)),
    kneeFlexionDegStanding: r1(180 - angleAt(s.LeftUpLeg, s.LeftLeg, s.LeftFoot)),
    trunkLeanDegBottom: SQUAT_LEAN,
    heelsLift: false,
    upperBodySidewaysCm: 0,
    hipsSidewaysCm: 0,
    reps: 1,
  };
}

// ── split squat (front) ──────────────────────────────────────────────────────────────────────────────────────────
export interface LungeOpts {
  front: 'left' | 'right';
  /** The FRONT knee's sideways travel at the bottom off its own hip–ankle line (m): + = inward. */
  frontKneeIn?: number;
}
const LUNGE_TOP = 0.82, LUNGE_DROP = 0.33;

function lungeParts(d: number, front: 'left' | 'right') {
  const f = front === 'left' ? 1 : -1;      // +X is the subject's left
  const hy = LUNGE_TOP - LUNGE_DROP * d;
  return {
    fh: [0.09 * f, hy, -0.03] as V3, bh: [-0.09 * f, hy, -0.03] as V3,
    fa: [0.12 * f, 0.08, 0.33] as V3, ft: [0.12 * f, 0.02, 0.46] as V3,          // front foot flat, toes forward
    ba: [-0.12 * f, 0.13, -0.42] as V3, bt: [-0.12 * f, 0.02, -0.33] as V3,      // back foot on its ball, heel up
    f,
  };
}

/** One split-squat frame at depth d: the stance is set before the rep (the audit calibrates on it), the hips go straight down. */
export function lungePose(d: number, o: LungeOpts): Joints {
  const j = restPose();
  const { fh, bh, fa, ft, ba, bt, f } = lungeParts(d, o.front);
  const drop = 0.95 - fh[1];
  j.Hips = [0, fh[1] + 0.03, -0.03];
  for (const k of UPPER) j[k] = add(j[k], [0, -drop, -0.03]);
  const F = o.front === 'left' ? 'Left' : 'Right', B = o.front === 'left' ? 'Right' : 'Left';
  j[`${F}UpLeg`] = fh; j[`${B}UpLeg`] = bh;
  j[`${F}Foot`] = fa; j[`${F}Toe`] = ft; j[`${B}Foot`] = ba; j[`${B}Toe`] = bt;
  const bottom = lungeParts(1, o.front);
  const hB = offLine(bottom.fh, bottom.fa, THIGH, SHIN);
  const phi = Math.asin(Math.max(-0.95, Math.min(0.95, (o.frontKneeIn ?? 0) / hB))) * d;
  // inward for the front leg is toward x = 0: −X for a left leg (f = +1), +X for a right one
  j[`${F}Leg`] = solveMiddle(fh, fa, THIGH, SHIN, [-f * Math.sin(phi), 0, Math.cos(phi)]);
  j[`${B}Leg`] = solveMiddle(bh, ba, THIGH, SHIN, [0, -1, 0.35]);       // the back knee drops toward the floor
  return j;
}

function lungeTruth(o: LungeOpts): FixtureTruth {
  const b = lungePose(1, o);
  const F = o.front === 'left' ? 'Left' : 'Right', B = o.front === 'left' ? 'Right' : 'Left';
  const inF = kneeInwardCm(b[`${F}UpLeg`], b[`${F}Leg`], b[`${F}Foot`]);
  return {
    front: o.front,
    frontKneeInwardCm: r1(inF),
    frontKneeCaves: inF >= 3,
    frontKneeFlexionDegBottom: r1(180 - angleAt(b[`${F}UpLeg`], b[`${F}Leg`], b[`${F}Foot`])),
    backKneeHeightCmBottom: r1(b[`${B}Leg`][1] * 100),
    hipDropSideToSideCm: 0,
    torsoSidewaysCm: 0,
    reps: 1,
  };
}

// ── hip hinge (side) ─────────────────────────────────────────────────────────────────────────────────────────────
const HINGE_BACK = 0.17, HINGE_DROP = 0.05, HINGE_TRUNK = 70;

/** A hip hinge (a bodyweight RDL) built facing the camera, then turned so the LEFT shoulder faces it. */
export function hingePose(d: number): Joints {
  const j = restPose();
  const lh: V3 = [0.09, 0.945 - HINGE_DROP * d, -HINGE_BACK * d], rh: V3 = [-0.09, lh[1], lh[2]];
  const la = j.LeftFoot, ra = j.RightFoot;
  j.Hips = [0, lh[1] + 0.03, lh[2]];
  for (const k of UPPER) j[k] = rotX(add(j[k], [0, lh[1] - 0.95, lh[2]]), j.Hips, rad(HINGE_TRUNK * d));
  // the arms hang straight down from the shoulders (gravity), whatever the trunk does
  for (const s of ['Left', 'Right'] as const) {
    const sh = j[`${s}Arm`];
    j[`${s}ForeArm`] = add(sh, [0, -UPPER_ARM, 0.01]);
    j[`${s}Hand`] = add(sh, [0, -UPPER_ARM - FOREARM, 0.02]);
  }
  j.LeftUpLeg = lh; j.RightUpLeg = rh;
  j.LeftLeg = solveMiddle(lh, la, THIGH, SHIN, [0, 0, 1]);
  j.RightLeg = solveMiddle(rh, ra, THIGH, SHIN, [0, 0, 1]);
  return toSide(j);
}

function hingeTruth(): FixtureTruth {
  const b = hingePose(1), s = hingePose(0);
  const hip = mid(b.LeftUpLeg, b.RightUpLeg), sh = mid(b.LeftArm, b.RightArm);
  const trunk = deg(Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(sh, hip)), [0, 1, 0])))));
  return {
    trunkFromVerticalDegBottom: r1(trunk),
    hipsBackCm: r1(len(sub(mid(b.LeftUpLeg, b.RightUpLeg), mid(s.LeftUpLeg, s.RightUpLeg))) * 100),
    kneeFlexionDegBottom: r1(180 - angleAt(b.LeftUpLeg, b.LeftLeg, b.LeftFoot)),
    spineNeutral: true,
    reps: 1,
  };
}

// ── push-up (side) ───────────────────────────────────────────────────────────────────────────────────────────────
const PUSH_TOP = 0.56, PUSH_BOTTOM = 0.31;   // shoulder-joint height (m): arms near straight, chest a hand off the floor
const PUSH_HAND_X = -0.66;                   // the hands stay planted here (x along the body; the head is toward −X)
const TORSO = 0.50, NECK = 0.07, HEADLEN = 0.17;

/**
 * A push-up seen from the side, LEFT side to the camera, head toward the image's left. Built directly in the world:
 * the body is one straight line from the ankles (the pivot, on the balls of the feet) to the shoulders.
 */
export function pushupPose(d: number): Joints {
  const shY = PUSH_TOP + (PUSH_BOTTOM - PUSH_TOP) * d;
  const ankle: V3 = [0.67, 0.12, 0];
  const bodyLen = TORSO + THIGH + SHIN;
  const a = Math.asin((shY - ankle[1]) / bodyLen);          // body line's angle to the floor
  const toHead: V3 = [-Math.cos(a), Math.sin(a), 0];         // unit, ankle → shoulder
  const at = (s: number, z: number): V3 => [ankle[0] + toHead[0] * s, ankle[1] + toHead[1] * s, z];
  const S = bodyLen, H = THIGH + SHIN;
  const j = {} as Joints;
  j.LeftFoot = at(0, 0.10); j.RightFoot = at(0, -0.10);
  j.LeftToe = [ankle[0] - 0.05, 0.02, 0.10]; j.RightToe = [ankle[0] - 0.05, 0.02, -0.10];
  j.LeftLeg = at(SHIN, 0.10); j.RightLeg = at(SHIN, -0.10);
  j.LeftUpLeg = at(H, 0.09); j.RightUpLeg = at(H, -0.09);
  j.Hips = at(H + 0.03, 0);
  j.Chest = at(H + 0.33, 0);
  j.LeftArm = at(S, 0.19); j.RightArm = at(S, -0.19);
  j.Neck = at(S + NECK, 0);
  j.Head = at(S + NECK + HEADLEN, 0);
  // hands planted under the top-position shoulders, a little wider than them; elbows bend back and out
  j.LeftHand = [PUSH_HAND_X, 0.05, 0.24]; j.RightHand = [PUSH_HAND_X, 0.05, -0.24];
  j.LeftForeArm = solveMiddle(j.LeftArm, j.LeftHand, UPPER_ARM, FOREARM, [0.55, 0.65, 0.5]);
  j.RightForeArm = solveMiddle(j.RightArm, j.RightHand, UPPER_ARM, FOREARM, [0.55, 0.65, -0.5]);
  return j;
}

function pushupTruth(): FixtureTruth {
  const b = pushupPose(1), t = pushupPose(0);
  return {
    elbowDegTop: r1(angleAt(t.LeftArm, t.LeftForeArm, t.LeftHand)),
    elbowDegBottom: r1(angleAt(b.LeftArm, b.LeftForeArm, b.LeftHand)),
    shoulderHeightCmTop: r1(PUSH_TOP * 100), shoulderHeightCmBottom: r1(PUSH_BOTTOM * 100),
    // the hips on the shoulder–ankle line (0 = a straight plank; + would be piked, − sagging)
    hipOffLineCm: 0,
    reps: 1,
  };
}

// ── standing still, single-leg stance, seated rotation ───────────────────────────────────────────────────────────
const mid = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);

/** Turn a body built facing the camera so its LEFT side faces it (the screen's side stations). */
function toSide(j: Joints): Joints { return mapJ(j, (p) => rotY(p, [0, 0, 0], -Math.PI / 2)); }
/** Turn a body built facing the camera all the way round (the heel-line station). */
function toBack(j: Joints): Joints { return mapJ(j, (p) => rotY(p, [0, 0, 0], Math.PI)); }

/** Standing on one leg, the other knee raised to hip height, arms by the sides; the trunk shifts over the stance foot. */
export function singleLegPose(stance: 'left' | 'right'): Joints {
  const j = restPose();
  const f = stance === 'left' ? 1 : -1;
  const shift: V3 = [0.06 * f, -0.01, 0];                   // the weight moves over the stance foot, the knee soft
  for (const k of [...UPPER, 'Hips', 'LeftUpLeg', 'RightUpLeg'] as (keyof Joints)[]) j[k] = add(j[k], shift);
  const St = stance === 'left' ? 'Left' : 'Right', Fr = stance === 'left' ? 'Right' : 'Left';
  j[`${St}Leg`] = solveMiddle(j[`${St}UpLeg`], j[`${St}Foot`], THIGH, SHIN, [0, 0, 1]);
  // the free leg: thigh level and forward, shin hanging
  const hip = j[`${Fr}UpLeg`];
  j[`${Fr}Leg`] = add(hip, [0, 0, THIGH]);
  j[`${Fr}Foot`] = add(j[`${Fr}Leg`], [0, -SHIN, 0.03]);
  j[`${Fr}Toe`] = add(j[`${Fr}Foot`], [0, -0.04, 0.12]);
  return j;
}

const SEATED_TURN = 40;
/** Seated on a (not filmed) chair, facing the camera, arms folded in front, the trunk turned `turnDeg` about vertical. */
export function seatedPose(turnDeg: number): Joints {
  const j = restPose();
  const dy = 0.50 - 0.98;
  j.Hips = [0, 0.50, -0.05];
  for (const k of UPPER) j[k] = add(j[k], [0, dy, -0.05]);
  for (const s of ['Left', 'Right'] as const) {
    const f = s === 'Left' ? 1 : -1, sh = j[`${s}Arm`];
    j[`${s}ForeArm`] = add(sh, [0.02 * f, -0.27, 0.06]);
    j[`${s}Hand`] = add(j[`${s}ForeArm`], [-0.14 * f, 0.03, 0.21]);
  }
  for (const k of UPPER) j[k] = rotY(j[k], j.Hips, rad(turnDeg));
  j.LeftUpLeg = [0.09, 0.47, -0.05]; j.RightUpLeg = [-0.09, 0.47, -0.05];
  j.LeftFoot = [0.12, 0.08, 0.40]; j.RightFoot = [-0.12, 0.08, 0.40];
  j.LeftToe = [0.12, 0.02, 0.53]; j.RightToe = [-0.12, 0.02, 0.53];
  j.LeftLeg = solveMiddle(j.LeftUpLeg, j.LeftFoot, THIGH, SHIN, [0, 0.3, 1]);
  j.RightLeg = solveMiddle(j.RightUpLeg, j.RightFoot, THIGH, SHIN, [0, 0.3, 1]);
  return j;
}
function seatedTurns(): number[] {
  const t: number[] = [];
  const seg = (n: number, a: number, b: number) => { for (let i = 0; i < n; i++) t.push(a + (b - a) * ease((i + 1) / n)); };
  for (let i = 0; i < 30; i++) t.push(0);
  seg(30, 0, SEATED_TURN); for (let i = 0; i < 15; i++) t.push(SEATED_TURN); seg(30, SEATED_TURN, 0);
  seg(30, 0, -SEATED_TURN); for (let i = 0; i < 15; i++) t.push(-SEATED_TURN); seg(30, -SEATED_TURN, 0);
  for (let i = 0; i < 15; i++) t.push(0);
  return t;
}

const still = (j: Joints, n = 30): JointClip => ({ fps: FPS, frames: Array.from({ length: n }, () => j) });
const over = (curve: number[], pose: (d: number) => Joints): JointClip => ({ fps: FPS, frames: curve.map(pose) });

// ── the list ─────────────────────────────────────────────────────────────────────────────────────────────────────
const IN = 0.06, OUT = -0.05;   // the knee shifts: 6 cm in, 5 cm out (the same sizes the mirror-truth step measured)

const squat = (name: string, o: SquatOpts, description: string): FixtureDef => ({
  name, pattern: 'squat', view: 'front', description,
  clip: () => over(REP(), (d) => squatPose(d, o)), truth: () => squatTruth(o),
});
const lunge = (name: string, o: LungeOpts, description: string): FixtureDef => ({
  name, pattern: 'lunge', view: 'front', description,
  clip: () => over(REP(), (d) => lungePose(d, o)), truth: () => lungeTruth(o),
});

export const FIXTURES: readonly FixtureDef[] = [
  squat('squat_clean', {}, 'Bodyweight squat to thighs level, knees tracking over the feet, heels down, no sideways drift.'),
  squat('squat_knee_in_left', { kneeInL: IN }, 'The same squat with the LEFT knee caving 6 cm inside its hip–ankle line at the bottom; the right tracks.'),
  squat('squat_knee_in_right', { kneeInR: IN }, 'The same squat with the RIGHT knee caving 6 cm inside its hip–ankle line at the bottom; the left tracks.'),
  squat('squat_knees_in_both', { kneeInL: IN, kneeInR: IN }, 'The same squat with BOTH knees caving 6 cm in at the bottom.'),
  squat('squat_knee_out_left', { kneeInL: OUT }, 'The same squat with the LEFT knee pushed 5 cm OUT past its hip–ankle line (not a fault); the right tracks.'),
  squat('squat_knee_out_right', { kneeInR: OUT }, 'The same squat with the RIGHT knee pushed 5 cm OUT (not a fault); the left tracks.'),
  squat('squat_knees_out_both', { kneeInL: OUT, kneeInR: OUT }, 'The same squat with BOTH knees pushed 5 cm out (not a fault).'),
  lunge('lunge_left_front', { front: 'left' }, 'Split squat from the front, LEFT foot forward, stance set before the rep, front knee tracking over the foot.'),
  lunge('lunge_right_front_knee_in', { front: 'right', frontKneeIn: 0.05 }, 'Split squat from the front, RIGHT foot forward, the front knee caving 5 cm in at the bottom.'),
  {
    name: 'hinge_side', pattern: 'hinge', view: 'side',
    description: 'Bodyweight hip hinge (RDL) from the side, left shoulder to the camera: hips back 17 cm, trunk to 70° from vertical, soft knees, spine neutral.',
    clip: () => over(repCurve(30, 36, 15, 36, 15), hingePose), truth: hingeTruth,
  },
  {
    name: 'pushup_side', pattern: 'pushup', view: 'side',
    description: 'Push-up from the side, left side to the camera, head toward image-left: a straight plank from the balls of the feet, chest to a hand off the floor.',
    clip: () => over(repCurve(30, 30, 10, 30, 20), pushupPose), truth: pushupTruth,
  },
  {
    name: 'stand_front', pattern: 'stand', view: 'front',
    description: 'Standing still facing the camera, feet under the hips, arms by the sides (the screen\'s front stations).',
    clip: () => still(restPose()), truth: () => ({ still: true, shouldersLevel: true, hipsLevel: true }),
  },
  {
    name: 'stand_back', pattern: 'stand', view: 'back',
    description: 'The same stance, back to the camera (the screen\'s heel-line station).',
    clip: () => still(toBack(restPose())), truth: () => ({ still: true }),
  },
  {
    name: 'stand_side', pattern: 'stand', view: 'side',
    description: 'The same stance, turned exactly side-on with the LEFT shoulder to the camera (the screen\'s head-float and pelvis stations).',
    clip: () => still(toSide(restPose())), truth: () => ({ still: true, earOverShoulder: true }),
  },
  {
    name: 'single_leg_left', pattern: 'singleLeg', view: 'front',
    description: 'Standing on the LEFT leg facing the camera, right knee up to hip height, pelvis level, arms by the sides (screen wobbleL).',
    clip: () => still(singleLegPose('left')), truth: () => ({ still: true, stance: 'left', pelvisLevel: true }),
  },
  {
    name: 'single_leg_right', pattern: 'singleLeg', view: 'front',
    description: 'Standing on the RIGHT leg facing the camera, left knee up to hip height (screen wobbleR).',
    clip: () => still(singleLegPose('right')), truth: () => ({ still: true, stance: 'right', pelvisLevel: true }),
  },
  {
    name: 'seated_rotation_front', pattern: 'seated', view: 'front',
    description: 'Seated facing the camera, arms folded, turning the trunk 40° to each side and back (the full screen\'s rotation station).',
    clip: () => ({ fps: FPS, frames: seatedTurns().map(seatedPose) }), truth: () => ({ turnDegEachSide: SEATED_TURN }),
  },
];

export type FixtureName = typeof FIXTURES[number]['name'];
export const FIXTURE_NAMES: readonly string[] = FIXTURES.map((f) => f.name);

export function fixtureDef(name: string): FixtureDef {
  const f = FIXTURES.find((x) => x.name === name);
  if (!f) throw new Error(`[fixtures] no fixture named ${name}`);
  return f;
}

/**
 * The camera every fixture is filmed with — a phone at hip height across a room: 640×480, 60° wide, 3 m away, lens
 * 1.1 m up. The same numbers as lib/pose/synth.ts DEFAULT_CAMERA today, but PINNED here rather than read from it
 * (MIRROR-COACH P1 review, 2026-09-25): lib/pose/synth.ts belongs to the movement-play lane, and a change to its default
 * camera there would move all 17 fixtures and turn this lane's suite red at the merge for a reason that is not a
 * Mirror change. Anything else synth.ts models (visibility, the foot, noise) can still move them: whoever merges a
 * synth change re-runs `scripts/probes/_mirror-baseline.mts --write` and reviews the diff.
 */
export const FIXTURE_CAMERA: Readonly<CameraSpec> = Object.freeze({ width: 640, height: 480, hfovDeg: 60, distance: 3.0, heightM: 1.1 });

/** Noise-free, nothing dropped, no shutter jitter: the geometry alone. */
export const CLEAN_FILM: SynthOptions = { noise: false, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0 };

/**
 * Film a fixture through the virtual webcam, always with FIXTURE_CAMERA. `opt` defaults to CLEAN_FILM; pass the
 * synth's noise for a jittered take.
 */
export function filmFixture(name: string, opt: SynthOptions = CLEAN_FILM): LibPoseFrame[] {
  return synthesize(fixtureDef(name).clip(), { ...opt, camera: { ...FIXTURE_CAMERA, ...opt.camera } }).frames;
}
