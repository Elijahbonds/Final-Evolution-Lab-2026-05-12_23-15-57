// fightKit — scripted FIGHT bodies for the combat read (movement play P7, 2026-09-25).
//
// The owner's captures are dance and freestyle, and the CMU fight takes on disk hold straights in plenty (80_10, 144_13 /
// 20, 113_13, 86_01), eight wide hooks (143_23) and kicks — but no bent-arm hook, no uppercut, no slip and no step out of a
// fighting stance (PLAN-P7 §6.1, re-read on sheets this pass). So those are SCRIPTED here, from synth.ts's rest body the
// way streamKit scripts a jump: a stance, two-bone arms and legs solved to a wrist or an ankle path, the torso turned
// through the strike. Every stream built from this kit is marked `labeller: 'scripted'` in the gate and the report, so
// its numbers are never read as real motion.
//
// THE REVIEW (2026-09-26): each strike's path can depart from the reference (StrikeVariant, drawn per seed by
// fightTakes, so a test seed's paths are ones no threshold saw); straights from a CHAMBER (the hip, the ribs, a hand
// cocked back); the guard raised from a LOW guard one hand after the other; and the gestures that are not strikes —
// claps, a wave in front of the face, arm swings (standBody).
//
// Room frame (synth.ts): metres, Y up, the player facing +Z (the camera), the subject's LEFT on +X. A punch is thrown AT
// the camera (the opponent is on screen). Each path is minimum-jerk in the SHOULDER's frame (the arm's own motion, which
// is what the reader measures), carried by the torso's turn.
//
// Pure: no DOM, no fs, deterministic for a seed.
import { restPose, mulberry32, type Joints, type JointClip, type V3 } from './synth';
import type { Beat } from './streamKit';

export type FightHand = 'L' | 'R';
export type ScriptBlow = 'jab' | 'cross' | 'hook' | 'uppercut';
export type ScriptKick = 'front' | 'round';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3, fb: V3 = [0, 0, 1]): V3 => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : fb; };
const lerp3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
/** Minimum jerk: the smooth 0 → 1 of a reach (Flash & Hogan): zero speed and acceleration at both ends. */
export const minJerk = (u: number): number => { const x = clamp01(u); return x * x * x * (10 - 15 * x + 6 * x * x); };
const side = (h: FightHand) => (h === 'L' ? 1 : -1);          // the subject's left is on +X
const J = (h: FightHand) => (h === 'L' ? 'Left' : 'Right') as 'Left' | 'Right';
const other = (h: FightHand): FightHand => (h === 'L' ? 'R' : 'L');

/** Turn p about the vertical through `about` by deg (+ = the left shoulder away from the camera, streamKit.turnBody's sign). */
function yawAbout(p: V3, about: V3, deg: number): V3 {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = p[0] - about[0], z = p[2] - about[2];
  return [about[0] + x * c + z * s, p[1], about[2] - x * s + z * c];
}
/** Tilt p about the horizontal z axis through `about` by deg (+ = toward the subject's left, +X). */
function rollAbout(p: V3, about: V3, deg: number): V3 {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = p[0] - about[0], y = p[1] - about[1];
  return [about[0] + x * c + y * s, about[1] - x * s + y * c, p[2]];
}
/** Pitch p about the horizontal x axis through `about` by deg (+ = the head toward the camera, a bow). */
function pitchAbout(p: V3, about: V3, deg: number): V3 {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), y = p[1] - about[1], z = p[2] - about[2];
  return [p[0], about[1] + y * c - z * s, about[2] + y * s + z * c];
}

/** A two-bone limb from S to (toward) T, bones l1, l2, the middle joint bent toward `pole`. */
export function ik2(S: V3, T: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3 } {
  const v = sub(T, S), u = norm(v, [0, -1, 0]);
  const d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, len(v)));
  let p = sub(pole, mul(u, dot(pole, u)));
  p = len(p) > 1e-6 ? norm(p) : norm(sub([0, 0, 1], mul(u, u[2])), [1, 0, 0]);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { mid: add(S, add(mul(u, a), mul(p, h))), end: add(S, mul(u, d)) };
}

const UPPER = ['Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const;

export interface StanceOptions {
  /** How far the hips sit down (m). */
  crouch?: number;
  /** The torso's blade toward the lead side (deg). */
  bladeDeg?: number;
  /** Lead foot ahead of the rear one (m, toward the camera). */
  stagger?: number;
  /** Feet apart (m, across). */
  width?: number;
  /** The guard's fists raised (m) and pushed forward (m) from the reference guard at the chin (the review, 2026-09-26:
   *  each seed's body holds its own guard). */
  guardDy?: number;
  guardDz?: number;
}

/** One arm's say for a frame: its wrist relative to its shoulder, and where its elbow points. */
export interface ArmPose { rel: V3; pole: V3 }
/** Everything a frame of a fight script sets, over the stance. */
export interface FightParams {
  /** Upper-body turn (deg, turnBody's sign) on top of the stance's blade. */
  yawDeg?: number;
  /** Upper-body lean across (deg, + = toward the subject's left) and forward bend (deg). */
  rollDeg?: number;
  pitchDeg?: number;
  /** Hips lowered (m) on top of the stance's crouch. */
  drop?: number;
  /** The whole body moved (m): a step's travel. Feet go with it unless a foot is given. */
  shift?: V3;
  /** A foot's ankle placed in the room (absolute), for a step's swing. */
  feet?: Partial<Record<FightHand, V3>>;
  /** Arms: a pose, or the guard (default), or hanging at rest, or a LOW guard (the fists in front of the chest `lowY` m
   *  under the shoulder line). */
  arms?: Partial<Record<FightHand, ArmPose | 'guard' | 'rest' | { lowY: number }>>;
  /** A kick: the kicking foot's ankle (absolute) and where its knee points. */
  kick?: { foot: FightHand; ankle: V3; pole: V3 };
  /** The whole body turned about the lead foot (deg): a spin's quarter-turn. */
  spinDeg?: number;
}

/**
 * A fighting stance built from the rest body: the lead foot `stagger` ahead, the hips down `crouch`, the torso bladed
 * toward the lead side, both fists up at the chin. Orthodox = lead 'L'. Returns a poser that lays FightParams over it.
 */
export class FightBody {
  readonly base: Joints;
  readonly lead: FightHand;
  readonly arm: Record<FightHand, { l1: number; l2: number }>;
  readonly leg: Record<FightHand, { l1: number; l2: number }>;
  readonly foot: Record<FightHand, V3>;
  readonly toe: Record<FightHand, V3>;
  readonly pelvis: V3;
  readonly crouch: number;
  readonly blade: number;
  readonly guardDy: number;
  readonly guardDz: number;

  constructor(lead: FightHand = 'L', o: StanceOptions = {}) {
    const r = restPose();
    this.lead = lead;
    this.crouch = o.crouch ?? 0.06;
    this.blade = o.bladeDeg ?? 20;
    this.guardDy = o.guardDy ?? 0;
    this.guardDz = o.guardDz ?? 0;
    const stagger = o.stagger ?? 0.32, width = o.width ?? 0.27;
    const L = (a: V3, b: V3) => len(sub(a, b));
    this.arm = { L: { l1: L(r.LeftForeArm, r.LeftArm), l2: L(r.LeftHand, r.LeftForeArm) }, R: { l1: L(r.RightForeArm, r.RightArm), l2: L(r.RightHand, r.RightForeArm) } };
    this.leg = { L: { l1: L(r.LeftLeg, r.LeftUpLeg), l2: L(r.LeftFoot, r.LeftLeg) }, R: { l1: L(r.RightLeg, r.RightUpLeg), l2: L(r.RightFoot, r.RightLeg) } };
    const rear = other(lead);
    this.foot = { L: [0, 0.08, 0], R: [0, 0.08, 0] };
    this.foot[lead] = [side(lead) * width * 0.5, 0.08, stagger * 0.45];
    this.foot[rear] = [side(rear) * width * 0.52, 0.08, -stagger * 0.55];
    // toes: the lead foot points at the camera turned in a little, the rear one out
    const toeDir = (h: FightHand, outDeg: number): V3 => { const a = (outDeg * Math.PI) / 180; return [side(h) * Math.sin(a), 0, Math.cos(a)]; };
    this.toe = { L: [0, 0, 0], R: [0, 0, 0] };
    this.toe[lead] = add(add(this.foot[lead], mul(toeDir(lead, -10), 0.13)), [0, -0.06, 0]);
    this.toe[rear] = add(add(this.foot[rear], mul(toeDir(rear, 40), 0.13)), [0, -0.06, 0]);
    this.pelvis = [0, 0.95 - this.crouch, -0.02];
    this.base = this.pose({});
  }

  /** The chin (room): the fists guard it. */
  chin(j: Joints): V3 { return add(j.Neck, [0, 0.03, 0.08]); }
  /** The guard for a hand, relative to its shoulder, in the posed body. */
  guardRel(j: Joints, h: FightHand): V3 {
    const lead = h === this.lead;
    const c = this.chin(j);
    const target = add(c, [side(h) * (lead ? 0.09 : 0.11), (lead ? 0.03 : 0.0) + this.guardDy, (lead ? 0.2 : 0.1) + this.guardDz]);
    return sub(target, j[`${J(h)}Arm`]);
  }
  guardPole(h: FightHand): V3 { return [side(h) * 0.4, -1, -0.15]; }
  /** A LOW guard for a hand, relative to its shoulder: the fist in front of the chest, `lowY` m under the shoulder line,
   *  across as the guard is (the elbow down at the side). */
  lowGuardRel(j: Joints, h: FightHand, lowY: number): ArmPose {
    const g = this.guardRel(j, h);
    return { rel: [g[0], -lowY, Math.max(0.16, g[2] - 0.04)], pole: [side(h) * 0.3, -1, -0.3] };
  }

  pose(p: FightParams): Joints {
    const r = restPose();
    const shift = p.shift ?? [0, 0, 0];
    const drop = this.crouch + (p.drop ?? 0);
    const out = { ...r } as Joints;
    // the pelvis and the upper body at the stance height, turned by the blade (the lead shoulder forward) and the frame's turn
    const pel: V3 = add([this.pelvis[0], 0.95 - drop, this.pelvis[2]], shift);
    const bladeDeg = -side(this.lead) * this.blade + (p.yawDeg ?? 0);
    const hipDelta: V3 = sub(pel, [0, 0.95, 0]);
    out.Hips = add(r.Hips, hipDelta);
    for (const s of ['Left', 'Right'] as const) out[`${s}UpLeg`] = yawAbout(add(r[`${s}UpLeg`], hipDelta), pel, bladeDeg * 0.5);
    for (const n of UPPER) {
      let q = add(r[n], hipDelta);
      q = yawAbout(q, pel, bladeDeg);
      if (p.pitchDeg) q = pitchAbout(q, pel, p.pitchDeg + 4);
      else q = pitchAbout(q, pel, 4);
      if (p.rollDeg) q = rollAbout(q, pel, p.rollDeg);
      out[n] = q;
    }
    // the feet: where the stance (plus the shift) or the frame puts them, the knees solved forward
    for (const h of ['L', 'R'] as FightHand[]) {
      const s = J(h), H = out[`${s}UpLeg`];
      const kick = p.kick?.foot === h ? p.kick : null;
      const A = kick ? kick.ankle : p.feet?.[h] ?? add(this.foot[h], shift);
      const { mid, end } = ik2(H, A, this.leg[h].l1, this.leg[h].l2, kick ? kick.pole : [side(h) * 0.15, 0.1, 1]);
      out[`${s}Leg`] = mid; out[`${s}Foot`] = end;
      const toeOff = sub(this.toe[h], this.foot[h]);
      out[`${s}Toe`] = kick ? add(end, mul(norm(sub(end, mid)), 0.13)) : add(end, add(toeOff, [0, Math.min(0, 0.08 - end[1]) * 0, 0]));
    }
    // the arms: the guard, a strike's wrist, or hanging
    for (const h of ['L', 'R'] as FightHand[]) {
      const s = J(h), S = out[`${s}Arm`];
      const a = p.arms?.[h] ?? 'guard';
      if (a === 'rest') {
        out[`${s}ForeArm`] = add(S, sub(r[`${s}ForeArm`], r[`${s}Arm`]));
        out[`${s}Hand`] = add(S, sub(r[`${s}Hand`], r[`${s}Arm`]));
        continue;
      }
      const pose = a === 'guard' ? { rel: this.guardRel(out, h), pole: this.guardPole(h) } : 'lowY' in a ? this.lowGuardRel(out, h, a.lowY) : a;
      const { mid, end } = ik2(S, add(S, pose.rel), this.arm[h].l1, this.arm[h].l2, pose.pole);
      out[`${s}ForeArm`] = mid; out[`${s}Hand`] = end;
    }
    if (p.spinDeg) {
      const about = add(this.foot[this.lead], shift);
      for (const k of Object.keys(out) as (keyof Joints)[]) out[k] = yawAbout(out[k], about, p.spinDeg);
    }
    return out;
  }
}

// ── strikes, in the shoulder's frame ────────────────────────────────────────────────────────────────────────────────

export interface Rng { (): number }
const jit = (rng: Rng, v: number, share: number) => v * (1 + (rng() * 2 - 1) * share);

/** One labelled event of a script: what it is, and the stretch of the take (s) it happens in. The instants come from the
 *  clean joints (fightTruth), never from here. */
export interface ScriptLabel {
  kind: 'blow' | 'legKick' | 'guard' | 'evade' | 'fightStep' | 'turn';
  cls: string;              // jab / cross / hook / uppercut · front / round · raise / drop · slip / duck · in / out / left / right · turn
  hand?: FightHand;         // the striking hand / kicking foot / stepping foot / slip side
  from: number;
  to: number;
}
export interface ScriptItem { sec: number; pose: (t: number) => Joints; labels: ScriptLabel[] }

/** Held in the stance, bobbing: the fists and the hips move a little, as a real guard does. `arms`: the guard, hanging at
 *  rest, or a low guard (the fists in front of the chest `lowY` m under the shoulder line). */
export function stanceItem(fb: FightBody, sec: number, rng: Rng, arms: 'guard' | 'rest' | { lowY: number } = 'guard', shift: V3 = [0, 0, 0]): ScriptItem {
  const hz = 1.2 + rng() * 0.8, ph = rng() * Math.PI * 2, amp = 0.008 + rng() * 0.01;
  return {
    sec, labels: [],
    pose: (t) => {
      const b = Math.sin(2 * Math.PI * hz * t + ph);
      const armsP = arms === 'rest' ? { L: 'rest' as const, R: 'rest' as const } : typeof arms === 'object' ? { L: arms, R: arms } : undefined;
      return fb.pose({ drop: amp * (b + 1), yawDeg: 2 * Math.sin(2 * Math.PI * hz * 0.5 * t + ph), arms: armsP, shift });
    },
  };
}

/** One strike's arm on its own clock: its wrist (relative to the shoulder) and elbow pole at a time, the torso's turn and
 *  the hips' dip it asks for. A combo lays several over one body (each arm follows its latest strike). */
export interface StrikeTrack {
  name: ScriptBlow;
  hand: FightHand;
  tOut: number;
  tHold: number;
  dur: number;
  at(t: number, body: Joints): { rel: V3; pole: V3 };
  u(t: number): number;
  yaw(t: number): number;
  drop(t: number): number;
}

/**
 * How one strike's path departs from the kit's reference path. fightTakes draws one per strike (drawVariant) from each
 * seed's own generator, so a TEST seed's hooks and uppercuts are paths the thresholds were never tuned on (the review,
 * 2026-09-26: a seed used to change only the noise, the timing and ±5 cm of height). Every field defaults to the
 * reference path (the numbers in strikeTrack).
 */
export interface StrikeVariant {
  /** straight: the end's reach (share of the arm) and how far it angles in toward the face line (m per 1 m out). */
  reach?: number;
  inAngle?: number;
  /** straight: where it starts — the guard, or a chamber: at the hip (karate's reverse punch), at the ribs, or the fist
   *  cocked behind the shoulder. */
  from?: 'guard' | 'hip' | 'rib' | 'cocked';
  /** hook: the end, in across from its shoulder (m) and in front of it (m); the load, out beside the shoulder line (m) and
   *  its share of the wind-up. */
  hookIn?: number;
  hookFwd?: number;
  hookLoad?: number;
  loadShare?: number;
  /** uppercut: the dip under the shoulder (m: the load), the end in across (m), up (m) and in front (m). */
  upDip?: number;
  upIn?: number;
  upTop?: number;
  upFwd?: number;
}
/** A chamber's wrist relative to its shoulder (m; the hand's own side is +x for the left). */
export function chamberRel(from: 'hip' | 'rib' | 'cocked', h: FightHand): V3 {
  const s = side(h);
  return from === 'hip' ? [s * 0.03, -0.38, -0.1] : from === 'rib' ? [s * 0.01, -0.24, -0.06] : [s * 0.0, -0.02, -0.12];
}
/** One strike's variant, drawn from `rng` (the ranges a coach would still call the strike by its name). */
export function drawVariant(name: ScriptBlow, rng: Rng): StrikeVariant {
  const U = (a: number, b: number) => a + (b - a) * rng();
  if (name === 'jab' || name === 'cross') return { reach: U(0.9, 0.98), inAngle: U(0.04, 0.2) };
  if (name === 'hook') return { hookIn: U(0.14, 0.26), hookFwd: U(0.22, 0.34), hookLoad: U(0, 0.1), loadShare: U(0.25, 0.5) };
  return { upDip: U(0.08, 0.2), upIn: U(0.04, 0.12), upTop: U(0.04, 0.14), upFwd: U(0.18, 0.3) };
}

export function strikeTrack(fb: FightBody, name: ScriptBlow, rng: Rng, hand?: FightHand, v: StrikeVariant = {}): StrikeTrack {
  const h: FightHand = hand ?? (name === 'jab' ? fb.lead : name === 'cross' ? other(fb.lead) : fb.lead);
  const sgn = side(h);
  const arm = fb.arm[h].l1 + fb.arm[h].l2;
  const straight = name === 'jab' || name === 'cross';
  const chamber = straight && v.from && v.from !== 'guard' ? chamberRel(v.from, h) : null;
  // out in ~0.1 s (a jab's wrist peaks ~4–6 m/s relative to its shoulder: 80_10's straights, 144_20's); a hook's and an
  // uppercut's first stretch is their load (the elbow lifting out, the fist dropping), slower, then the drive; a straight
  // from a chamber travels further (~0.6 m), in ~0.16 s
  const tOut = straight ? jit(rng, chamber ? 0.16 : name === 'jab' ? 0.1 : 0.115, 0.2) : jit(rng, name === 'hook' ? 0.2 : 0.18, 0.2);
  const tHold = jit(rng, 0.05, 0.4), tBack = jit(rng, 0.22, 0.25);
  const turn = name === 'jab' && !chamber ? 8 : name === 'jab' || name === 'cross' ? 34 : name === 'hook' ? 36 : 18;
  const yawEnd = -sgn * jit(rng, turn, 0.2);                 // the striking shoulder comes round, toward the camera
  const height = (rng() * 2 - 1) * 0.05;
  const u = (t: number) => (t <= 0 ? 0 : t < tOut ? minJerk(t / tOut) : t < tOut + tHold ? 1 : 1 - minJerk((t - tOut - tHold) / tBack));
  return {
    name, hand: h, tOut, tHold, dur: tOut + tHold + tBack, u,
    yaw: (t) => yawEnd * u(t),
    drop: (t) => (name === 'uppercut' ? 0.03 * Math.sin(Math.PI * u(t)) : 0),
    at: (t, body) => {
      const k = u(t);
      const G = chamber ?? fb.guardRel(body, h);
      if (straight) {
        // at the camera, level with the shoulder, a little in toward the line of the face (from a chamber: at the chest)
        const E = mul(norm([-sgn * (v.inAngle ?? 0.12), 0.02 + height - (chamber ? 0.12 : 0), 1]), (v.reach ?? 0.95) * arm);
        return { rel: lerp3(G, E, k), pole: lerp3(chamber ? [sgn * 0.3, -1, -1] : fb.guardPole(h), [sgn * 0.8, -1, 0], k) };
      }
      // out: the load (the first LOAD of tOut, slower) then the drive, each leg minimum-jerk; home: straight back
      const LOAD = v.loadShare ?? 0.4;
      const tau = clamp01(t / tOut);
      const legA = minJerk(tau / LOAD), legB = minJerk((tau - LOAD) / (1 - LOAD));
      if (name === 'hook') {
        // the elbow lifts out (the fist to beside the shoulder line), then the sweep round and in at shoulder height to in
        // front of the other shoulder, the elbow up and out (bent ~90°)
        const L0: V3 = [sgn * (v.hookLoad ?? 0.06), -0.02 + height, 0.26];
        const E: V3 = [-sgn * (v.hookIn ?? 0.22), 0.0 + height, v.hookFwd ?? 0.28];
        const rel = t >= tOut ? lerp3(G, E, k) : tau < LOAD ? lerp3(G, L0, legA) : lerp3(L0, E, legB);
        return { rel, pole: lerp3(fb.guardPole(h), [sgn, 0.25, -0.3], Math.min(1, k * 2)) };
      }
      // the fist drops a little under the chest, then drives up close to the body to the chin, the elbow under it
      const D: V3 = [-sgn * 0.02, -(v.upDip ?? 0.16) + height, 0.14];
      const E: V3 = [-sgn * (v.upIn ?? 0.1), (v.upTop ?? 0.08) + height, v.upFwd ?? 0.24];
      const rel = t >= tOut ? lerp3(G, E, k) : tau < LOAD ? lerp3(G, D, legA) : lerp3(D, E, legB);
      return { rel, pole: [sgn * 0.3, -1, 0.35] };
    },
  };
}

/** A strike from the guard and back: out along its path, a beat at the end, home. */
export function blowItem(fb: FightBody, name: ScriptBlow, rng: Rng, hand?: FightHand, v?: StrikeVariant): ScriptItem {
  return comboItem(fb, [name], rng, [], hand ? [hand] : undefined, v ? [v] : undefined);
}

/**
 * A straight thrown from a CHAMBER and back to it (karate's reverse punch from the hip, a fist at the ribs, a rear hand
 * cocked behind the shoulder): the hand held there `pre` s, driven out at the camera, a beat, home to the chamber, held.
 * The other hand keeps the guard.
 */
export function chamberItem(fb: FightBody, hand: FightHand, from: 'hip' | 'rib' | 'cocked', rng: Rng, v: StrikeVariant = {}, pre = 0.5, post = 0.4): ScriptItem {
  const tr = strikeTrack(fb, other(fb.lead) === hand ? 'cross' : 'jab', rng, hand, { ...v, from });
  const C = chamberRel(from, hand), poleC: V3 = [side(hand) * 0.3, -1, -1];
  const pose = (t: number): Joints => {
    const s = t - pre, yaw = tr.yaw(s);
    const body = fb.pose({ yawDeg: yaw });
    const a = s >= 0 && s <= tr.dur ? tr.at(s, body) : { rel: C, pole: poleC };
    return fb.pose({ yawDeg: yaw, arms: { [hand]: a } });
  };
  return { sec: pre + tr.dur + post, pose, labels: [{ kind: 'blow', cls: tr.name, hand, from: pre, to: pre + tr.tOut + tr.tHold }] };
}

/**
 * A combination: strikes started `gaps` s apart (onset to onset; a real 1-2 is 0.25–0.4 s), each arm following its latest
 * strike, the torso's turn the sum of theirs. The same hand twice (a double jab) starts no earlier than its last strike's
 * way back is under way.
 */
export function comboItem(fb: FightBody, names: ScriptBlow[], rng: Rng, gaps: number[], hands?: FightHand[], variants?: StrikeVariant[]): ScriptItem {
  const tracks: { s: number; tr: StrikeTrack }[] = [];
  let s = 0;
  names.forEach((n, i) => {
    const tr = strikeTrack(fb, n, rng, hands?.[i], variants?.[i]);
    if (i > 0) s += gaps[i - 1] ?? 0.32;
    const prev = [...tracks].reverse().find((x) => x.tr.hand === tr.hand);
    if (prev) s = Math.max(s, prev.s + prev.tr.tOut + prev.tr.tHold + 0.12);
    tracks.push({ s, tr });
  });
  const sec = Math.max(...tracks.map((x) => x.s + x.tr.dur));
  const pose = (t: number): Joints => {
    const yaw = tracks.reduce((a, x) => a + x.tr.yaw(t - x.s), 0);
    const drop = tracks.reduce((a, x) => a + x.tr.drop(t - x.s), 0);
    const body = fb.pose({ yawDeg: yaw, drop });
    const arms: Partial<Record<FightHand, ArmPose>> = {};
    for (const h of ['L', 'R'] as FightHand[]) {
      const live = tracks.filter((x) => x.tr.hand === h && t >= x.s).pop();
      if (live && t - live.s <= live.tr.dur) arms[h] = live.tr.at(t - live.s, body);
    }
    return fb.pose({ yawDeg: yaw, drop, arms });
  };
  return { sec, pose, labels: tracks.map((x) => ({ kind: 'blow' as const, cls: x.tr.name, hand: x.tr.hand, from: x.s, to: x.s + x.tr.tOut + x.tr.tHold })) };
}

/** A kick with `foot`: the knee chambered, the leg driven out (front: at the camera; round: an arc across the front at hip
 *  height with the hips turned through it), back to the chamber and down. */
export function kickItem(fb: FightBody, form: ScriptKick, rng: Rng, foot?: FightHand): ScriptItem {
  const f: FightHand = foot ?? (form === 'front' ? fb.lead : other(fb.lead));
  const sgn = side(f);
  const tCh = jit(rng, 0.2, 0.2), tEx = jit(rng, 0.13, 0.2), tRe = jit(rng, 0.16, 0.2), tDn = jit(rng, 0.22, 0.2);
  const hipH = 0.95 - fb.crouch;
  const hi = jit(rng, 1, 0.12);
  const turnMax = form === 'round' ? sgn * jit(rng, 55, 0.15) : 0;   // the kicking hip comes round: + turns the left shoulder away
  const pose = (t: number): Joints => {
    const A0 = fb.foot[f];
    let A: V3, turn = 0;
    const ch: V3 = form === 'front' ? [sgn * 0.1, hipH - 0.45, 0.28] : [sgn * 0.42, hipH - 0.25, 0.05];
    const ex: V3 = form === 'front' ? [sgn * 0.06, hipH - 0.05 * hi, 0.78] : [-sgn * 0.02, hipH + 0.05 * hi, 0.72];
    if (t < tCh) { const u = minJerk(t / tCh); A = lerp3(A0, ch, u); turn = turnMax * u * 0.6; }
    else if (t < tCh + tEx) { const u = minJerk((t - tCh) / tEx); A = form === 'front' ? lerp3(ch, ex, u) : arc(ch, ex, u); turn = turnMax * (0.6 + 0.4 * u); }
    else if (t < tCh + tEx + tRe) { const u = minJerk((t - tCh - tEx) / tRe); A = lerp3(ex, ch, u); turn = turnMax * (1 - 0.4 * u); }
    else { const u = minJerk((t - tCh - tEx - tRe) / tDn); A = lerp3(ch, A0, u); turn = turnMax * 0.6 * (1 - u); }
    const pole: V3 = form === 'front' ? [0, 1, 1] : [sgn * 0.6, 1, 0.4];
    return fb.pose({ yawDeg: turn, pitchDeg: form === 'front' ? -6 : -4, kick: { foot: f, ankle: A, pole } });
  };
  // a round kick's sweep: out at the side, round through the front at hip height
  function arc(a: V3, b: V3, u: number): V3 {
    const c: V3 = [sgn * 0.3, (a[1] + b[1]) / 2 + 0.05, 0.6];
    return add(add(mul(a, (1 - u) * (1 - u)), mul(c, 2 * u * (1 - u))), mul(b, u * u));
  }
  return { sec: tCh + tEx + tRe + tDn, pose, labels: [{ kind: 'legKick', cls: form, hand: f, from: 0, to: tCh + tEx }] };
}

/** How a guard is raised or dropped (guardItem): by default from (to) the hands hanging at rest, the right hand a few
 *  hundredths behind the left. */
export interface GuardOptions {
  /** The guard's down position is a LOW guard: the fists in front of the chest this far under the shoulder line (m). */
  lowY?: number;
  /** The second hand's lag behind the first (s): a raise one hand after the other (the review, 2026-09-26: 0.1–0.3 s). */
  lag?: number;
  /** The hand that moves first. */
  first?: FightHand;
  /** Each hand's move (s). */
  tMove?: number;
}

/** The guard raised from hands down (and held for `hold` s), or dropped from the guard. */
export function guardItem(fb: FightBody, dir: 'raise' | 'drop', rng: Rng, hold = 0.4, o: GuardOptions = {}): ScriptItem {
  const tMove0 = jit(rng, 0.28, 0.25), lagR = jit(rng, 0.04, 0.8);
  const tMove = o.tMove ?? tMove0, lag = o.lag ?? lagR, first = o.first ?? 'L';
  const pose = (t: number): Joints => {
    const armOf = (h: FightHand, lagH: number): ArmPose => {
      const guard = fb.base;
      const u0 = minJerk((t - lagH) / tMove), u = dir === 'raise' ? u0 : 1 - u0;
      const relG = fb.guardRel(guard, h);
      let down: ArmPose;
      if (o.lowY !== undefined) down = fb.lowGuardRel(guard, h, o.lowY);
      else {
        const rest = fb.pose({ arms: { L: 'rest', R: 'rest' } }), s = J(h);
        down = { rel: sub(rest[`${s}Hand`], rest[`${s}Arm`]), pole: [side(h) * 0.2, -1, -0.4] };
      }
      return { rel: lerp3(down.rel, relG, u), pole: lerp3(down.pole, fb.guardPole(h), u) };
    };
    const arms: Partial<Record<FightHand, ArmPose>> = {};
    arms[first] = armOf(first, 0); arms[other(first)] = armOf(other(first), lag);
    return fb.pose({ arms });
  };
  return { sec: tMove + lag + hold, pose, labels: [{ kind: 'guard', cls: dir, from: 0, to: tMove + lag }] };
}

// ── gestures that are not strikes (negatives: the review, 2026-09-26) ─────────────────────────────────────────────────
/** A relaxed stand for the gestures: square, upright, the feet under the hips. */
export const standBody = (): FightBody => new FightBody('L', { crouch: 0.02, bladeDeg: 0, stagger: 0.04, width: 0.3 });
/** The arms at room targets on a posed body (the shoulders do not depend on the arms). */
function armsAt(fb: FightBody, p: FightParams, targets: Partial<Record<FightHand, { at: V3; pole: V3 }>>): Joints {
  const body = fb.pose(p), arms: Partial<Record<FightHand, ArmPose>> = {};
  for (const h of ['L', 'R'] as FightHand[]) { const x = targets[h]; if (x) arms[h] = { rel: sub(x.at, body[`${J(h)}Arm`]), pole: x.pole }; }
  return fb.pose({ ...p, arms: { L: 'rest', R: 'rest', ...arms } });
}

/** Clapping in front of the body: `n` claps at 2–2.5 Hz, the hands 0.2–0.3 m apart at the widest, closing fast (a hand
 *  peaks ~2–3 m/s), chest to chin height. Raised from the sides first and let down after. */
export function clapItem(fb: FightBody, n: number, rng: Rng): ScriptItem {
  const U = (a: number, b: number) => a + (b - a) * rng();
  const hz = U(2, 2.5), open = U(0.2, 0.3), close = U(0.09, 0.15), y = U(-0.2, -0.02), z = U(0.26, 0.36), rise = 0.45;
  const per = 1 / hz, sec = rise * 2 + n * per;
  const pose = (t: number): Joints => {
    const b = fb.pose({}), sh = mul(add(b.LeftArm, b.RightArm), 0.5);
    const mid: V3 = [sh[0], sh[1] + y, sh[2] + z];
    const sepOf = (tc: number) => { const ph = tc - Math.floor(tc / per) * per; return ph < close ? 0.05 + (open - 0.05) * (1 - minJerk(ph / close)) : 0.05 + (open - 0.05) * minJerk((ph - close) / (per - close)); };
    if (t < rise || t > sec - rise) {
      // the hands come up from the sides to the open position (and go back down)
      const u = t < rise ? minJerk(t / rise) : 1 - minJerk((t - (sec - rise)) / rise), rest = fb.pose({ arms: { L: 'rest', R: 'rest' } });
      const at = (h: FightHand): V3 => lerp3(rest[`${J(h)}Hand`], add(mid, [side(h) * open / 2, 0, 0]), u);
      return armsAt(fb, {}, { L: { at: at('L'), pole: [0.4, -1, -0.3] }, R: { at: at('R'), pole: [-0.4, -1, -0.3] } });
    }
    const s = sepOf(t - rise);
    return armsAt(fb, {}, { L: { at: add(mid, [s / 2, 0, 0]), pole: [0.5, -1, -0.2] }, R: { at: add(mid, [-s / 2, 0, 0]), pole: [-0.5, -1, -0.2] } });
  };
  return { sec, pose, labels: [] };
}

/** A wave in FRONT of the face (at the screen): one hand up 0–0.2 m over its shoulder, in front of the face, swept side to
 *  side ±0.1–0.15 m at 2.5–3.2 Hz, the other arm hanging. Raised first and let down after. */
export function frontWaveItem(fb: FightBody, sec: number, rng: Rng, hand: FightHand): ScriptItem {
  const U = (a: number, b: number) => a + (b - a) * rng();
  const hz = U(2.5, 3.2), amp = U(0.1, 0.15), y = U(0, 0.2), z = U(0.22, 0.36), ph = rng() * Math.PI * 2, rise = 0.5;
  const pose = (t: number): Joints => {
    const b = fb.pose({}), S = b[`${J(hand)}Arm`], nose = b.Head;
    const c: V3 = [nose[0], S[1] + y, S[2] + z];
    const w = t < rise || t > sec - rise ? 0 : Math.sin(2 * Math.PI * hz * (t - rise) + ph) * Math.min(1, (t - rise) / 0.15, (sec - rise - t) / 0.15);
    const at0 = add(c, [amp * w, 0, 0]);
    const u = t < rise ? minJerk(t / rise) : t > sec - rise ? 1 - minJerk((t - (sec - rise)) / rise) : 1;
    const rest = fb.pose({ arms: { L: 'rest', R: 'rest' } });
    return armsAt(fb, {}, { [hand]: { at: lerp3(rest[`${J(hand)}Hand`], at0, u), pole: [side(hand) * 0.6, -1, -0.2] } });
  };
  return { sec, pose, labels: [] };
}

/** Arm swings (a warm-up): both arms straight, swung forward and back at the sides ±50–60° at 0.8–1 Hz, together or
 *  opposite. */
export function armSwingItem(fb: FightBody, sec: number, rng: Rng, phase: 'together' | 'opposite'): ScriptItem {
  const U = (a: number, b: number) => a + (b - a) * rng();
  const hz = U(0.8, 1.0), amp = (U(50, 60) * Math.PI) / 180, ph = rng() * Math.PI * 2;
  const pose = (t: number): Joints => {
    const ramp = Math.min(1, t / 0.6, (sec - t) / 0.6);
    const arms: Partial<Record<FightHand, ArmPose>> = {};
    for (const h of ['L', 'R'] as FightHand[]) {
      const th = amp * ramp * Math.sin(2 * Math.PI * hz * t + ph + (phase === 'opposite' && h === 'R' ? Math.PI : 0));
      const l = (fb.arm[h].l1 + fb.arm[h].l2) * 0.99;
      arms[h] = { rel: [side(h) * 0.05, -l * Math.cos(th), l * Math.sin(th)], pole: [side(h) * 0.2, 0, -1] };
    }
    return fb.pose({ arms });
  };
  return { sec, pose, labels: [] };
}

/** A slip to `to` (the head off the line, the hips kept) or a duck (under it): in, a beat, back. */
export function evadeItem(fb: FightBody, form: 'slip' | 'duck', rng: Rng, to: FightHand = 'L'): ScriptItem {
  const tIn = jit(rng, form === 'slip' ? 0.2 : 0.24, 0.2), tHold = jit(rng, 0.12, 0.3), tOut = jit(rng, 0.3, 0.2);
  const roll = side(to) * jit(rng, 16, 0.15), bend = jit(rng, 22, 0.2), drop = jit(rng, 0.16, 0.2);
  const pose = (t: number): Joints => {
    const u = t < tIn ? minJerk(t / tIn) : t < tIn + tHold ? 1 : 1 - minJerk((t - tIn - tHold) / tOut);
    return form === 'slip'
      ? fb.pose({ rollDeg: roll * u, drop: 0.03 * u, yawDeg: -side(to) * 6 * u })
      : fb.pose({ pitchDeg: bend * u, drop: drop * u });
  };
  return { sec: tIn + tHold + tOut, pose, labels: [{ kind: 'evade', cls: form, hand: form === 'slip' ? to : undefined, from: 0, to: tIn }] };
}

/** A step: in (toward the camera) and out move the lead foot first / the rear foot first; left / right the foot on that
 *  side first; the other follows, the hips carried between them. Ends in the stance `dist` m away (shift it on). */
export function stepItem(fb: FightBody, dir: 'in' | 'out' | 'left' | 'right', rng: Rng, from: V3 = [0, 0, 0], dist?: number): { item: ScriptItem; end: V3 } {
  const d = dist ?? jit(rng, 0.3, 0.15);
  const v: V3 = dir === 'in' ? [0, 0, d] : dir === 'out' ? [0, 0, -d] : dir === 'left' ? [d, 0, 0] : [-d, 0, 0];
  const first: FightHand = dir === 'in' ? fb.lead : dir === 'out' ? other(fb.lead) : dir === 'left' ? 'L' : 'R';
  const second = other(first);
  const t1 = jit(rng, 0.22, 0.15), t2 = jit(rng, 0.22, 0.15), lift = jit(rng, 0.06, 0.25);
  const end = add(from, v);
  const pose = (t: number): Joints => {
    const u1 = minJerk(t / t1), u2 = minJerk((t - t1) / t2);
    const hips = add(from, mul(v, 0.5 * u1 + 0.5 * u2));
    const footAt = (h: FightHand, u: number): V3 => { const p = lerp3(add(fb.foot[h], from), add(fb.foot[h], end), u); return [p[0], p[1] + lift * Math.sin(Math.PI * clamp01(u)), p[2]]; };
    return fb.pose({ shift: hips, feet: { [first]: footAt(first, u1), [second]: footAt(second, u2) } });
  };
  return { item: { sec: t1 + t2, pose, labels: [{ kind: 'fightStep', cls: dir, hand: first, from: 0, to: t1 + t2 }] }, end };
}

/** A quarter-turn (or more) on the lead foot and back: a spin's start. */
export function turnItem(fb: FightBody, deg: number, rng: Rng): ScriptItem {
  const tIn = jit(rng, 0.28, 0.2), tHold = 0.1, tOut = jit(rng, 0.35, 0.2);
  return {
    sec: tIn + tHold + tOut, labels: [{ kind: 'turn', cls: 'turn', from: 0, to: tIn }],
    pose: (t) => fb.pose({ spinDeg: deg * (t < tIn ? minJerk(t / tIn) : t < tIn + tHold ? 1 : 1 - minJerk((t - tIn - tHold) / tOut)) }),
  };
}

/** The items one after another at `fps`, their labels on the take's clock (s). Items carry their own shift (a step's). */
export function fightScript(items: ScriptItem[], fps = 120): { clip: JointClip; labels: ScriptLabel[] } {
  const beats: Beat[] = items.map((it) => [it.sec, it.pose]);
  const labels: ScriptLabel[] = [];
  let t0 = 0;
  for (const it of items) { for (const l of it.labels) labels.push({ ...l, from: t0 + l.from, to: t0 + l.to }); t0 += it.sec; }
  const dur = beats.reduce((a, b) => a + b[0], 0), frames: Joints[] = [];
  for (let k = 0; k <= Math.round(dur * fps); k++) {
    let t = k / fps, i = 0;
    while (i < beats.length - 1 && t > beats[i][0]) { t -= beats[i][0]; i++; }
    frames.push(beats[i][1](Math.min(t, beats[i][0])));
  }
  return { clip: { fps, frames }, labels };
}

/** The body mirrored: Left* ↔ Right* swapped and x negated (a southpaw from an orthodox take; the subject's left stays on
 *  +X, so synthesize()'s handedness check still holds). */
export function mirrorJoints(j: Joints): Joints {
  const out = {} as Joints;
  for (const k of Object.keys(j) as (keyof Joints)[]) {
    const m = (k.startsWith('Left') ? k.replace('Left', 'Right') : k.startsWith('Right') ? k.replace('Right', 'Left') : k) as keyof Joints;
    const p = j[k];
    out[m] = [-p[0], p[1], p[2]];
  }
  return out;
}
export const mirrorClip = (c: JointClip): JointClip => ({ ...c, frames: c.frames.map(mirrorJoints) });

export { mulberry32 };
