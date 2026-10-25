// approachTake — ground-truth APPROACH jumps and the standing reach for the bench (JUMP-PRO 2, 2026-10-24).
//
// lib/jump/ballistic.ts films a standing jump: the hips stand in for the centre of mass, and the athlete stands still
// before it. An approach has neither: the athlete runs in, plants one foot (or two) for ~0.2 s without ever stopping,
// swings both arms up through the take-off and drives a knee, so only the CENTRE OF MASS (lib/jump/com.ts) flies a
// parabola. So here a body is built from its parts every millisecond:
//
//   run-in      steps at `runSpeed`, alternating feet, each with a heel strike, a roll and a toe-off, and a short float
//   penultimate a longer, lower step (the gather); both arms swing back
//   plant       one foot (`takeoff: 'one'`, the right; the left knee drives up) or both (`'two'`, a step-close); the
//               body decelerates to `takeoffSpeed` and the arms swing up; the plant foot rolls heel → toe and leaves last
//   flight      the centre of mass is ballistic from the take-off's own velocity; the arms reach up (the right one
//               straight up at the apex), the legs come through to the landing posture
//   landing     touch-down solved by bisection (the lowest foot point reaches the floor), absorb, stand, stand still
//
// Every stance foot is fixed to the floor (its pivot moves heel → toe as it rolls, never sliding); a leg's knee is solved
// from its hip and ankle, and an ankle the hip would pull out of reach is lifted onto its toes, as a body does.
//
// THE CAMERA SEES IT SIDE-ON: the run crosses the picture (world +X), the lens 4.5 m out on +Z. `headingDeg` turns the
// run toward (+) or away from (−) the lens — the "drift along the lens axis" a phone on the side cannot see as motion,
// only as the body growing or shrinking. The take-off spot is at world (TAKEOFF_X, 0, 0).
//
// TRUTH, from the joints: heightV0Cm = v0²/2g of the centre of mass (the force plate's height), heightFlightCm = g·T²/8
// of the true flight, landDropCm (centre of mass at touch-down minus at take-off), the take-off foot, the horizontal
// speed at take-off, and the highest index point in flight (the "touch" a camera could see).
//
// reachTake: the one-time standing reach — facing the lens at the take-off spot, stand still, then one arm straight up.
//
// Pure, deterministic.
import { bodyPoints, type JointClip, type Joints, type V3 } from '@/lib/pose/synth';
import { comOfV3 } from './com';
import { G, SOURCE_HZ, type TrialTruth } from './ballistic';

const THIGH = 0.43, SHIN = 0.44;
/** A leg is never quite straight (the knee does not lock): the longest hip-to-ankle it reaches. */
const LEG_MAX = (THIGH + SHIN) * 0.997;
const HIP_HALF = 0.09, HIP_DROP = 0.03, FOOT_X = 0.1, SHOULDER_X = 0.19, UPPER_ARM = 0.28, FOREARM = 0.25;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Cubic Hermite on [0, 1]: p0 → p1 with end slopes m0, m1 (per unit u). */
const herm = (p0: number, m0: number, p1: number, m1: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

/** The world spot (X, m) the plant foot's toe leaves from. */
export const TAKEOFF_X = -0.9;
/** The approach camera: side-on, 4.5 m out, lens at 1.1 m. */
export const APPROACH_CAMERA = { width: 640, height: 480, hfovDeg: 60, distance: 4.5, heightM: 1.1 } as const;

// ── the body, in its own frame: facing +z, its left on +x, the floor at y = 0 ────────────────────────────────────

type YZ = [number, number];
interface Foot { a: YZ; pitch: number }
interface Arm { flex: number; elbow: number }
interface Body { py: number; pz: number; lean: number; L: Foot; R: Foot; armL: Arm; armR: Arm }

/**
 * The foot's points from its ankle at a pitch (rad, + = toes down): its Toe joint, and the heel and toe-tip points
 * exactly as lib/pose/synth.ts footPoints places them (DEFAULT_FOOT), in (y, z).
 */
function footRel(p: number): { toe: YZ; heel: YZ; tip: YZ } {
  const c = Math.cos(p), s = Math.sin(p);
  const vy = -0.06 * c - 0.13 * s, vz = -0.06 * s + 0.13 * c;
  const l = Math.hypot(vy, vz), fy = vy / l, fz = vz / l;
  const uy = fz, uz = -fy;
  const ny = fy * 0.5, nz = fz, nl = Math.hypot(ny, nz);
  return { toe: [vy, vz], heel: [fy * -0.025 + uy * -0.0855, fz * -0.025 + uz * -0.0855], tip: [vy + (0.05 * ny) / nl, vz + (0.05 * nz) / nl] };
}
/** The pitch at which heel and toe tip touch the floor together. */
const P_FLAT = (() => { let lo = -0.4, hi = 0.4; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2, f = footRel(m); if (f.heel[0] < f.tip[0]) lo = m; else hi = m; } return (lo + hi) / 2; })();
const FLAT = footRel(P_FLAT);
/** Ankle height of a foot standing flat. */
export const ANKLE_FLAT = -FLAT.tip[0];

/** A stance foot whose toe tip sits on the floor at z = zTip, at pitch p: it pivots on the heel before flat, the toe after. */
function stance(zTip: number, p: number): Foot {
  if (p >= P_FLAT) { const t = footRel(p).tip; return { a: [-t[0], zTip - t[1]], pitch: p }; }
  const zHeel = zTip - FLAT.tip[1] + FLAT.heel[1], h = footRel(p).heel;
  return { a: [-h[0], zHeel - h[1]], pitch: p };
}
/** The hip joint of a leg. */
const hipOf = (b: Pick<Body, 'py' | 'pz'>): YZ => [b.py - HIP_DROP, b.pz];
const dist = (a: YZ, b: YZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The smallest pitch ≥ p0 that keeps a stance foot in reach of its hip (the heel lifts as the body rises over it). */
function reachPitch(hip: YZ, zTip: number, p0: number): number {
  if (dist(hip, stance(zTip, p0).a) <= LEG_MAX) return p0;
  let lo = p0, hi = 1.4;
  if (dist(hip, stance(zTip, hi).a) > LEG_MAX) return hi;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (dist(hip, stance(zTip, m).a) > LEG_MAX) lo = m; else hi = m; }
  return hi;
}
/** A knee, bent forward (+z), from hip and ankle; an ankle out of reach is counted (the builder's own check). */
let outOfReach = 0;
function knee(h: YZ, a: YZ): YZ {
  let d = dist(h, a);
  if (d > LEG_MAX + 1e-4) outOfReach++;
  d = Math.max(0.05, Math.min(LEG_MAX, d));
  const uy = (a[0] - h[0]) / (dist(h, a) || 1), uz = (a[1] - h[1]) / (dist(h, a) || 1);
  const along = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
  // the perpendicular toward the front (+z) of a leg pointing down
  let ny = uz, nz = -uy;
  if (nz < 0) { ny = -ny; nz = -nz; }
  return [h[0] + uy * along + ny * hh, h[1] + uz * along + nz * hh];
}
/** A swing foot held at `rel` (ankle − hip joint), never further than the leg reaches. */
function swingFoot(b: Pick<Body, 'py' | 'pz'>, rel: YZ, pitch: number): Foot {
  const l = Math.hypot(rel[0], rel[1]), k = l > LEG_MAX ? LEG_MAX / l : 1;
  const h = hipOf(b);
  return { a: [h[0] + rel[0] * k, h[1] + rel[1] * k], pitch };
}
const relOf = (b: Pick<Body, 'py' | 'pz'>, f: Foot): YZ => { const h = hipOf(b); return [f.a[0] - h[0], f.a[1] - h[1]]; };

/** The body's joints in its own frame. */
function joints(b: Body): Joints {
  const cl = Math.cos(b.lean), sl = Math.sin(b.lean);
  const up = (d: number): V3 => [0, b.py + d * cl, b.pz + d * sl];
  const Hips: V3 = [0, b.py, b.pz];
  const sh = up(0.47);
  const arm = (side: 1 | -1, a: Arm): [V3, V3, V3] => {
    const s: V3 = [side * SHOULDER_X, sh[1], sh[2]];
    const e: V3 = [side * (SHOULDER_X + 0.02), s[1] - UPPER_ARM * Math.cos(a.flex), s[2] + UPPER_ARM * Math.sin(a.flex)];
    const f = a.flex + a.elbow;
    return [s, e, [side * (SHOULDER_X + 0.03), e[1] - FOREARM * Math.cos(f), e[2] + FOREARM * Math.sin(f)]];
  };
  const [LeftArm, LeftForeArm, LeftHand] = arm(1, b.armL), [RightArm, RightForeArm, RightHand] = arm(-1, b.armR);
  const leg = (side: 1 | -1, f: Foot): [V3, V3, V3, V3] => {
    const h = hipOf(b), k = knee(h, f.a), t = footRel(f.pitch).toe;
    return [[side * HIP_HALF, h[0], h[1]], [side * (HIP_HALF + 0.005), k[0], k[1]], [side * FOOT_X, f.a[0], f.a[1]], [side * FOOT_X, f.a[0] + t[0], f.a[1] + t[1]]];
  };
  const [LeftUpLeg, LeftLeg, LeftFoot, LeftToe] = leg(1, b.L), [RightUpLeg, RightLeg, RightFoot, RightToe] = leg(-1, b.R);
  const Head = up(0.64); Head[2] += 0.01;
  return { Hips, Chest: up(0.32), Neck: up(0.54), Head, LeftArm, LeftForeArm, LeftHand, RightArm, RightForeArm, RightHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToe, RightUpLeg, RightLeg, RightFoot, RightToe };
}

// ── placing it in the world ──────────────────────────────────────────────────────────────────────────────────────

/** Own frame → world: forward (+z) becomes +X turned `heading` toward the lens (+Z); the take-off toe lands at `origin`. */
function placer(headingDeg: number, origin: V3) {
  const h = rad(headingDeg), ch = Math.cos(h), sh = Math.sin(h);
  // forward f = (cos h, 0, sin h); left = up × … : facing f with up +y, left = (sin h, 0, −cos h)
  return (p: V3): V3 => [origin[0] + p[2] * ch + p[0] * sh, p[1], origin[2] + p[2] * sh - p[0] * ch];
}
const mapJ = (j: Joints, f: (p: V3) => V3): Joints => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3)])) as Joints;

// ── a take ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ApproachSpec {
  /** Truth: the centre of mass's take-off-velocity height (m). */
  heightM: number;
  /** 'one' = off the right foot, the left knee driving; 'two' = a step-close onto both feet. */
  takeoff: 'one' | 'two';
  /** Run-in speed (m/s, default 4) and the horizontal speed at take-off (default 0.6 × it). */
  runSpeed?: number;
  takeoffSpeed?: number;
  /** Both arms swing back on the gather and up through the take-off, the right reaching straight up (default true). */
  armSwing?: boolean;
  /** The run's heading toward (+) or away from (−) the lens (deg, default 0: straight across the picture). */
  headingDeg?: number;
  /** Knee bend at touch-down (0 = lands extended, as it left; 0.3 ≈ 40° more knee). */
  landKnee?: number;
  /** Run-in steps before the gather (default 3). */
  steps?: number;
}

export interface ApproachTruth extends TrialTruth {
  takeoffFoot: 'left' | 'right' | 'both';
  /** Horizontal speed of the centre of mass at take-off (m/s). */
  speedMps: number;
  /** The highest index-finger point in flight (cm above the floor). */
  touchCm: number;
  /** The heading the run was filmed at (deg). */
  headingDeg: number;
}

/** A built take: the 1 kHz clip, its truth, and how often a leg was asked to reach further than it can (0 is right). */
export interface ApproachTake { clip: JointClip; truth: ApproachTruth[]; outOfReach: number }

interface Seg { from: number; to: number; at: (t: number) => Body }

/** One approach jump: run in, plant, fly, land, stand. */
export function buildApproach(s: ApproachSpec): ApproachTake {
  outOfReach = 0;
  const vRun = s.runSpeed ?? 4, vTo = s.takeoffSpeed ?? 0.6 * vRun, swing = s.armSwing ?? true, nSteps = s.steps ?? 3;
  const two = s.takeoff === 'two';
  const segs: Seg[] = [];
  // ── the timeline: run steps (stance + float), the gather, the plant
  const ST = 0.2, FL = 0.09, PEN_ST = 0.22, PEN_FL = 0.07, PLANT = two ? 0.24 : 0.2, LAG2 = 0.035;
  type Contact = { foot: 'L' | 'R'; td: number; to: number };
  const contacts: Contact[] = [];
  let t = 0;
  // the plant is the right foot (one) — or the right then the left (two); the steps alternate back from it
  const plantFeet: ('L' | 'R')[] = two ? ['R', 'L'] : ['R'];
  const penFoot: 'L' | 'R' = two ? 'L' : 'L';
  const runFeet: ('L' | 'R')[] = [];
  for (let k = 0; k < nSteps; k++) runFeet.unshift(k % 2 === 0 ? (penFoot === 'L' ? 'R' : 'L') : penFoot);
  for (const f of runFeet) { contacts.push({ foot: f, td: t, to: t + ST }); t += ST + FL; }
  const tPenTd = t; contacts.push({ foot: penFoot, td: t, to: t + PEN_ST }); t += PEN_ST + PEN_FL;
  const tPlantTd = t;
  if (two) { contacts.push({ foot: 'R', td: t, to: t + PLANT }); contacts.push({ foot: 'L', td: t + LAG2, to: t + PLANT }); }
  else contacts.push({ foot: 'R', td: t, to: t + PLANT });
  const tTo = t + PLANT;
  // ── horizontal: the run's speed, slowing through the gather and plant to vTo at take-off
  const speed = (x: number) => (x <= tPenTd ? vRun : x >= tTo ? vTo : lerp(vRun, vTo, ease((x - tPenTd) / (tTo - tPenTd))));
  const zAt = (() => { const dt = 0.001, n = Math.ceil(tTo / dt) + 2, zs = [0]; for (let k = 1; k < n; k++) zs.push(zs[k - 1] + speed((k - 0.5) * dt) * dt); return (x: number) => { const u = Math.max(0, x) / dt, i = Math.min(zs.length - 2, Math.floor(u)); return lerp(zs[i], zs[i + 1], u - i); }; })();
  // ── vertical: a running bounce (low at mid-stance), lower on the gather; the plant is solved below
  const cyc = ST + FL;
  const runY = (x: number) => {
    const c = contacts.filter((q) => q.td <= x + 1e-9).pop() ?? contacts[0];
    const mid = (c.td + c.to) / 2;
    const base = x < tPenTd ? 0.9 : lerp(0.9, 0.8, ease((x - tPenTd) / PEN_ST));
    return base - 0.025 * Math.cos((2 * Math.PI * (x - mid)) / cyc);
  };
  // ── where each stance foot plants: its ankle ahead of the hips at touch-down, heel first
  const P_TD = rad(-12);
  // as far ahead as the leg reaches at touch-down (a heel strike, the knee all but straight)
  const plantAhead = (c: Contact) => {
    const want = c.td >= tPenTd ? 0.38 : 0.3;
    const dy = runY(c.td) - HIP_DROP + footRel(P_TD).heel[0];
    return Math.min(want, Math.sqrt(Math.max(0, (LEG_MAX * 0.985) ** 2 - dy * dy)));
  };
  // the plant's toe tip: the hips over it (+0.1 m) at take-off — for a two-foot plant both toes side by side
  const zTipOf = new Map<Contact, number>();
  for (const c of contacts) {
    const isPlant = c.td >= tPlantTd - 1e-9;
    if (isPlant) { zTipOf.set(c, zAt(tTo) - 0.1); continue; }
    const aZ = zAt(c.td) + plantAhead(c), hRel = footRel(P_TD).heel;
    const zHeel = aZ + hRel[1];
    zTipOf.set(c, zHeel - FLAT.heel[1] + FLAT.tip[1]);
  }
  // ── the plant's vertical path: from the gather's height and speed to the take-off height, its end speed solved so the
  // CENTRE OF MASS leaves at v0 = √(2gh)
  const v0 = Math.sqrt(2 * G * s.heightM);
  const P_TO = rad(36);
  const zTipPlant = zAt(tTo) - 0.1;
  const toAnkle = stance(zTipPlant, P_TO).a;
  const hipTo: YZ = [toAnkle[0] + Math.sqrt(Math.max(0, (LEG_MAX * 0.995) ** 2 - (zAt(tTo) - toAnkle[1]) ** 2)), zAt(tTo)];
  const yTo = hipTo[0] + HIP_DROP;
  const y0 = runY(tPlantTd), dy0 = (runY(tPlantTd + 0.001) - runY(tPlantTd - 0.001)) / 0.002;
  let vHip = v0 * 0.85;
  const plantY = (x: number, vEnd: number) => {
    const u = (x - tPlantTd) / PLANT;
    return herm(y0, dy0 * PLANT, yTo, vEnd * PLANT, u);
  };
  // ── arms and trunk over time
  const tApexGuess = tTo + v0 / G;
  const armAt = (x: number, side: 'L' | 'R'): Arm => {
    const ph = (2 * Math.PI * x) / (2 * cyc), runFlex = rad(35) * Math.sin(ph) * (side === 'R' ? 1 : -1);
    const run: Arm = { flex: runFlex, elbow: rad(80) };
    if (x < tPenTd) return run;
    const quiet: Arm = { flex: rad(10), elbow: rad(20) };
    if (!swing) { const u = ease((x - tPenTd) / PEN_ST); return { flex: lerp(run.flex, quiet.flex, u), elbow: lerp(run.elbow, quiet.elbow, u) }; }
    const back: Arm = { flex: rad(-50), elbow: rad(30) };
    if (x < tPlantTd) { const u = ease((x - tPenTd) / (tPlantTd - tPenTd)); return { flex: lerp(run.flex, back.flex, u), elbow: lerp(run.elbow, back.elbow, u) }; }
    const up: Arm = { flex: rad(110), elbow: rad(20) };
    if (x < tTo) { const u = ease((x - tPlantTd) / PLANT); return { flex: lerp(back.flex, up.flex, u), elbow: lerp(back.elbow, up.elbow, u) }; }
    const reach: Arm = side === 'R' ? { flex: rad(178), elbow: 0 } : { flex: rad(150), elbow: rad(10) };
    if (x < tApexGuess) { const u = ease((x - tTo) / (tApexGuess - tTo)); return { flex: lerp(up.flex, reach.flex, u), elbow: lerp(up.elbow, reach.elbow, u) }; }
    const down: Arm = { flex: rad(60), elbow: rad(30) };
    const u = ease((x - tApexGuess) / (tApexGuess - tTo));
    return { flex: lerp(reach.flex, down.flex, u), elbow: lerp(reach.elbow, down.elbow, u) };
  };
  const quietArm = (x: number): Arm => armAt(x, 'R');
  void quietArm;
  const leanAt = (x: number) => (x < tPenTd ? rad(12) : x < tPlantTd ? lerp(rad(12), rad(15), ease((x - tPenTd) / (tPlantTd - tPenTd))) : x <= tTo ? lerp(rad(15), rad(5), ease((x - tPlantTd) / PLANT)) : lerp(rad(5), rad(3), ease((x - tTo) / 0.2)));
  // ── a foot at time x on the ground: its contact, pitch (heel strike → flat → the heel rising), kept in reach
  const contactOf = (f: 'L' | 'R', x: number) => contacts.find((c) => c.foot === f && x >= c.td - 1e-9 && x <= c.to + 1e-9) ?? null;
  const schedPitch = (c: Contact, x: number) => {
    const u = (x - c.td) / (c.to - c.td);
    return u < 0.25 ? lerp(P_TD, P_FLAT, ease(u / 0.25)) : u < 0.55 ? P_FLAT : lerp(P_FLAT, rad(28), ease((u - 0.55) / 0.45));
  };
  const groundFoot = (c: Contact, x: number, pelvis: { py: number; pz: number }): Foot => {
    const z = zTipOf.get(c)!;
    return stance(z, reachPitch(hipOf(pelvis), z, schedPitch(c, x)));
  };
  // a swing foot between contacts: from its lift-off to its next touch-down (relative to the hips), lifted mid-way
  const swingBetween = (f: 'L' | 'R', x: number, pelvisAt: (x: number) => { py: number; pz: number }): Foot => {
    const prev = contacts.filter((c) => c.foot === f && c.to <= x).pop();
    const next = contacts.find((c) => c.foot === f && c.td >= x);
    const pv = pelvisAt(x);
    const startRel: YZ = prev ? relOf(pelvisAt(prev.to), groundFoot(prev, prev.to, pelvisAt(prev.to))) : [-0.8, -0.35];
    const p0 = prev ? groundFoot(prev, prev.to, pelvisAt(prev.to)).pitch : rad(25);
    let endRel: YZ, p1: number, from = prev?.to ?? x - 0.2, to: number;
    if (next) { const pe = pelvisAt(next.td), g = groundFoot(next, next.td, pe); endRel = relOf(pe, g); p1 = g.pitch; to = next.td; }
    else if (!two && f === 'L') { endRel = [-0.46, 0.42]; p1 = rad(20); to = tTo; }       // the knee drive
    else { endRel = [-0.8, 0.1]; p1 = rad(20); to = tTo; }
    if (from > x) from = x - 0.2;
    const u = clamp01((x - from) / Math.max(1e-3, to - from)), w = ease(u);
    const rel: YZ = [lerp(startRel[0], endRel[0], w) + 0.22 * Math.sin(Math.PI * u), lerp(startRel[1], endRel[1], w)];
    return swingFoot(pv, rel, lerp(p0, p1, w));
  };
  // ── the ground phases (run-in to take-off) as one body function of time
  const groundPelvis = (x: number, vEnd: number) => ({ py: x < tPlantTd ? runY(x) : plantY(x, vEnd), pz: zAt(x) });
  const groundBody = (x: number, vEnd: number): Body => {
    const pelvisAt = (y: number) => groundPelvis(Math.min(y, tTo), vEnd);
    const pv = pelvisAt(x);
    const foot = (f: 'L' | 'R') => { const c = contactOf(f, x); return c ? groundFoot(c, x, pv) : swingBetween(f, x, pelvisAt); };
    return { ...pv, lean: leanAt(x), L: foot('L'), R: foot('R'), armL: armAt(x, 'L'), armR: armAt(x, 'R') };
  };
  const comY = (b: Body) => comOfV3(bodyPoints(joints(b)))[1];
  const comZ = (b: Body) => comOfV3(bodyPoints(joints(b)))[2];
  // solve the hips' end speed so the centre of mass leaves at v0 (secant)
  const vCom = (vEnd: number) => (comY(groundBody(tTo, vEnd)) - comY(groundBody(tTo - 0.002, vEnd))) / 0.002;
  let a = v0 * 0.6, fa = vCom(a) - v0, b2 = v0 * 1.1, fb = vCom(b2) - v0;
  for (let k = 0; k < 12 && Math.abs(fb) > 1e-4; k++) { const c = b2 - (fb * (b2 - a)) / (fb - fa); a = b2; fa = fb; b2 = c; fb = vCom(b2) - v0; }
  vHip = b2;
  segs.push({ from: 0, to: tTo, at: (x) => groundBody(x, vHip) });
  // ── the flight: the centre of mass ballistic from the take-off's own state; the posture moves about it
  const bTo = groundBody(tTo, vHip);
  const cTo: YZ = [comY(bTo), comZ(bTo)];
  const vy0 = vCom(vHip), vz0 = (comZ(bTo) - comZ(groundBody(tTo - 0.002, vHip))) / 0.002;
  const relTo = { R: relOf(bTo, bTo.R), L: relOf(bTo, bTo.L) };
  const hipVel = (comY(bTo) - comY(bTo)) + (bTo.py - groundBody(tTo - 0.002, vHip).py) / 0.002;
  const lk = s.landKnee ?? 0;
  const landRel: YZ = [-0.82 + 0.3 * lk, 0.12 + 0.12 * lk];
  const P_LAND = rad(22) - rad(15) * lk;
  const airRel: YZ = [-0.72, -0.12];
  const flightPosture = (tau: number, Tn: number): Body => {
    const sN = clamp01(tau / Tn);
    const legPath = (start: YZ, pStart: number, mid: YZ): Foot => {
      // the toe trails for the first ~60 ms (the ankle keeps extending as the body leaves), then the leg comes through
      const lagU = clamp01(tau / 0.06);
      const pitch = sN < 0.4 ? lerp(pStart + rad(10) * ease(lagU), rad(25), ease(sN / 0.4)) : lerp(rad(25), P_LAND, ease((sN - 0.5) / 0.5));
      const r: YZ = sN < 0.4
        ? [herm(start[0], -hipVel * 0.04, mid[0], 0, ease(sN / 0.4)), lerp(start[1], mid[1], ease(sN / 0.4))]
        : [lerp(mid[0], landRel[0], ease((sN - 0.4) / 0.6)), lerp(mid[1], landRel[1], ease((sN - 0.4) / 0.6))];
      return swingFoot({ py: 0, pz: 0 }, r, pitch);
    };
    const R = legPath(relTo.R, bTo.R.pitch, airRel);
    const L = two ? legPath(relTo.L, bTo.L.pitch, airRel) : legPath(relTo.L, bTo.L.pitch, [-0.55, 0.3]);
    const x = tTo + tau;
    return { py: 0, pz: 0, lean: leanAt(x), L, R, armL: armAt(x, 'L'), armR: armAt(x, 'R') };
  };
  const Tn = (2 * vy0) / G;
  const flightBody = (tau: number): Body => {
    const pst = flightPosture(tau, Tn);
    const c = comOfV3(bodyPoints(joints(pst)));
    const cy = cTo[0] + vy0 * tau - (G * tau * tau) / 2, cz = cTo[1] + vz0 * tau;
    const dy = cy - c[1], dz = cz - c[2];
    const sh = (f: Foot): Foot => ({ a: [f.a[0] + dy, f.a[1] + dz], pitch: f.pitch });
    return { ...pst, py: dy, pz: dz, L: sh(pst.L), R: sh(pst.R) };
  };
  const lowFoot = (b: Body) => { const p = bodyPoints(joints(b)); return Math.min(...[27, 28, 29, 30, 31, 32].map((i) => p[i][1])); };
  let lo = Tn * 0.5, hi = Tn * 1.8;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (lowFoot(flightBody(m)) > 0) lo = m; else hi = m; }
  const T = (lo + hi) / 2;
  segs.push({ from: tTo, to: tTo + T, at: (x) => flightBody(x - tTo) });
  // the highest index point in flight
  let touch = 0;
  for (let tau = 0; tau <= T; tau += 0.002) { const p = bodyPoints(joints(flightBody(tau))); touch = Math.max(touch, p[19][1], p[20][1]); }
  // ── the landing: both feet planted where they touched, toes then heels; absorb, stand up, stand still
  const bTd = flightBody(T);
  const tTd = tTo + T;
  const vPy = (bTd.py - flightBody(T - 0.002).py) / 0.002, vPz = (bTd.pz - flightBody(T - 0.002).pz) / 0.002;
  const tipZ = (f: Foot) => f.a[1] + footRel(f.pitch).tip[1];
  const tipY = (f: Foot) => f.a[0] + footRel(f.pitch).tip[0];
  const landTip = { L: tipZ(bTd.L), R: tipZ(bTd.R) };
  const lowL = tipY(bTd.L), lowR = tipY(bTd.R);
  const ABS = 0.3, UP = 0.55, STILL = 1.2, absorb = 0.16 + 0.1 * lk;
  const yStand = 0.98;
  const landBody = (x: number): Body => {
    const u = x - tTd;
    const py = u < ABS ? herm(bTd.py, vPy * ABS, bTd.py - absorb, 0, u / ABS) : u < ABS + UP ? lerp(bTd.py - absorb, yStand, ease((u - ABS) / UP)) : yStand;
    const pz = u < ABS ? herm(bTd.pz, vPz * ABS, bTd.pz + (vPz * ABS) / 2, 0, u / ABS) : bTd.pz + (vPz * ABS) / 2;
    const pv = { py, pz };
    const foot = (f: Foot, zt: number, low: number): Foot => {
      const sched = u < 0.06 ? lerp(f.pitch, P_FLAT, ease(u / 0.06)) : P_FLAT;
      // the second foot comes down onto the floor in the first 30 ms
      const st = stance(zt, reachPitch(hipOf(pv), zt, sched));
      if (u < 0.03 && low > 0) return { a: [st.a[0] + low * (1 - u / 0.03), st.a[1]], pitch: st.pitch };
      return st;
    };
    // the arms and trunk carry on from the touch-down: the arms come down, the trunk bends into the absorb and stands
    const arm = (a0: Arm): Arm => ({ flex: lerp(a0.flex, rad(5), ease(u / 0.5)), elbow: lerp(a0.elbow, rad(10), ease(u / 0.5)) });
    const lean = u < ABS ? lerp(bTd.lean, rad(15), ease(u / ABS)) : lerp(rad(15), 0, ease((u - ABS) / UP));
    return { ...pv, lean, L: foot(bTd.L, landTip.L, lowL), R: foot(bTd.R, landTip.R, lowR), armL: arm(bTd.armL), armR: arm(bTd.armR) };
  };
  segs.push({ from: tTd, to: tTd + ABS + UP + STILL, at: landBody });
  // ── sample at 1 kHz, place in the world
  const end = tTd + ABS + UP + STILL;
  const heading = s.headingDeg ?? 0;
  const toeTo = (() => { const j = joints(bTo); const p = bodyPoints(j); return p[32]; })();
  const place = placer(heading, [TAKEOFF_X - toeTo[2], 0, 0]);
  const n = Math.floor(end * SOURCE_HZ) + 1;
  const frames: Joints[] = new Array(n);
  let si = 0;
  for (let k = 0; k < n; k++) {
    const x = k / SOURCE_HZ;
    while (si < segs.length - 1 && x >= segs[si].to) si++;
    frames[k] = mapJ(joints(segs[si].at(Math.min(x, segs[si].to))), place);
  }
  const comTd = comOfV3(bodyPoints(joints(bTd)))[1];
  const truth: ApproachTruth = {
    takeoffT: tTo * 1000, landT: tTd * 1000, flightMs: T * 1000,
    heightV0Cm: ((vy0 * vy0) / (2 * G)) * 100, heightFlightCm: ((G * T * T) / 8) * 100,
    landDropCm: (comTd - cTo[0]) * 100,
    takeoffFoot: two ? 'both' : 'right', speedMps: vz0, touchCm: touch * 100, headingDeg: heading,
  };
  return { clip: { fps: SOURCE_HZ, frames }, truth: [truth], outOfReach };
}

// ── the standing reach ───────────────────────────────────────────────────────────────────────────────────────────

export interface ReachTruth {
  /** The raised hand's index point over the floor (cm): what the camera's reach reads. */
  reachCm: number;
  /** The body's nose over the floor (cm), standing. */
  noseCm: number;
}

/**
 * Facing the lens at the take-off spot: stand still `standS` with the arms down, raise the right arm straight up over
 * 0.5 s, hold it `holdS`, lower it. `shrug` lifts the raised shoulder (m), as a body reaching hard does.
 */
export function buildReach(o: { standS?: number; holdS?: number; shrug?: number; elbowDeg?: number } = {}): { clip: JointClip; truth: ReachTruth } {
  const standS = o.standS ?? 1.5, holdS = o.holdS ?? 2.5, raise = 0.5;
  const zTip = 0.12;
  const base = (): Body => {
    const pv = { py: 0.98, pz: 0 };
    const f = stance(zTip, P_FLAT);
    return { ...pv, lean: 0, L: f, R: f, armL: { flex: rad(4), elbow: rad(8) }, armR: { flex: rad(4), elbow: rad(8) } };
  };
  const at = (x: number): Joints => {
    const b = base();
    const u = x < standS ? 0 : x < standS + raise ? ease((x - standS) / raise) : x < standS + raise + holdS ? 1 : 1 - ease((x - standS - raise - holdS) / raise);
    b.armR = { flex: lerp(rad(4), Math.PI, u), elbow: lerp(rad(8), rad(o.elbowDeg ?? 0), u) };
    const j = joints(b);
    if (o.shrug) { const d = o.shrug * u; for (const k of ['RightArm', 'RightForeArm', 'RightHand'] as const) j[k] = [j[k][0], j[k][1] + d, j[k][2]]; }
    return mapJ(j, (p) => [TAKEOFF_X + p[0], p[1], p[2]]);
  };
  const end = standS + raise + holdS + raise + 0.5;
  const n = Math.floor(end * SOURCE_HZ) + 1;
  const frames: Joints[] = [];
  for (let k = 0; k < n; k++) frames.push(at(k / SOURCE_HZ));
  const up = bodyPoints(at(standS + raise + holdS / 2));
  return { clip: { fps: SOURCE_HZ, frames }, truth: { reachCm: up[20][1] * 100, noseCm: up[0][1] * 100 } };
}
