// rideStreams — the labelled streams the ride read is gated on (movement play P8, 2026-09-26): the plan's label set
// (PLAN-P8 §8.1) as scripted bodies (lib/pose/rideKit) and the real CMU windows committed under __fixtures__/ride, each
// with its labels, rebuilt under any camera condition (fps, latency, noise, drops, the label flip) for the gate
// (lib/pose/rideGate.test.ts) and the report (scripts/body/ride.mts → p8/RIDE.md).
//
// LABELS ARE NEVER CIRCULAR (§8.2). A scripted stream's classes and windows are its own script's (labeller 'scripted'):
// the beat that tipped the body onto its toes IS the toe lean. The instants the latency is measured from come from the
// clean joints, the way synth.ts's ground truth is always computed (the carve's onset when the clean hips-over-feet
// offset on the body's normal leaves ±1 cm; the quarter when the clean shoulders pass 70° off the stance). A CMU window's
// class and window are the EYE's (labeller 'eye': each take sheeted with scripts/mocap/stream-sheet.mts, R-F6).
//
// Every board stream opens the way a player does (PLAN-P8 §3.2's READY): facing the camera for the space check's still
// stand (the reader calibrates on it), a turn into the stance, and a still hold that takes it.
//
// Pure: no DOM, no fs (the fixtures are passed in), deterministic for a seed.
import { restPose, synthesize, sampleClip, DEFAULT_NOISE, bodyAxes, type JointClip, type Joints, type V3, type Synthesized } from './synth';
import { CARVE_ON, QUARTER_DEG, GRAB_ON_M } from './rideReader';
import { WHEEL_ON_DEG, BANK_ON_DEG } from '../input/bodyFloor';
import { script, hold, jumpBeat, crouch, dropout, turnBody, type Beat } from './streamKit';
import {
  stanceBase, inStance, edgeTilt, noseTailTilt, grabHopBeat, tuckHopBeat, turnBeat, turnHopBeat, turnAbout, kickPushBeat,
  wheelArms, wingArms, waveBeat, stretchBeat, swayBeat, runBeat, labelFlipWhenAway, lerpJoints, type Lead,
} from './rideKit';
import type { PoseFrame } from './landmarks';

export type RideControl =
  | 'carve' | 'crouch' | 'pop' | 'grab' | 'quarter' | 'push' | 'trim'
  | 'wheel' | 'grip' | 'hopTurn' | 'bank' | 'pitch' | 'spread' | 'stride' | 'highKnees' | 'dip';

/** A labelled positive: `control` should answer in [from, to] (capture ms) with this sign (and name, for a grab / spin). */
export interface RideSeg {
  control: RideControl;
  from: number;
  to: number;
  /** +1 / −1 for a signed control (carve + toe, wheel + right, bank + right, pitch + up, trim + climb). */
  sign?: 1 | -1;
  /** The size class (a lean's degrees, a wheel's angle, a turn's degrees, a cadence's Hz). */
  level?: number;
  /** A grab's hand and edge; a quarter's direction. */
  hand?: 'lead' | 'rear';
  edge?: 'toe' | 'heel';
  dir?: 'fs' | 'bs';
  /** The truth instant (capture ms) latency is measured from: the clean joints' onset (withTruth fills it). */
  onset?: number;
  /** …and the instant the clean joints reach the control's own engage line (a perfect reader could answer no sooner). */
  engage?: number;
}

export type RideFamily = 'board' | 'facing';
export interface RideStream {
  name: string;
  family: RideFamily;
  /** Which gate the stream is for (a negative stream grades 'nothing fires'). */
  kind: 'positive' | 'negative';
  labeller: 'scripted' | 'eye';
  stance: { theta: number; lead: Lead } | 'square' | 'facing';
  clip: JointClip;
  segs: RideSeg[];
  /** Capture ms from which the stream is graded (the stance taken; the calibration done). */
  gradeFrom: number;
  /** Windows (capture ms) excluded from the negative grading of the named controls (e.g. the crouch's own trigger). */
  allow?: Partial<Record<RideControl, [number, number][]>>;
  marks: Record<string, number>;
  /** Scripted dropouts (capture ms): the body gone from the camera (shoot applies them; longer than LOST_MS is a 'lost'). */
  gaps?: [number, number][];
}

const R0 = restPose();
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Beats with names → the clip, the beat starts (ms) and the stream's end. */
function scripted(beats: [string, Beat][]): { clip: JointClip; marks: Record<string, number>; at: (name: string, k?: number) => number } {
  const marks: Record<string, number> = {};
  const starts: { name: string; t: number }[] = [];
  let t = 0;
  for (const [n, b] of beats) { starts.push({ name: n, t }); marks[n] ??= t; t += b[0] * 1000; }
  marks.end = t;
  return {
    clip: script(beats.map((b) => b[1])), marks,
    at: (name, k = 0) => starts.filter((s) => s.name === name)[k]?.t ?? NaN,
  };
}

// ── the board streams ────────────────────────────────────────────────────────────────────────────────────────────

/** The opening every board stream shares: the facing stand (calibration), the turn into the stance, the still hold. */
const FACE_SEC = 1.6, TURN_SEC = 0.5, TAKE_SEC = 1.3;
function openStance(st: Joints): [string, Beat][] {
  return [['face', hold(R0, FACE_SEC)], ['turnIn', [TURN_SEC, (t) => lerpJoints(R0, st, ease(t / TURN_SEC))]], ['take', hold(st, TAKE_SEC)]];
}
const TAKE_END = (FACE_SEC + TURN_SEC + TAKE_SEC) * 1000;
type StanceArg = { theta: number; lead: Lead };
const tag = (s: StanceArg) => `${s.lead === 'L' ? 'reg' : 'goofy'}${s.theta}`;

/** A board body: a facing pose turned into the stance (θ, lead). */
const turned = (s: StanceArg) => (j: Joints) => inStance(j, s.theta, s.lead);

export function leanStream(s: StanceArg, deg: number): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const beats: [string, Beat][] = [...openStance(st)];
  for (const [nm, d] of [['toe', deg], ['heel', -deg]] as const) {
    beats.push([`${nm}In`, [0.3, (t) => edgeTilt(st, d * ease(t / 0.3))]], [nm, hold(edgeTilt(st, d), 1.3)], [`${nm}Out`, [0.3, (t) => edgeTilt(st, d * (1 - ease(t / 0.3)))]], ['rest', hold(st, 0.9)]);
  }
  const k = scripted(beats);
  return {
    name: `lean ${deg}° ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    // the sign is the STICK's: toe is a right turn for a left lead (regular), a left turn for a right lead (goofy)
    segs: [
      { control: 'carve', from: k.at('toeIn'), to: k.at('toeOut') + 300, sign: s.lead === 'L' ? 1 : -1, level: deg },
      { control: 'carve', from: k.at('heelIn'), to: k.at('heelOut') + 300, sign: s.lead === 'L' ? -1 : 1, level: deg },
    ],
  };
}

export function noseTailStream(s: StanceArg, deg: number): RideStream {
  const st = inStance(stanceBase(), s.theta, s.lead);
  const beats: [string, Beat][] = [...openStance(st)];
  for (const [nm, d] of [['nose', deg], ['tail', -deg]] as const) {
    beats.push([`${nm}In`, [0.3, (t) => noseTailTilt(st, d * ease(t / 0.3))]], [nm, hold(noseTailTilt(st, d), 1.3)], [`${nm}Out`, [0.3, (t) => noseTailTilt(st, d * (1 - ease(t / 0.3)))]], ['rest', hold(st, 0.9)]);
  }
  const k = scripted(beats);
  return { name: `nose/tail ${deg}° ${tag(s)}`, family: 'board', kind: 'negative', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END, segs: [] };
}

export function restStream(s: StanceArg | 'facing', sway = false, sec = 6): RideStream {
  const st = s === 'facing' ? R0 : inStance(stanceBase(), s.theta, s.lead);
  const beats: [string, Beat][] = s === 'facing' ? [['face', hold(R0, FACE_SEC + 0.8)]] : [...openStance(st)];
  beats.push(['rest', sway ? swayBeat(st, sec) : hold(st, sec)]);
  const k = scripted(beats);
  return {
    name: `${sway ? 'idle sway' : 'stand still'} ${s === 'facing' ? 'facing' : tag(s)}`, family: s === 'facing' ? 'facing' : 'board', kind: 'negative',
    labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: s === 'facing' ? (FACE_SEC + 0.8) * 1000 : TAKE_END, segs: [],
  };
}

export function crouchStream(s: StanceArg, cm: number): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead), low = inStance(crouch(base, cm / 100), s.theta, s.lead);
  const k = scripted([...openStance(st), ['down', [0.4, (t) => lerpJoints(st, low, ease(t / 0.4))]], ['low', hold(low, 0.6)], ['up', [0.4, (t) => lerpJoints(low, st, ease(t / 0.4))]], ['rest', hold(st, 1.5)]]);
  return {
    name: `crouch ${cm} cm ${tag(s)}`, family: 'board', kind: 'negative', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END, segs: [],
    allow: { crouch: [[k.at('down'), k.at('rest') + 1200]] },
  };
}

export function hopStream(s: StanceArg, v0: number): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const hop = jumpBeat(base, v0, 0.25);
  const k = scripted([...openStance(st), ['hop', [hop[0], (t) => inStance(hop[1](t), s.theta, s.lead)]], ['rest', hold(st, 1.2)]]);
  return {
    name: `hop v0 ${v0} ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    segs: [{ control: 'pop', from: k.at('hop'), to: k.at('rest') + 400 }],
    allow: { crouch: [[k.at('hop'), k.at('rest') + 1200]] },
  };
}

/** A hop with a hand at the board's edge in its flight (hand: the rider's lead / rear; SCRIPTED — no capture exists). */
export function grabStream(s: StanceArg, hand: 'lead' | 'rear', edge: 'toe' | 'heel', depth = 0.12, v0 = 2.8): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const joint: 'Left' | 'Right' = (hand === 'lead') === (s.lead === 'L') ? 'Left' : 'Right';
  const g = grabHopBeat(base, v0, joint, edge, depth, turned(s));
  const k = scripted([...openStance(st), ['grab', g], ['rest', hold(st, 1.2)]]);
  return {
    name: `grab ${hand} ${edge} ${Math.round(depth * 100)} cm ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s, clip: k.clip,
    marks: k.marks, gradeFrom: TAKE_END, segs: [{ control: 'grab', from: k.at('grab'), to: k.at('rest') + 300, hand, edge }, { control: 'pop', from: k.at('grab'), to: k.at('rest') + 400 }],
    allow: { crouch: [[k.at('grab'), k.at('rest') + 1200]] },
  };
}

/** The tuck with both hands AT the knees (not below): a crouch in the air, never a grab (G4's negative). */
export function tuckStream(s: StanceArg): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const k = scripted([...openStance(st), ['tuck', tuckHopBeat(base, 2.8, turned(s))], ['rest', hold(st, 1.2)]]);
  return {
    name: `tuck hop, hands at the knees ${tag(s)}`, family: 'board', kind: 'negative', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    segs: [{ control: 'pop', from: k.at('tuck'), to: k.at('rest') + 400 }],
    allow: { crouch: [[k.at('tuck'), k.at('rest') + 1200]] },
  };
}

/**
 * A quarter-turn of the shoulders from the stance: frontside (the chest opened to the lens) or backside, `deg`, on the
 * ground or in a hop. A turn under QUARTER_DEG is a negative (G5: 45° → 0). `early` (s, a hop only): the turn starts that
 * long before the take-off, in the push, as real riders start it (rideKit.turnHopBeat; the review fix's surf case).
 */
export function quarterStream(s: StanceArg, dir: 'fs' | 'bs', deg: number, hop = false, early = 0): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  // turnBody's sign: + = the left shoulder away. A regular rider opens (fs) by turning the left shoulder away (+).
  const sgn = (dir === 'fs') === (s.lead === 'L') ? 1 : -1;
  const beat: Beat = hop ? turnHopBeat(base, 2.8, sgn * deg, turned(s), false, early) : turnBeat(st, sgn * deg, 0.3, 0.4, 0.4);
  const k = scripted([...openStance(st), ['turn', beat], ['rest', hold(st, 1.2)]]);
  const positive = deg >= 90;
  return {
    name: `quarter ${dir} ${deg}°${hop ? ` hop${early > 0 ? ' early' : ''}` : ''} ${tag(s)}`, family: 'board', kind: positive ? 'positive' : 'negative', labeller: 'scripted', stance: s,
    clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    segs: [
      ...(positive ? [{ control: 'quarter' as const, from: k.at('turn'), to: k.at('turn') + 900, dir, level: deg }] : []),
      ...(hop ? [{ control: 'pop' as const, from: k.at('turn'), to: k.at('rest') + 400 }] : []),
    ],
    allow: hop ? { crouch: [[k.at('turn'), k.at('rest') + 1200]] } : {},
  };
}

/**
 * THE STANCE KEPT (review fix, 2026-09-26): the stance taken, a `gapMs` dropout (the body gone past LOST_MS: a 'lost') while
 * the rider goes onto an edge of `deg` (+ toe, − heel) and holds it 1.5 s after coming back, then the true stance for 5 s. The
 * first build re-took the stance off the held edge and steered the whole rest after it the other way (0.4–0.55, in every
 * measured cell); the rest must read 0.
 */
export function dropoutEdgeStream(s: StanceArg, deg: number, gapMs = 450): RideStream {
  const st = inStance(stanceBase(), s.theta, s.lead), e = edgeTilt(st, deg);
  const k = scripted([...openStance(st), ['ride', hold(st, 1.5)], ['gap', [gapMs / 1000, (t) => lerpJoints(st, e, ease(t / Math.min(0.3, gapMs / 1000)))]],
    ['edge', hold(e, 1.5)], ['out', [0.3, (t) => lerpJoints(e, st, ease(t / 0.3))]], ['rest', hold(st, 5)]]);
  const toe = deg > 0;
  return {
    name: `dropout ${gapMs} ms, then a held ${toe ? 'toe' : 'heel'} edge ${Math.abs(deg)}° ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s,
    clip: k.clip, marks: k.marks, gradeFrom: TAKE_END, gaps: [[k.at('gap'), k.at('gap') + gapMs]],
    segs: [{ control: 'carve', from: k.at('edge'), to: k.at('out') + 300, sign: (toe === (s.lead === 'L') ? 1 : -1) as 1 | -1, level: Math.abs(deg) }],
  };
}

/**
 * SQUARED UP (review fix, 2026-09-26): the stance taken, then the rider squares up `sq`° toward the screen over 1.5 s (still
 * side-on, the same lead) and holds 2.5 s, then a 90° hop turn `dir` from there, then a 12° nose shift and a 12° tail shift at
 * the squared angle. The first build's follow stopped at 15° and nothing re-took the axes: from 22°+ no quarter fired either
 * way, and the nose / tail shift steered off the old normal.
 */
export function squareUpStream(s: StanceArg, sq: number, dir: 'fs' | 'bs'): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  // toward the lens: a regular rider's yaw is −θ, so + (turnBody's sign) for a left lead
  const toward = (s.lead === 'L' ? 1 : -1) * sq;
  const sqd = turnAbout(st, toward);
  const sgn = (dir === 'fs') === (s.lead === 'L') ? 1 : -1;
  const k = scripted([...openStance(st), ['ride', hold(st, 1.0)], ['square', [1.5, (t) => turnAbout(st, toward * ease(t / 1.5))]], ['held', hold(sqd, 2.5)],
    ['turn', turnHopBeat(base, 2.8, sgn * 90, (j) => turnAbout(inStance(j, s.theta, s.lead), toward))], ['rest', hold(sqd, 1.5)],
    ['noseIn', [0.3, (t) => noseTailTilt(sqd, 12 * ease(t / 0.3))]], ['nose', hold(noseTailTilt(sqd, 12), 1.3)], ['noseOut', [0.3, (t) => noseTailTilt(sqd, 12 * (1 - ease(t / 0.3)))]],
    ['tailIn', [0.3, (t) => noseTailTilt(sqd, -12 * ease(t / 0.3))]], ['tail', hold(noseTailTilt(sqd, -12), 1.3)], ['tailOut', [0.3, (t) => noseTailTilt(sqd, -12 * (1 - ease(t / 0.3)))]],
    ['rest2', hold(sqd, 1.0)]]);
  return {
    name: `squared up ${sq}°, then a ${dir} 90° hop turn and a nose / tail shift ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s,
    clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    segs: [{ control: 'quarter', from: k.at('turn'), to: k.at('turn') + 900, dir, level: 90 }, { control: 'pop', from: k.at('turn'), to: k.at('rest') + 400 }],
    allow: { crouch: [[k.at('turn'), k.at('rest') + 1200]] },
  };
}

/** A kick-push with the rear foot, the lead planted. */
export function pushStream(s: StanceArg, n = 2): RideStream {
  const base = stanceBase();
  const st = inStance(base, s.theta, s.lead);
  const push = kickPushBeat(base, s.lead);
  const beats: [string, Beat][] = [...openStance(st)];
  for (let i = 0; i < n; i++) beats.push(['push', [push[0], (t) => inStance(push[1](t), s.theta, s.lead)]], ['roll', hold(st, 0.8)]);
  const k = scripted(beats);
  return {
    name: `kick-push ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END,
    segs: Array.from({ length: n }, (_, i) => ({ control: 'push' as const, from: k.at('push', i), to: k.at('roll', i) + 300 })),
  };
}

/** The head turned to look at the screen (the shoulders still), and a small shoulder check (30°): no quarter, no carve. */
export function lookStream(s: StanceArg): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const head = (j: Joints, deg: number): Joints => {
    const o = { ...j }, pv = j.Neck, a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const r = (p: V3): V3 => { const x = p[0] - pv[0], z = p[2] - pv[2]; return [pv[0] + x * c + z * sn, p[1], pv[2] - x * sn + z * c]; };
    o.Head = r(j.Head);
    return o;
  };
  const toCam = s.lead === 'L' ? 45 : -45;
  const k = scripted([...openStance(st), ['look', [1.2, (t) => head(st, toCam * Math.sin(Math.PI * Math.min(1, t / 1.2)))]], ['rest', hold(st, 0.6)], ['check', turnBeat(st, (s.lead === 'L' ? 1 : -1) * 30)], ['rest2', hold(st, 1.2)]]);
  return { name: `head turn + shoulder check ${tag(s)}`, family: 'board', kind: 'negative', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END, segs: [] };
}

// ── the facing streams (the kart, the plane, the runs; the negatives) ────────────────────────────────────────────

const FACE_END = FACE_SEC * 1000;
function facing(beats: [string, Beat][]) { return scripted([['face', hold(R0, FACE_SEC)], ...beats]); }

/** The wheel gripped, turned to each side at `deg`, back to centre; then let go (arms down). */
export function wheelStream(deg: number, hop = false): RideStream {
  const g0 = wheelArms(R0, 0);
  const beats: [string, Beat][] = [['grip', [0.5, (t) => wheelArms(R0, 0, ease(t / 0.5))]], ['centre', hold(g0, 1.0)]];
  for (const [nm, d] of [['right', deg], ['left', -deg]] as const) {
    beats.push([`${nm}In`, [0.35, (t) => wheelArms(R0, d * ease(t / 0.35))]]);
    if (hop) { const J = jumpBeat(wheelArms(R0, d), 2.4, 0.2); beats.push([nm, [J[0] + 0.3, (t) => (t < J[0] ? wheelArms(J[1](t), d) : wheelArms(R0, d))]]); }
    else beats.push([nm, hold(wheelArms(R0, d), 1.3)]);
    beats.push([`${nm}Out`, [0.35, (t) => wheelArms(R0, d * (1 - ease(t / 0.35)))]], ['centre2', hold(g0, 0.8)]);
  }
  beats.push(['letGo', [0.5, (t) => wheelArms(R0, 0, 1 - ease(t / 0.5))]], ['down', hold(R0, 1.2)]);
  const k = facing(beats);
  const segs: RideSeg[] = [
    { control: 'grip', from: k.at('grip') + 500, to: k.at('letGo') },
    { control: 'wheel', from: k.at('rightIn'), to: k.at('rightOut') + 300, sign: 1, level: deg },
    { control: 'wheel', from: k.at('leftIn'), to: k.at('leftOut') + 300, sign: -1, level: deg },
  ];
  if (hop && deg >= 30) segs.push({ control: 'hopTurn', from: k.at('right'), to: k.at('rightOut') + 400 }, { control: 'hopTurn', from: k.at('left'), to: k.at('leftOut') + 400 });
  if (hop) segs.push({ control: 'pop', from: k.at('right'), to: k.at('rightOut') }, { control: 'pop', from: k.at('left'), to: k.at('leftOut') });
  return { name: `wheel ±${deg}°${hop ? ' + hop' : ''}`, family: 'facing', kind: 'positive', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END, segs };
}

/** The wheel held centred while the torso leans side to side (a lean is not a turn), and a hop with it centred (no drift). */
export function wheelCentreStream(): RideStream {
  const g0 = wheelArms(R0, 0);
  const tilt = (j: Joints, deg: number): Joints => {
    const hip = [(j.LeftUpLeg[0] + j.RightUpLeg[0]) / 2, (j.LeftUpLeg[1] + j.RightUpLeg[1]) / 2, 0] as V3, a = (deg * Math.PI) / 180;
    const o = { ...j };
    for (const n of ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) {
      const p = j[n], x = p[0] - hip[0], y = p[1] - hip[1];
      o[n] = [hip[0] + x * Math.cos(a) - y * Math.sin(a), hip[1] + x * Math.sin(a) + y * Math.cos(a), p[2]];
    }
    return o;
  };
  const J = jumpBeat(g0, 2.4, 0.2);
  const k = facing([['grip', [0.5, (t) => wheelArms(R0, 0, ease(t / 0.5))]], ['centre', hold(g0, 0.8)],
    ['leanR', [1.2, (t) => tilt(g0, 10 * Math.sin(Math.PI * (t / 1.2)))]], ['leanL', [1.2, (t) => tilt(g0, -10 * Math.sin(Math.PI * (t / 1.2)))]],
    ['hop', [J[0], (t) => wheelArms(J[1](t), 0)]], ['centre2', hold(g0, 1.0)]]);
  return {
    name: 'wheel centred, torso lean + hop', family: 'facing', kind: 'positive', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END,
    segs: [{ control: 'grip', from: k.at('grip') + 500, to: k.marks.end }, { control: 'pop', from: k.at('hop'), to: k.at('centre2') + 300 }],
  };
}

/** Wings out, banked each way at `bank`, then pitched up and down by `pitch`, then folded. */
export function wingStream(bank: number, pitch: number): RideStream {
  const w0 = wingArms(R0, 0, 0);
  const beats: [string, Beat][] = [['spread', [0.5, (t) => wingArms(R0, 0, 0, ease(t / 0.5))]], ['level', hold(w0, 1.0)]];
  for (const [nm, b, p] of [['bankR', bank, 0], ['bankL', -bank, 0], ['up', 0, pitch], ['down', 0, -pitch]] as const) {
    beats.push([`${nm}In`, [0.35, (t) => wingArms(R0, b * ease(t / 0.35), p * ease(t / 0.35))]], [nm, hold(wingArms(R0, b, p), 1.2)], [`${nm}Out`, [0.35, (t) => wingArms(R0, b * (1 - ease(t / 0.35)), p * (1 - ease(t / 0.35)))]], ['level2', hold(w0, 0.6)]);
  }
  beats.push(['fold', [0.5, (t) => wingArms(R0, 0, 0, 1 - ease(t / 0.5))]], ['down', hold(R0, 1.2)]);
  const k = facing(beats);
  return {
    name: `wings bank ±${bank}° pitch ±${pitch}°`, family: 'facing', kind: 'positive', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END,
    // folding the wings drops the arms through the wing band: the nose dips for the off-dwell (250 ms), then the gas cuts
    allow: { pitch: [[k.at('fold'), k.at('fold') + 900]], bank: [[k.at('fold'), k.at('fold') + 900]] },
    segs: [
      { control: 'spread', from: k.at('spread') + 500, to: k.at('fold') },
      { control: 'bank', from: k.at('bankRIn'), to: k.at('bankROut') + 300, sign: 1, level: bank },
      { control: 'bank', from: k.at('bankLIn'), to: k.at('bankLOut') + 300, sign: -1, level: bank },
      { control: 'pitch', from: k.at('upIn'), to: k.at('upOut') + 300, sign: 1, level: pitch },
      { control: 'pitch', from: k.at('downIn'), to: k.at('downOut') + 300, sign: -1, level: pitch },
    ],
  };
}

/** One arm out as a wing (the other down), then a wave: never wings. */
export function oneArmStream(): RideStream {
  const one = (u: number): Joints => { const w = wingArms(R0, 0, 0, u); return { ...R0, LeftForeArm: w.LeftForeArm, LeftHand: w.LeftHand }; };
  const k = facing([['out', [0.5, (t) => one(ease(t / 0.5))]], ['hold', hold(one(1), 1.5)], ['in', [0.5, (t) => one(1 - ease(t / 0.5))]], ['wave', waveBeat(R0, 2.5)], ['rest', hold(R0, 1.0)]]);
  return { name: 'one arm out, a wave', family: 'facing', kind: 'negative', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END, segs: [] };
}

/** Running (or walking) in place at `hz` steps/s, `lift` m; high knees when `lift` ≥ 0.3. Then a stand. */
export function runStream(hz: number, lift: number, sec = 5, name?: string): RideStream {
  const k = facing([['run', runBeat(R0, sec, hz, lift)], ['rest', hold(R0, 1.5)]]);
  const high = lift >= 0.3;
  return {
    name: name ?? `${hz < 2 ? 'walk' : high ? 'high knees' : 'run'} ${hz} Hz lift ${lift}`, family: 'facing', kind: 'positive', labeller: 'scripted', stance: 'facing',
    clip: k.clip, marks: k.marks, gradeFrom: FACE_END,
    segs: [{ control: 'stride', from: k.at('run'), to: k.at('rest'), level: hz }, ...(high ? [{ control: 'highKnees' as const, from: k.at('run'), to: k.at('rest') }] : [])],
  };
}

/** A run, then the chest dipped forward at the tape (25°, 0.4 s), then a stand. */
export function dipStream(): RideStream {
  const run = runBeat(R0, 3, 3.2, 0.2);
  const dip = (j: Joints, deg: number): Joints => {
    const hip = [(j.LeftUpLeg[0] + j.RightUpLeg[0]) / 2, (j.LeftUpLeg[1] + j.RightUpLeg[1]) / 2, (j.LeftUpLeg[2] + j.RightUpLeg[2]) / 2] as V3, a = (deg * Math.PI) / 180;
    const o = { ...j };
    for (const n of ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) {
      const p = j[n], y = p[1] - hip[1], z = p[2] - hip[2];
      o[n] = [p[0], hip[1] + y * Math.cos(a) - z * Math.sin(a), hip[2] + y * Math.sin(a) + z * Math.cos(a)];
    }
    return o;
  };
  const k = facing([['run', run], ['dip', [0.6, (t) => dip(run[1](3 + t), 28 * Math.sin(Math.PI * Math.min(1, t / 0.6)))]], ['rest', hold(R0, 1.2)]]);
  return {
    name: 'run, dip at the tape', family: 'facing', kind: 'positive', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END,
    segs: [{ control: 'dip', from: k.at('dip'), to: k.at('rest') + 200 }, { control: 'stride', from: k.at('run'), to: k.at('rest'), level: 3.2 }],
  };
}

export function waveStretchStream(): RideStream {
  const k = facing([['wave', waveBeat(R0, 3)], ['rest', hold(R0, 0.8)], ['stretch', stretchBeat(R0, 4.5)], ['rest2', hold(R0, 1.0)]]);
  return { name: 'a wave, a stretch', family: 'facing', kind: 'negative', labeller: 'scripted', stance: 'facing', clip: k.clip, marks: k.marks, gradeFrom: FACE_END, segs: [] };
}

/** A sideways shuffle facing the camera, then the same on the square fallback's stance: the translation-free carve reads 0. */
export function shuffleStream(): RideStream {
  const side = (m: number): Joints => {
    const { left } = bodyAxes(R0);
    return Object.fromEntries(Object.entries(R0).map(([n, p]) => [n, [p[0] + left[0] * m, p[1], p[2] + left[2] * m]])) as Joints;
  };
  const k = facing([['square', hold(R0, 3.4)], ['shuffle', [3, (t) => side(0.3 * Math.sin((2 * Math.PI * t) / 1.5))]], ['rest', hold(R0, 1.2)]]);
  return { name: 'square stance, a sideways shuffle', family: 'board', kind: 'negative', labeller: 'scripted', stance: 'square', clip: k.clip, marks: k.marks, gradeFrom: (FACE_SEC + 3.4) * 1000, segs: [] };
}

/** The square fallback (a player who stays facing): 3.4 s still takes it, then toe-less side leans read as the carve. */
export function squareLeanStream(deg: number): RideStream {
  const base = stanceBase(0.06, 0.04);
  const tiltSide = (j: Joints, d: number): Joints => {
    const pv: V3 = [(j.LeftFoot[0] + j.RightFoot[0]) / 2, 0, (j.LeftFoot[2] + j.RightFoot[2]) / 2], a = (d * Math.PI) / 180;
    return Object.fromEntries(Object.entries(j).map(([n, p]) => {
      const x = p[0] - pv[0], y = p[1] - pv[1];
      return [n, [pv[0] + x * Math.cos(a) - y * Math.sin(a), pv[1] + x * Math.sin(a) + y * Math.cos(a), p[2]]];
    })) as Joints;
  };
  // + d tips the top toward −X: the player's RIGHT (a facing body's right is −X)
  const k = facing([['square', hold(base, 3.4)], ['rightIn', [0.3, (t) => tiltSide(base, deg * ease(t / 0.3))]], ['right', hold(tiltSide(base, deg), 1.2)],
    ['rightOut', [0.3, (t) => tiltSide(base, deg * (1 - ease(t / 0.3)))]], ['rest', hold(base, 0.8)],
    ['leftIn', [0.3, (t) => tiltSide(base, -deg * ease(t / 0.3))]], ['left', hold(tiltSide(base, -deg), 1.2)], ['leftOut', [0.3, (t) => tiltSide(base, -deg * (1 - ease(t / 0.3)))]], ['rest2', hold(base, 0.8)]]);
  return {
    name: `square fallback, side lean ${deg}°`, family: 'board', kind: 'positive', labeller: 'scripted', stance: 'square', clip: k.clip, marks: k.marks, gradeFrom: (FACE_SEC + 3.4) * 1000,
    segs: [{ control: 'carve', from: k.at('rightIn'), to: k.at('rightOut') + 300, sign: 1, level: deg }, { control: 'carve', from: k.at('leftIn'), to: k.at('leftOut') + 300, sign: -1, level: deg }],
  };
}

/** Surf's pump: crouch and stand in rhythm (compress, extend) at `hz` cycles per second. */
export function pumpStream(s: StanceArg, hz = 1.2, cm = 18, sec = 4): RideStream {
  const base = stanceBase(), st = inStance(base, s.theta, s.lead);
  const k = scripted([...openStance(st), ['pump', [sec, (t) => inStance(crouch(base, (cm / 100) * (0.5 - 0.5 * Math.cos(2 * Math.PI * hz * t))), s.theta, s.lead)]], ['rest', hold(st, 1.5)]]);
  const segs: RideSeg[] = [];
  const period = 1000 / hz;
  for (let c = 0; c < Math.floor(sec * hz); c++) {
    const t0 = k.at('pump') + c * period;
    // compressing over the cycle's first half, extending over its second (the told stroke lags the body by the dwell)
    segs.push({ control: 'trim', from: t0 + period * 0.05, to: t0 + period * 0.62, sign: -1 }, { control: 'trim', from: t0 + period * 0.55, to: t0 + period * 1.12, sign: 1 });
  }
  return {
    name: `pump ${hz} Hz ${cm} cm ${tag(s)}`, family: 'board', kind: 'positive', labeller: 'scripted', stance: s, clip: k.clip, marks: k.marks, gradeFrom: TAKE_END, segs,
    allow: { crouch: [[k.at('pump'), k.at('rest') + 1200]] },
  };
}

// ── the truth from the clean joints ─────────────────────────────────────────────────────────────────────────────

const mid3 = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const DEG = 180 / Math.PI;
/** The carve's point on clean joints, as the reader takes it off the landmarks (trunk 0.6, thighs 0.24, shanks 0.16). */
function comOf(j: Joints): V3 {
  const trunk = mid3(mid3(j.LeftUpLeg, j.RightUpLeg), mid3(j.LeftArm, j.RightArm));
  const thigh = mid3(mid3(j.LeftUpLeg, j.LeftLeg), mid3(j.RightUpLeg, j.RightLeg));
  const shank = mid3(mid3(j.LeftLeg, j.LeftFoot), mid3(j.RightLeg, j.RightFoot));
  return [0, 1, 2].map((k) => 0.6 * trunk[k] + 0.24 * thigh[k] + 0.16 * shank[k]) as V3;
}
const shoulderYawOf = (j: Joints): number => Math.atan2(-(j.LeftArm[2] - j.RightArm[2]), j.LeftArm[0] - j.RightArm[0]) * DEG;
const tilt2 = (a: V3, b: V3): number => Math.atan2(a[1] - b[1], Math.hypot(a[0] - b[0], a[2] - b[2])) * DEG;
const airborneOf = (j: Joints): boolean => Math.min(j.LeftFoot[1], j.RightFoot[1], j.LeftToe[1], j.RightToe[1]) > 0.075;

/**
 * Every segment's truth instants from the clip's clean joints (never the reader): `onset` where the move leaves rest
 * (a carve's centre 1 cm off the stance's neutral, a turn 15°, a wheel 2°, the feet leaving the floor) and `engage`
 * where it reaches the control's own engage line (CARVE_ON, QUARTER_DEG, 7° of wheel, 6° / 8° of wing, a wrist GRAB_ON_M
 * under its knee). Returns the stream with them filled in.
 */
export function withTruth(s: RideStream): RideStream {
  const clip = s.clip, dur = (clip.frames.length - 1) / clip.fps;
  const take = sampleClip(clip, Math.max(0, s.gradeFrom / 1000 - 0.2));
  const { left } = bodyAxes(take);
  const n: V3 = [-left[2], 0, left[0]];
  const leg = Math.hypot(take.LeftUpLeg[0] - take.LeftFoot[0], take.LeftUpLeg[1] - take.LeftFoot[1], take.LeftUpLeg[2] - take.LeftFoot[2]);
  const square = s.stance === 'square';
  const carveOf = (j: Joints): number => {
    const c = comOf(j), a = mid3(j.LeftFoot, j.RightFoot), d: V3 = [c[0] - a[0], 0, c[2] - a[2]];
    return (square ? -(d[0] * left[0] + d[2] * left[2]) : d[0] * n[0] + d[2] * n[2]) / leg;
  };
  const neutral = carveOf(take), yaw0 = shoulderYawOf(take);
  const find = (from: number, to: number, pred: (j: Joints) => boolean): number | undefined => {
    for (let t = from; t <= Math.min(to, dur * 1000); t += 1000 / 120) if (pred(sampleClip(clip, t / 1000))) return t;
    return undefined;
  };
  const segs = s.segs.map((g) => {
    const out: RideSeg = { ...g };
    const span: [number, number] = [g.from, g.to];
    switch (g.control) {
      case 'carve': out.onset = find(...span, (j) => Math.abs(carveOf(j) - neutral) * leg >= 0.01); out.engage = find(...span, (j) => Math.abs(carveOf(j) - neutral) >= CARVE_ON); break;
      case 'quarter': out.onset = find(...span, (j) => Math.abs(shoulderYawOf(j) - yaw0) >= 15); out.engage = find(...span, (j) => Math.abs(shoulderYawOf(j) - yaw0) >= QUARTER_DEG); break;
      case 'wheel': {
        const ang = (j: Joints) => tilt2(j.LeftHand, j.RightHand) - tilt2(j.LeftArm, j.RightArm);
        out.onset = find(...span, (j) => Math.abs(ang(j)) >= 2); out.engage = find(...span, (j) => Math.abs(ang(j)) >= 7); break;
      }
      case 'bank': out.onset = find(...span, (j) => Math.abs(tilt2(j.LeftHand, j.RightHand)) >= 2); out.engage = find(...span, (j) => Math.abs(tilt2(j.LeftHand, j.RightHand)) >= 6); break;
      case 'pitch': {
        const el = (j: Joints) => (tilt2(j.LeftHand, j.LeftArm) + tilt2(j.RightHand, j.RightArm)) / 2;
        const e0 = el(sampleClip(clip, (g.from - 50) / 1000));
        out.onset = find(...span, (j) => Math.abs(el(j) - e0) >= 2); out.engage = find(...span, (j) => Math.abs(el(j) - e0) >= 8); break;
      }
      case 'grab': out.onset = out.engage = find(...span, (j) => Math.max(j.LeftLeg[1] - j.LeftHand[1], j.RightLeg[1] - j.RightHand[1]) >= GRAB_ON_M); break;
      case 'pop': case 'hopTurn': out.onset = out.engage = find(...span, airborneOf); break;
      default: out.onset = out.engage = g.from;
    }
    return out;
  });
  return { ...s, segs };
}

// ── the real takes (lib/pose/__fixtures__/ride, scripts/body/ride-streams.mts) ──────────────────────────────────

/** An eye label (scripts/mocap/stream-sheet.mts, read off the sheet): a move's window in the source's seconds. */
export interface RideEyeLabel { control: string; fromSec: number; toSec: number; note?: string }
/** A committed CMU ride take (the fixture's JSON, parsed by the caller: this module reads no files). */
export interface RideTakeFile {
  name: string; description: string; family: 'board' | 'facing'; theta: number | null; kind: 'positive' | 'negative';
  controls: string[]; labeller: 'eye'; eye: RideEyeLabel[];
  source: { file: string; license: string; fps: number; fromSec: number; toSec: number };
  /** The opening built before the window (s): the facing stand, then (a board take) the turn into the stance and its hold. */
  opening: { faceSec: number; turnSec?: number; takeSec?: number };
  /** The window only (a board take already in its stance): each frame the joints' x, y, z in `joints` order. */
  clip: { fps: number; foot?: JointClip['foot']; joints: string[]; frames: number[][] };
}

/** Runs of `pred` over the clip (capture ms) at least `minMs` long, inside [from, to]. */
function runsOf(clip: JointClip, from: number, to: number, minMs: number, pred: (j: Joints) => number): { from: number; to: number; sign: 1 | -1 }[] {
  const out: { from: number; to: number; sign: 1 | -1 }[] = [];
  let cur: { from: number; to: number; sign: 1 | -1 } | null = null;
  const dur = ((clip.frames.length - 1) / clip.fps) * 1000;
  for (let t = from; t <= Math.min(to, dur); t += 1000 / 60) {
    const v = pred(sampleClip(clip, t / 1000)), sg = (Math.sign(v) || 0) as 1 | -1 | 0;
    if (sg && (!cur || cur.sign !== sg)) { if (cur && cur.to - cur.from >= minMs) out.push(cur); cur = { from: t, to: t, sign: sg }; }
    else if (sg && cur) cur.to = t;
    else if (!sg && cur) { if (cur.to - cur.from >= minMs) out.push(cur); cur = null; }
  }
  if (cur && cur.to - cur.from >= minMs) out.push(cur);
  return out;
}

/** The take's opening, the way a player starts: its first frame turned to face the camera and held (the space check's
 *  stand, where the reader calibrates), then — a board take — the turn into its stance and the still hold that takes it. */
function openTake(first: Joints, o: RideTakeFile['opening'], fps: number): Joints[] {
  const face0 = turnBody(first, -shoulderYawOf(first));
  const out: Joints[] = [];
  for (let k = 0; k < Math.round(o.faceSec * fps); k++) out.push(face0);
  if (o.turnSec) for (let k = 1; k <= Math.round(o.turnSec * fps); k++) out.push(lerpJoints(face0, first, ease(k / (o.turnSec * fps))));
  if (o.takeSec) for (let k = 0; k < Math.round(o.takeSec * fps); k++) out.push(first);
  return out;
}

/**
 * A real take as a labelled stream (PLAN-P8 §8.2, R-F6). The CLASS and its WINDOW are the eye's (the fixture's `eye`, off
 * stream-sheet); the truth INSIDE a window is the take's clean joints, past each control's own engage line — a carve's sign
 * where the clean centre sits past CARVE_ON of the stance's neutral for ≥ 300 ms, a wheel's past WHEEL_ON_DEG and a wing's
 * past BANK_ON_DEG for ≥ 300 ms, the instants (withTruth). Waves and stretches are negatives: the whole take asks for
 * nothing. A turn in place (`turn`) is named for the reader of the fixture: slower than a quarter, it asks for none.
 */
export function realStream(f: RideTakeFile): RideStream {
  const J = f.clip.joints;
  const take = f.clip.frames.map((row) => Object.fromEntries(J.map((k, i) => [k, [row[3 * i], row[3 * i + 1], row[3 * i + 2]]])) as unknown as Joints);
  const lead = openTake(take[0], f.opening, f.clip.fps);
  const clip: JointClip = { fps: f.clip.fps, frames: [...lead, ...take], ...(f.clip.foot ? { foot: f.clip.foot } : {}) };
  const from = Math.round((lead.length / f.clip.fps) * 1000);
  const end = ((clip.frames.length - 1) / clip.fps) * 1000;
  const board = f.family === 'board';
  const at = (sec: number) => from + (sec - f.source.fromSec) * 1000;   // a source second → capture ms
  const stance: RideStream['stance'] = board ? { theta: f.theta ?? 45, lead: 'L' } : 'facing';
  const base: RideStream = { name: `${f.name} (CMU)`, family: board ? 'board' : 'facing', kind: f.kind, labeller: 'eye', stance, clip, segs: [], gradeFrom: from, marks: { take: from, end } };
  const rest = sampleClip(clip, Math.max(0, from - 200) / 1000);
  const segs: RideSeg[] = [];
  for (const e of f.eye) {
    const a = Math.max(from, at(e.fromSec)), b = Math.min(end, at(e.toSec));
    switch (e.control) {
      case 'carve': {
        const { left } = bodyAxes(rest), n: V3 = [-left[2], 0, left[0]];
        const leg = Math.hypot(rest.LeftUpLeg[0] - rest.LeftFoot[0], rest.LeftUpLeg[1] - rest.LeftFoot[1], rest.LeftUpLeg[2] - rest.LeftFoot[2]);
        const carve = (j: Joints) => { const c = comOf(j), m = mid3(j.LeftFoot, j.RightFoot); return ((c[0] - m[0]) * n[0] + (c[2] - m[2]) * n[2]) / leg; };
        const neutral = carve(rest);
        for (const r of runsOf(clip, a, b, 300, (j) => (Math.abs(carve(j) - neutral) >= CARVE_ON ? carve(j) - neutral : 0))) segs.push({ control: 'carve', from: r.from, to: r.to + 300, sign: r.sign });
        break;
      }
      case 'grip': {
        segs.push({ control: 'grip', from: a, to: b });
        const ang = (j: Joints) => tilt2(j.LeftHand, j.RightHand) - tilt2(j.LeftArm, j.RightArm);
        for (const r of runsOf(clip, a, b, 300, (j) => (Math.abs(ang(j)) >= WHEEL_ON_DEG ? ang(j) : 0))) segs.push({ control: 'wheel', from: r.from, to: r.to + 300, sign: r.sign });
        break;
      }
      case 'spread': {
        segs.push({ control: 'spread', from: a, to: b });
        for (const r of runsOf(clip, a, b, 300, (j) => (Math.abs(tilt2(j.LeftHand, j.RightHand)) >= BANK_ON_DEG ? tilt2(j.LeftHand, j.RightHand) : 0))) segs.push({ control: 'bank', from: r.from, to: r.to + 300, sign: r.sign });
        break;
      }
      case 'quarter': segs.push({ control: 'quarter', from: a, to: b + 400, level: 90 }); break;
      case 'pop': segs.push({ control: 'pop', from: a, to: b + 300 }); break;
      case 'push': segs.push({ control: 'push', from: a, to: b + 300 }); break;
      case 'stride': segs.push({ control: 'stride', from: a, to: b }); break;
      default: break;   // wave, stretch: named for the reader of the fixture; a negative asks for nothing
    }
  }
  return withTruth({ ...base, segs });
}

// ── the catalogue ────────────────────────────────────────────────────────────────────────────────────────────────

export const STANCES: readonly StanceArg[] = [30, 45, 60].flatMap((theta) => (['L', 'R'] as const).map((lead) => ({ theta, lead })));
/** The early hop turn's lead (s): the turn begins in the push, 250 ms before the feet leave, and passes the quarter just
 *  before them (review fix, 2026-09-26: its quarter reaches a mode with or before the hop's A, as the real 83_* turns' do). */
export const EARLY_TURN_SEC = 0.25;

/** The whole scripted label set (PLAN-P8 §8.1), `stances` for the board streams. */
export function rideCatalogue(stances: readonly StanceArg[] = STANCES): RideStream[] {
  const out: RideStream[] = [];
  for (const s of stances) {
    out.push(restStream(s), restStream(s, true));
    for (const d of [4, 8, 12]) out.push(leanStream(s, d));
    for (const d of [8, 12]) out.push(noseTailStream(s, d));
    for (const cm of [10, 20, 30]) out.push(crouchStream(s, cm));
    for (const v0 of [2.0, 2.4, 2.8]) out.push(hopStream(s, v0));
    for (const hand of ['lead', 'rear'] as const) for (const edge of ['toe', 'heel'] as const) out.push(grabStream(s, hand, edge));
    out.push(tuckStream(s));
    for (const dir of ['fs', 'bs'] as const) { for (const deg of [90, 60, 45]) out.push(quarterStream(s, dir, deg)); out.push(quarterStream(s, dir, 90, true), quarterStream(s, dir, 90, true, EARLY_TURN_SEC)); }
    out.push(pushStream(s), lookStream(s), pumpStream(s));
  }
  out.push(restStream('facing'), restStream('facing', true), shuffleStream(), squareLeanStream(8), squareLeanStream(12));
  for (const d of [15, 30, 60]) out.push(wheelStream(d));
  out.push(wheelStream(30, true), wheelStream(15, true), wheelCentreStream());
  for (const [b, p] of [[10, 10], [20, 20], [35, 30]] as const) out.push(wingStream(b, p));
  out.push(oneArmStream(), waveStretchStream(), dipStream());
  for (const hz of [2.2, 3.0, 3.8]) out.push(runStream(hz, 0.18));
  out.push(runStream(1.6, 0.08), runStream(1.8, 0.1), runStream(3.8, 0.5, 5, 'high knees 3.8 Hz'));
  return out.map(withTruth);
}

// ── the camera conditions ────────────────────────────────────────────────────────────────────────────────────────

export interface RideCondition { fps: number; latencyMs: number; noise: number; flip: boolean; seed: number; drop?: number; miss?: number; holes?: boolean }
export const condName = (c: RideCondition) => `${c.fps}fps ${c.latencyMs}ms ${c.noise}x${c.flip ? ' flip' : ''} s${c.seed}`;

/** A stream shot under a condition: synthesize (noise × k, drops, misses, latency ± 15 ms), then 150 ms visibility holes
 *  (every ~4 s, the body gone), then the label flip. */
export function shoot(s: RideStream, c: RideCondition): Synthesized {
  const n = DEFAULT_NOISE, k = c.noise;
  const syn = synthesize(s.clip, {
    seed: c.seed, fps: c.fps, latencyMs: c.latencyMs, latencyJitterMs: 15, dropRate: c.drop ?? 0.02, missRate: c.miss ?? 0.01,
    noise: { imageTorso: n.imageTorso * k, imageLimb: n.imageLimb * k, worldTorso: n.worldTorso * k, worldLimb: n.worldLimb * k },
  });
  let frames: PoseFrame[] = syn.frames;
  if (c.holes) {
    // 150 ms holes (the body gone: a blink of the model) in the stream's quiet stretches, every ~4 s — not on a labelled
    // move, where a hole would only measure the hole
    const end = frames[frames.length - 1]?.t ?? 0;
    const busy = (t: number) => s.segs.some((g) => t + 150 >= g.from - 300 && t <= g.to + 300);
    for (let t = s.gradeFrom + 600, last = -Infinity; t < end - 500; t += 50) {
      if (t - last >= 4000 && !busy(t)) { frames = dropout(frames, t, t + 150); last = t; }
    }
  }
  for (const [a, b] of s.gaps ?? []) frames = dropout(frames, a, b);
  if (c.flip) frames = labelFlipWhenAway(frames, { seed: c.seed });
  return { ...syn, frames };
}

export { turnAbout };
