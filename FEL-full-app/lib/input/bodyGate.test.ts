// THE P3 GATE (movement play P3, 2026-09-24): every body profile against every stream, through the whole seam —
// BodyReader → ChannelReader → BodySession + BodyFloor → BodyArbiter → what the mode receives (lib/pose/seamReplay.ts).
//
// The oracle is DERIVED FROM EACH PROFILE'S BINDINGS, never declared per profile: a row that binds nothing must produce
// nothing anywhere; a row that binds the hop may press its button once per true jump and nothing else near a jump; a
// crouch may pull the trigger in a dip and must let go of it; and so on (plan §5 step 2, the gate table):
//   REST    the stand lead, all of stand_still, the calf raise and the scripted holds (not the hands-up one), ±400 ms
//           around every truth event cut out: no output of any kind, and no intent in READY, playing or PAUSED;
//   JUMP    gt take-off − 700 … landing + 500: the hop's one pulse (within 350 ms of the true take-off) and the crouch
//           before it; no other press; no stick change from the take-off to landing + 250, x ≡ 0 on an in-place jump;
//           the trigger never rises there and is 0 from the pulse on; no intent;
//   DIP     a duck's start − 100 … its end + 300: the crouch's trigger only, the stick ≡ 0, the trigger back at 0 within
//           550 ms of standing; a 10 cm duck is silent in every profile;
//   RUN-UP  the approach of jump_one_foot_runup and the three dunk takes: the hop, the step d-pad and the cadence may
//           move there, and x is exempt (those bodies travel sideways into the jump); a take that steps into its jump
//           where the truth has the step (the jump shot) keeps that step's d-pad too;
//   ALL     every output tagged `src: 'body'` (so never a wake input), every pulse released within 100 ms, nothing held
//           at the stream's end or 100 ms after the body is lost, nothing before the reader is calibrated (the
//           no-stand, as-shipped pass);
//   EXPLAINED  every press anywhere in a take (not only in the windows above: the jog, the shuffle, a run-up's early
//           steps, the steps of punch_kick) has its cause in the truth — a hop's button a true jump within 350 ms, a
//           punch's a true punch and a kick's a true kick within MATCH_ARM_MS, a stride's d-pad a true touch-down of that
//           foot within MATCH_STEP_MS or that foot truly off the floor in the STEP_SWING_MS before it;
// then the session rows (START, the lost pause and who it may pause, the final packet), the play evidence, and the
// positive checks a silent floor cannot pass (the punches are JABs, the pops carry the gather's depth, the strides
// alternate by foot, the lean follows the body, a pad and the body compose).
//
// Streams: the 12 fixtures with a 1.2 s stand lead (grade.standFrame + holdStill) and again as shipped; the scripted
// duck at 10 / 20 / 30 cm; streamKit scripts — jumps at v0 2.0 / 2.4 / 2.8 with and without the arm swing, a 3 Hz jog,
// a 1.2 s hands-up hold, a calf raise, ground dropouts of 400 ms and 2 s, 340 ms in the air through a confirmed
// flight, and a fighting stance held 16 and 20 cm down that throws three jabs, and one a kick off its bent supporting
// leg (the step-2 review) — each scripted stream on seeds 17, 23 and 41. Events within SPLICE_MS of the stand → take splice are the
// splice's, not the take's (jump_two_foot_low starts in the air).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodyPackets, seamReplay, type SeamEmitted, type SeamReplay, type ScriptedInput, type StreamPacket } from '@/lib/pose/seamReplay';
import { standFrame, SPLICE_MS, MATCH_ARM_MS, STAND_SEC } from '@/lib/pose/grade';
import { holdStill, dropout, script, hold, jumpBeat, jogBeat, heelsUp, armsSwing, crouch, scriptedJump, type Beat } from '@/lib/pose/streamKit';
import { duckFixture } from '@/lib/pose/baseline';
import { restPose, moveJoints, synthesize, type GroundTruth, type Joints, type PoseFixture, type V3 } from '@/lib/pose/synth';
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { BODY_PROFILES, type BodyProfile } from './bodyProfiles';
import { CROUCH_DEAD, CROUCH_FULL, PEAK_HOLD_MS, STEP_SWING_MS } from './bodyFloor';
import { STRIDE_ZERO_MS } from '@/lib/pose/bodyChannels';
import { isWakeInput } from '@/lib/babylon/core/StartWake';
import { START_HOLD_MS, LOST_PAUSE_MS } from '@/lib/babylon/core/BodySession';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import type { ModePhase } from '@/lib/babylon/core/ModeHarness';

// ── the streams ──────────────────────────────────────────────────────────────────────────────────────────────────

const DIR = join(__dirname, '../pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')) as PoseFixture;
const NAMES = (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as { name: string }[]).map((e) => e.name);
const OWNER_STAND = load('stand_still').frames[70];   // the owner's takes that never stand borrow his own stand
const RUN_UP = new Set(['jump_one_foot_runup', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot']);
const SEEDS = [17, 23, 41];
const R0 = restPose();
/** A read step this close (ms) to a true touch-down is that step. */
const MATCH_STEP_MS = 150;
/** A truth event this close (ms) is not REST. */
const REST_GUARD_MS = 400;

type Win = [number, number];
interface Jump { takeoff: number; landing: number; dangling: boolean }
interface Stream {
  name: string;
  kind: 'fixture' | 'shipped' | 'duck' | 'script';
  packets: StreamPacket[];
  frames: PoseFrame[];
  /** Stand frames before the take (frame index < 0). */
  lead: number;
  /** The take's first capture time: the splice. */
  t0: number;
  gt: GroundTruth;
  jumps: Jump[];
  rest: Win[];
  runUp: boolean;
  /** A duck: its start, the moment it stands again, its depth (cm). */
  dip: { from: number; stand: number; cm: number } | null;
  /** Beat boundaries of a script (capture ms). */
  beats: number[];
}

/** True jumps, plus a flight still in the air when the take ends (the truth grades none without a landing). */
function jumpsOf(gt: GroundTruth, take: PoseFrame[]): Jump[] {
  const out: Jump[] = gt.jumps.map((j) => ({ takeoff: j.takeoff.t, landing: j.landing.t, dangling: false }));
  const c = gt.perFrame.contact;
  let k = c.length - 1;
  while (k >= 0 && !c[k][0] && !c[k][1]) k--;
  if (k < c.length - 1 && k >= 0) out.push({ takeoff: take[k + 1].t, landing: take[take.length - 1].t, dangling: true });
  return out;
}
/** Truth instants (every jump / flight edge, step, wrist event, kick): REST is cut around each. */
function truthTimes(gt: GroundTruth): number[] {
  return [
    ...[...gt.jumps, ...gt.flights].flatMap((j) => [j.takeoff.t, j.apex.t, j.landing.t]),
    ...gt.steps.flatMap((s) => [s.down?.t, s.up?.t].filter((x): x is number => x !== undefined)),
    ...gt.wrist.map((w) => w.at.t), ...gt.kicks.map((k) => k.at.t),
  ];
}
/** Windows minus [t, t + ms] after each time. */
function cutAfter(wins: Win[], times: number[], ms: number): Win[] {
  let out = wins;
  for (const t of times) out = out.flatMap(([x, y]): Win[] => (t + ms <= x || t >= y ? [[x, y]] : [...(t > x ? [[x, t] as Win] : []), ...(t + ms < y ? [[t + ms, y] as Win] : [])]));
  return out;
}
/** Windows minus ±REST_GUARD_MS around the truth times. */
function cut(wins: Win[], times: number[]): Win[] {
  let out = wins;
  for (const t of times) {
    const a = t - REST_GUARD_MS, b = t + REST_GUARD_MS;
    out = out.flatMap(([x, y]): Win[] => (b <= x || a >= y ? [[x, y]] : [...(a > x ? [[x, a] as Win] : []), ...(b < y ? [[b, y] as Win] : [])]));
  }
  return out;
}

function fixtureStream(name: string, shipped: boolean): Stream {
  const fx = load(name);
  const t0 = fx.frames[0].t;
  const lead = shipped ? [] : holdStill(standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined).frame,
    { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: t0 });
  const frames = [...lead, ...fx.frames];
  // the stand lead up to (not including) the take's first frame; all of stand_still
  const rest: Win[] = shipped ? [] : name === 'stand_still' ? [[lead[0].t, Infinity]] : [[lead[0].t, t0 - 1e-3]];
  return {
    name: shipped ? `${name} (as shipped)` : name, kind: shipped ? 'shipped' : 'fixture',
    packets: bodyPackets(frames, { lead: lead.length }), frames, lead: lead.length, t0, gt: fx.gt,
    jumps: jumpsOf(fx.gt, fx.frames), rest: cut(rest, truthTimes(fx.gt)), runUp: RUN_UP.has(name), dip: null, beats: [],
  };
}

function duckStream(depthM: number, seed: number): Stream {
  const { fx, downAt, bottomAt } = duckFixture(depthM, seed);
  const lead = holdStill(fx.frames.find((f) => f.present)!, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t, seed });
  const frames = [...lead, ...fx.frames];
  const stand = bottomAt + 300 + 200;                        // duckClip: 0.3 s held at the bottom, 0.2 s back up
  // REST: the lead, the stand before the duck, and the stand after it once the DIP row's 550 ms are up
  const rest: Win[] = [[lead[0].t, downAt - 100], [stand + 550, Infinity]];
  return {
    name: `duck ${Math.round(depthM * 100)} cm s${seed}`, kind: 'duck', packets: bodyPackets(frames, { lead: lead.length }), frames,
    lead: lead.length, t0: -Infinity, gt: fx.gt, jumps: [], rest: cut(rest, truthTimes(fx.gt)), runUp: false,
    dip: { from: downAt, stand, cm: Math.round(depthM * 100) }, beats: [],
  };
}

type Kind = 'rest' | 'move' | 'hands';
/** A body gone from the frame for [from, to): the gone stretch is the session's, not REST. */
interface Gap { from: number; to: number }
function scriptStream(name: string, parts: [Kind, Beat][], seed: number, gap?: (beats: number[]) => Gap | Gap[]): Stream {
  const beats: number[] = [0];
  for (const [, b] of parts) beats.push(beats[beats.length - 1] + b[0] * 1000);
  const syn = synthesize(script(parts.map(([, b]) => b)), { seed });
  const g0 = gap?.(beats);
  const gaps = g0 === undefined ? [] : Array.isArray(g0) ? g0 : [g0];
  const frames = gaps.reduce((f, g) => dropout(f, g.from, g.to), syn.frames);
  let rest = parts.flatMap(([k], i): Win[] => (k === 'rest' ? [[beats[i], i === parts.length - 1 ? Infinity : beats[i + 1]]] : []));
  for (const g of gaps) rest = rest.flatMap(([a, b]): Win[] => [...(a < g.from ? [[a, Math.min(b, g.from)] as Win] : []), ...(b > g.to ? [[Math.max(a, g.to), b] as Win] : [])]);
  return {
    name: `${name} s${seed}`, kind: 'script', packets: bodyPackets(frames), frames, lead: 0, t0: -Infinity, gt: syn.gt,
    jumps: jumpsOf(syn.gt, frames), rest: cut(rest, truthTimes(syn.gt)), runUp: false, dip: null, beats,
  };
}

/** Stepping sideways (the lean) over `sec`, then held there. */
const sideStep = (m: number, sec: number): Beat => [sec, (t) => moveJoints(R0, [m * Math.min(1, t / sec), 0, 0])];
const LEANT = moveJoints(R0, [0.3, 0, 0]);
const heels = (deg: number, sec: number, up: boolean): Beat => [sec, (t) => heelsUp(R0, deg * (up ? t / sec : 1 - t / sec))];
const ARMS_UP = armsSwing(R0, 1);
/** The jump + side step + (dropout) stream the session rows use: the body plays (a hop, a lean), then is gone. */
const DROP_AT = (b: number[]) => b[3] + 600;
const droppable = (seed: number, name: string, gapMs: number, extra: [Kind, Beat][] = []) => scriptStream(name, [
  ['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, 2.4)], ['move', sideStep(0.3, 0.4)], ['move', hold(LEANT, 2.4 + gapMs / 1000)], ...extra,
], seed, (b) => ({ from: DROP_AT(b), to: DROP_AT(b) + gapMs }));

// ── a fighting stance (the step-2 review): a guard, a straight jab, a front kick off the bent supporting leg ──
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** A two-bone limb from root R to the end target E (clamped to its reach), its middle joint bent toward `bend`. */
function limb(R: V3, E: V3, l1: number, l2: number, bend: V3): { mid: V3; end: V3 } {
  const v = sub3(E, R), D = Math.min(l1 + l2 - 1e-4, len3(v)), u = scale3(v, 1 / len3(v));
  const d = bend[0] * u[0] + bend[1] * u[1] + bend[2] * u[2];
  let p = sub3(bend, scale3(u, d));
  p = scale3(p, 1 / Math.max(1e-9, len3(p)));
  const along = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return { mid: add3(R, add3(scale3(u, along), scale3(p, h))), end: add3(R, scale3(u, D)) };
}
/** Both fists up in a guard before the face; the right one driven out straight at the camera by u (0 guard … 1 full reach). */
function guard(j: Joints, jab = 0): Joints {
  const out = { ...j };
  for (const side of ['Left', 'Right'] as const) {
    const S = j[`${side}Arm`], inward = side === 'Left' ? -1 : 1;
    const l1 = len3(sub3(R0[`${side}ForeArm`], R0[`${side}Arm`])), l2 = len3(sub3(R0[`${side}Hand`], R0[`${side}ForeArm`]));
    const up: V3 = add3(S, [0.08 * inward, 0.02, 0.2]), out_: V3 = add3(S, [0.05 * inward, 0, 0.99 * (l1 + l2)]);
    const u = side === 'Right' ? jab : 0;
    const a = limb(S, add3(up, scale3(sub3(out_, up), u)), l1, l2, [0, -1, 0]);
    out[`${side}ForeArm`] = a.mid; out[`${side}Hand`] = a.end;
  }
  return out;
}
/** The right leg swung from its planted foot to straight out 85° in front (u 0 … 1), the knee lifting on the way. */
function frontKick(j: Joints, u: number): Joints {
  const out = { ...j }, H = j.RightUpLeg, P0 = j.RightFoot;
  const l1 = len3(sub3(R0.RightLeg, R0.RightUpLeg)), l2 = len3(sub3(R0.RightFoot, R0.RightLeg)), a = (85 * Math.PI) / 180;
  const P1: V3 = add3(H, [0, -(l1 + l2) * Math.cos(a), (l1 + l2) * Math.sin(a)]);
  const k = limb(H, add3(P0, scale3(sub3(P1, P0), u)), l1, l2, [0, 1, 1]);
  out.RightLeg = k.mid; out.RightFoot = k.end; out.RightToe = add3(j.RightToe, sub3(k.end, P0));
  return out;
}
const jabBeat = (st: Joints): Beat => [0.8, (t) => guard(st, t < 0.1 ? ease(t / 0.1) : t < 0.35 ? 1 - ease((t - 0.1) / 0.25) : 0)];
const kickBeat = (st: Joints): Beat => [0.9, (t) => frontKick(guard(st), t < 0.18 ? ease(t / 0.18) : t < 0.23 ? 1 : t < 0.53 ? 1 - ease((t - 0.23) / 0.3) : 0)];
/** Stand, sink `cm` into a guard, throw, stand back up. Nothing after the stand is REST: the stance is a crouch the
 *  boards' trigger may pull and let go of on its own clock. */
function stanceStream(name: string, cm: number, throws: (st: Joints) => Beat[], seed: number): Stream {
  const st = crouch(R0, cm / 100), g = guard(st);
  return scriptStream(name, [
    ['rest', hold(R0, 1.5)], ['move', [0.4, (t) => guard(crouch(R0, (cm / 100) * ease(t / 0.4)))]], ['move', hold(g, 0.6)],
    ...throws(st).map((b): [Kind, Beat] => ['move', b]), ['move', hold(g, 0.6)],
    ['move', [0.4, (t) => guard(crouch(R0, (cm / 100) * (1 - ease(t / 0.4))))]], ['move', hold(guard(R0), 1.0)],
  ], seed);
}
const STANCE_CM = [16, 20];

let STREAMS: Stream[] | null = null;
function streams(): Stream[] {
  if (STREAMS) return STREAMS;
  const out: Stream[] = [];
  for (const n of NAMES) out.push(fixtureStream(n, false));
  for (const n of NAMES) out.push(fixtureStream(n, true));
  for (const d of [0.1, 0.2, 0.3]) for (const s of SEEDS) out.push(duckStream(d, s));
  for (const seed of SEEDS) {
    for (const v0 of [2.0, 2.4, 2.8]) for (const arms of [false, true]) {
      out.push(scriptStream(`jump v0 ${v0}${arms ? ' arms' : ''}`, [['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, v0, 0.3, arms)], ['rest', hold(R0, 1.0)]], seed));
    }
    out.push(scriptStream('jog 3 Hz', [['rest', hold(R0, 1.5)], ['move', jogBeat(R0, 2, 3, 0.2)], ['rest', hold(R0, 1.2)]], seed));
    out.push(scriptStream('hands up 1.2 s', [['rest', hold(R0, 1.5)], ['hands', hold(ARMS_UP, 1.2)], ['rest', hold(R0, 1.0)]], seed));
    out.push(scriptStream('calf raise', [['rest', hold(R0, 1.5)], ['rest', heels(35, 0.3, true)], ['rest', hold(heelsUp(R0, 35), 0.6)], ['rest', heels(35, 0.3, false)], ['rest', hold(R0, 1.0)]], seed));
    out.push(scriptStream('ground dropout 400 ms', [['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, 2.4)], ['rest', hold(R0, 2.5)]], seed,
      (b) => ({ from: b[2] + 800, to: b[2] + 1200 })));
    out.push(scriptStream('ground dropout 2 s', [['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, 2.4)], ['rest', hold(R0, 4.0)]], seed,
      (b) => ({ from: b[2] + 800, to: b[2] + 2800 })));
    const J = scriptedJump(R0, 2.8);
    out.push(scriptStream('air dropout 340 ms', [['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, 2.8)], ['rest', hold(R0, 1.0)]], seed,
      (b) => ({ from: b[1] + J.tOff * 1000 + 120, to: b[1] + J.tOff * 1000 + 460 })));
    for (const cm of STANCE_CM) out.push(stanceStream(`stance ${cm} cm jabs`, cm, (st) => [jabBeat(st), jabBeat(st), jabBeat(st)], seed));
    out.push(stanceStream('stance 16 cm kick', 16, (st) => [kickBeat(st)], seed));
  }
  return (STREAMS = out);
}
const stream = (name: string) => streams().find((s) => s.name === name)!;

// ── replays (cached: a profile, a stream, a phase) ───────────────────────────────────────────────────────────────

const PROFILES = Object.values(BODY_PROFILES);
const bySkey = (key: string) => PROFILES.find((p) => p.key === key)!;
const cache = new Map<string, SeamReplay>();
function play(p: BodyProfile, s: Stream, phase: ModePhase): SeamReplay {
  // a held READY / PAUSED phase never reaches the floor: its session depends only on whether the profile drives
  const k = phase === 'playing' ? `${p.key}|${s.name}|${phase}` : `${p.bindings.length > 0}|${s.name}|${phase}`;
  let r = cache.get(k);
  if (!r) cache.set(k, (r = seamReplay(s.packets, { profile: p, phase, name: s.name })));
  return r;
}
const machine = (p: BodyProfile, s: Stream, o: { start?: 'ready' | 'playing'; inputs?: ScriptedInput[]; padSeated?: boolean } = {}) =>
  seamReplay(s.packets, { profile: p, phase: 'machine', start: o.start ?? 'playing', inputs: o.inputs, padSeated: o.padSeated, name: s.name });

// ── reading a replay ─────────────────────────────────────────────────────────────────────────────────────────────

const isPress = (e: FelInput) => (e.t === 'button' || e.t === 'dpad') && e.pressed;
const keyOf = (e: FelInput) => (e.t === 'button' ? `b:${e.btn}` : e.t === 'dpad' ? `d:${e.dir}` : '');
const inWin = (t: number, w: Win) => t >= w[0] && t <= w[1];
interface State { x: number; y: number; rt: number; lt: number; held: Set<string> }
/** What the mode holds after every bus event with seq < `seq`. */
function stateAt(bus: SeamEmitted[], seq: number): State {
  const s: State = { x: 0, y: 0, rt: 0, lt: 0, held: new Set() };
  for (const x of bus) {
    if (x.seq >= seq) break;
    const e = x.e;
    if (e.t === 'stick' && e.side === 'L') { s.x = e.x; s.y = e.y; }
    else if (e.t === 'trigger') { if (e.side === 'R') s.rt = e.value; else s.lt = e.value; }
    else if (e.t === 'button' || e.t === 'dpad') { if (e.pressed) s.held.add(keyOf(e)); else s.held.delete(keyOf(e)); }
  }
  return s;
}
const neutral = (s: State) => s.x === 0 && s.y === 0 && s.rt === 0 && s.lt === 0 && s.held.size === 0;
/** The packet a bus item came from: its frame's events (to tell the splice's). */
const packetOf = (s: Stream, frame: number): StreamPacket | undefined => s.packets[frame + s.lead];
const fromSplice = (s: Stream, x: SeamEmitted) =>
  Number.isFinite(s.t0) && (packetOf(s, x.frame)?.events ?? []).some((ev) => Math.abs(ev.t - s.t0) <= SPLICE_MS);
const hopOf = (p: BodyProfile) => p.bindings.find((b) => b.from === 'takeoff')?.to ?? null;
const btnOf = (p: BodyProfile, from: 'punch' | 'kick') => p.bindings.find((b) => b.from === from)?.to ?? null;
const FOOT = { L: 'left', R: 'right' } as const;
/** The truth has that foot touching down within MATCH_STEP_MS of t. */
const trueDown = (s: Stream, foot: 'L' | 'R', t: number) => s.gt.steps.some((q) => q.foot === FOOT[foot] && q.down && Math.abs(q.down.t - t) <= MATCH_STEP_MS);
/** The truth has that foot off the floor in the STEP_SWING_MS before t (the take's frames: the lead has no truth). */
function trueLift(s: Stream, foot: 'L' | 'R', t: number): boolean {
  const c = s.gt.perFrame.contact, i = foot === 'L' ? 0 : 1;
  for (let k = 0; k < c.length; k++) {
    const ft = s.frames[k + s.lead].t;
    if (ft >= t - STEP_SWING_MS && ft <= t && !c[k][i]) return true;
  }
  return false;
}
const trigOf = (p: BodyProfile) => { const b = p.bindings.find((x) => x.from === 'squat'); return b ? (b.to === 'RT' ? 'R' : 'L') : null; };
const ramp = (v: number) => Math.max(0, Math.min(1, (v - CROUCH_DEAD) / (CROUCH_FULL - CROUCH_DEAD)));
/** The hop pulses (splice excluded), each matched to the nearest true take-off within 350 ms (one each). */
function hopPulses(p: BodyProfile, s: Stream, r: SeamReplay) {
  const hop = hopOf(p);
  const presses = r.bus.filter((x) => hop && x.e.t === 'button' && x.e.btn === hop && x.e.pressed && !fromSplice(s, x));
  const used = new Set<Jump>();
  return presses.map((x) => {
    const j = s.jumps.filter((q) => !used.has(q) && Math.abs(x.t - q.takeoff) <= 350 && q.takeoff >= s.t0 + SPLICE_MS)
      .sort((a, b) => Math.abs(x.t - a.takeoff) - Math.abs(x.t - b.takeoff))[0] ?? null;
    if (j) used.add(j);
    return { x, jump: j };
  });
}

// ── THE GATE: every profile on every stream ──────────────────────────────────────────────────────────────────────

describe('THE GATE — every profile, every stream (the oracle derived from the bindings)', () => {
  it.each(PROFILES.map((p) => [p.key, p] as const))('%s', (_key, p) => {
    for (const s of streams()) {
      const tag = `${p.key} on ${s.name}`;
      const r = play(p, s, 'playing');
      const bus = r.bus;

      // ── ALL ──
      if (!p.bindings.length) expect(r.floor, `${tag}: a session-only profile writes nothing (Z3)`).toEqual([]);
      for (const x of [...bus, ...r.floor]) {
        expect(x.e.src, `${tag}: tagged`).toBe('body');
        expect(isWakeInput(x.e), `${tag}: never a wake`).toBe(false);
        expect(x.at, `${tag}: nothing before calibrated`).toBeGreaterThanOrEqual(r.calAt);
      }
      for (const x of bus.filter((y) => isPress(y.e))) {
        const rel = bus.find((y) => y.seq > x.seq && keyOf(y.e) === keyOf(x.e) && !isPress(y.e));
        expect(rel, `${tag}: ${keyOf(x.e)} at ${x.t.toFixed(0)} released`).toBeDefined();
        expect(rel!.at - x.at, `${tag}: pulse ${keyOf(x.e)} at ${x.t.toFixed(0)}`).toBeLessThanOrEqual(100);
      }
      expect(neutral(stateAt(bus, Infinity)), `${tag}: nothing held at the end`).toBe(true);
      let lastTrack = -Infinity, released = true;
      for (const st of r.steps) {
        if (st.tracking) { lastTrack = st.t; released = false; continue; }
        if (!released && st.t - lastTrack >= 100) {
          released = true;
          expect(neutral(stateAt(bus, st.seq + 1)), `${tag}: nothing held at lost + 100 ms (${lastTrack.toFixed(0)})`).toBe(true);
        }
      }
      // ── EXPLAINED ── every press, anywhere in the take, has its cause in the truth
      const punchBtn = btnOf(p, 'punch'), kickBtn = btnOf(p, 'kick'), hopBtn = hopOf(p);
      for (const x of bus.filter((y) => isPress(y.e) && !fromSplice(s, y))) {
        const e = x.e, evs = packetOf(s, x.frame)?.events ?? [];
        const why = `${tag}: ${keyOf(e)} at ${x.t.toFixed(0)} explained`;
        if (e.t === 'button' && e.btn === hopBtn) {
          expect(s.jumps.some((j) => Math.abs(x.t - j.takeoff) <= 350), `${why} (a true jump)`).toBe(true);
        } else if (e.t === 'button' && e.btn === punchBtn) {
          const ev = evs.find((q) => q.kind === 'punch');
          expect(!!ev && s.gt.wrist.some((w) => w.kind === 'punch' && Math.abs(w.at.t - ev.t) <= MATCH_ARM_MS), `${why} (a true punch)`).toBe(true);
        } else if (e.t === 'button' && e.btn === kickBtn) {
          const ev = evs.find((q) => q.kind === 'kick');
          expect(!!ev && s.gt.kicks.some((k) => Math.abs(k.at.t - ev.t) <= MATCH_ARM_MS), `${why} (a true kick)`).toBe(true);
        } else if (e.t === 'dpad') {
          const foot = e.dir === 'left' ? 'L' : e.dir === 'right' ? 'R' : null;
          const ev = evs.find((q): q is Extract<BodyEvent, { kind: 'step' }> => q.kind === 'step' && q.foot === foot);
          expect(!!ev && (trueDown(s, ev.foot, ev.t) || trueLift(s, ev.foot, ev.t)), `${why} (a true step)`).toBe(true);
        } else expect.fail(`${why}: no binding presses it`);
      }
      if (s.kind === 'shipped') continue;

      // ── REST ── (a cadence binding's own tail: the stride holds, then fades to exactly 0 by STRIDE_ZERO_MS after a step)
      // (after each step as the truth has it and as the reader told it: the cadence is the reader's)
      const stepsAt = [...s.gt.steps.flatMap((x) => (x.down ? [x.down.t] : [])), ...s.packets.flatMap((q) => q.events.filter((e) => e.kind === 'step').map((e) => e.t))];
      const rest = p.bindings.some((b) => b.from === 'cadence') ? cutAfter(s.rest, stepsAt, STRIDE_ZERO_MS + 34) : s.rest;
      for (const w of rest) {
        expect(bus.filter((x) => inWin(x.t, w)).map((x) => `${x.t.toFixed(0)} ${JSON.stringify(x.e)}`), `${tag}: REST ${w[0].toFixed(0)}–${w[1]}`).toEqual([]);
        for (const ph of ['ready', 'playing', 'paused'] as ModePhase[]) {
          const q = ph === 'playing' ? r : play(p, s, ph);
          expect(q.intents.filter((i) => inWin(i.t, w)).map((i) => i.intent), `${tag}: no intent in REST (${ph})`).toEqual([]);
        }
      }

      // ── JUMP ──
      const hop = hopOf(p), trig = trigOf(p);
      const pulses = hopPulses(p, s, r);
      const wins = s.jumps.map((j) => [j.takeoff - 700, j.landing + 500] as Win);
      for (const x of bus.filter((y) => isPress(y.e) && !fromSplice(s, y))) {
        const j = s.jumps.find((q, i) => inWin(x.t, wins[i]));
        if (!j) continue;
        const hopPress = pulses.find((q) => q.x === x);
        // RUN-UP: the approach's steps, up to the truth's take-off. In the named run-up takes any step; elsewhere a step
        // the truth has (the jump shot steps into its shot).
        const stepEv = packetOf(s, x.frame)?.events.find((e) => e.kind === 'step');
        const trueStep = !!stepEv && s.gt.steps.some((q) => q.down && Math.abs(q.down.t - stepEv.t) <= MATCH_STEP_MS);
        const runUpStep = x.e.t === 'dpad' && (s.runUp || trueStep) && s.jumps.some((q, i) => inWin(x.t, wins[i]) && x.t <= q.takeoff);
        expect(!!(hopPress?.jump) || runUpStep, `${tag}: no other press near a jump (${keyOf(x.e)} at ${x.t.toFixed(0)})`).toBe(true);
      }
      s.jumps.forEach((j, i) => {
        if (j.takeoff < s.t0 + SPLICE_MS) return;
        const jt = `${tag}: jump ${j.takeoff.toFixed(0)}`;
        const mine = pulses.filter((q) => q.jump === j);
        if (hop && !j.dangling) expect(mine.length, `${jt}: one pulse`).toBe(1);
        if (!hop) expect(mine.length, jt).toBe(0);
        const still: Win = [j.takeoff, j.landing + 250];
        const sticks = bus.filter((x) => x.e.t === 'stick' && inWin(x.t, still));
        if (!s.runUp) expect(sticks.map((x) => x.t), `${jt}: the stick never moves in a jump`).toEqual([]);
        else for (const x of sticks) expect((x.e as { y: number }).y, `${jt}: y held (run-up: x exempt)`).toBe(stateAt(bus, x.seq).y);
        if (!s.runUp) {
          expect(stateAt(bus, bus.find((x) => x.t >= wins[i][0])?.seq ?? Infinity).x, `${jt}: x ≡ 0 in place`).toBe(0);
          for (const x of bus.filter((y) => y.e.t === 'stick' && inWin(y.t, wins[i]))) expect((x.e as { x: number }).x, `${jt}: x ≡ 0 in place`).toBe(0);
        }
        if (trig) {
          const tr = bus.filter((x) => x.e.t === 'trigger' && inWin(x.t, still));
          for (const x of tr) {
            const before = stateAt(bus, x.seq);
            expect((x.e as { value: number }).value, `${jt}: the trigger never rises in a jump`).toBeLessThanOrEqual(trig === 'R' ? before.rt : before.lt);
          }
          const pulse = mine[0]?.x;
          if (pulse) {
            const after = r.steps.find((st) => st.seq > pulse.seq)!;
            expect(stateAt(bus, after.seq).rt, `${jt}: 0 from the pulse's own step`).toBe(0);
            for (const x of tr.filter((y) => y.seq > pulse.seq)) expect((x.e as { value: number }).value, `${jt}: 0 after the pulse`).toBe(0);
          }
        }
        expect(r.intents.filter((q) => inWin(q.t, wins[i])).map((q) => q.intent), `${jt}: no intent`).toEqual([]);
      });

      // ── DIP ──
      if (s.dip) {
        const w: Win = [s.dip.from - 100, s.dip.stand + 300];
        const dt = `${tag}: DIP`;
        expect(bus.filter((x) => isPress(x.e) && inWin(x.t, w)).length, `${dt}: no press`).toBe(0);
        for (const x of bus.filter((y) => y.e.t === 'stick' && inWin(y.t, w))) expect([(x.e as { x: number }).x, (x.e as { y: number }).y], dt).toEqual([0, 0]);
        const standSeq = r.steps.find((st) => st.t >= s.dip!.stand + 550)?.seq ?? Infinity;
        expect(stateAt(bus, standSeq), `${dt}: the trigger let go within 550 ms of standing`).toMatchObject({ rt: 0, lt: 0 });
        if (s.dip.cm === 10) expect(bus, `${dt}: a 10 cm duck is silent`).toEqual([]);
        if (!trig) expect(bus, `${dt}: nothing without a crouch binding`).toEqual([]);
      }
    }
  });

  it('covers what it claims: 28 profiles, 78 streams — 12 fixtures twice, 9 ducks, 45 scripts on three seeds', () => {
    const s = streams();
    expect(PROFILES).toHaveLength(28);
    expect(s.map((x) => x.kind).reduce<Record<string, number>>((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {})).toEqual({ fixture: 12, shipped: 12, duck: 9, script: 45 });
    const jumps = s.filter((x) => x.kind !== 'shipped').flatMap((x) => x.jumps.filter((j) => !j.dangling && j.takeoff >= x.t0 + SPLICE_MS));
    expect(jumps.length).toBeGreaterThanOrEqual(14 + 18 + 9);   // the fixtures' 14, the 18 scripted jumps, 9 in the dropout streams
    // REST has something to say on every stream but the as-shipped pass
    for (const x of s.filter((y) => y.kind !== 'shipped')) expect(x.rest.length, x.name).toBeGreaterThan(0);
  });
});

// ── the session ──────────────────────────────────────────────────────────────────────────────────────────────────

const SKATE = BODY_PROFILES.skateboard, DUNK = BODY_PROFILES.dunk;
/** The last tracked frame before a dropout of a stream: its packet (read.t capture ms, arrivedAt page ms). */
function lastSeenBefore(s: Stream, from: number): StreamPacket {
  const p = s.packets.filter((x) => x.read.tracking && x.read.t < from);
  return p[p.length - 1];
}

describe('the session rows', () => {
  it(`both hands up 1.2 s: START at ${START_HOLD_MS} ± 67 ms in READY; nothing while playing; the START pose presses nothing`, () => {
    // the combat rows are where the latch matters: the arms coming down from overhead read as punches (seed 23)
    for (const seed of SEEDS) {
      const s = stream(`hands up 1.2 s s${seed}`);
      const upAt = s.beats[1];
      for (const p of [SKATE, DUNK, bySkey('karate_vs'), bySkey('mixedcombat'), bySkey('showdown')]) {
        const r = machine(p, s, { start: 'ready' });
        const wake = r.intents.filter((i) => i.intent === 'wake');
        expect(wake, `${p.key} s${seed}`).toHaveLength(1);
        expect(Math.abs(wake[0].t - (upAt + START_HOLD_MS)), `${p.key} s${seed}: ${wake[0].t - upAt} ms into the hold`).toBeLessThanOrEqual(67);
        expect(r.phases.map((x) => x.phase)).toEqual(['ready', 'playing']);
        expect(r.floor, `${p.key} s${seed}: the START pose presses nothing`).toEqual([]);
        expect(play(p, s, 'playing').intents, `${p.key} s${seed}: playing`).toEqual([]);
      }
    }
  });

  it('never wakes on any other stream — the jump shot, the jumps with the arm swing, the dunk takes, the jog, the ducks', () => {
    for (const s of streams().filter((x) => !x.name.startsWith('hands up'))) {
      expect(play(SKATE, s, 'ready').intents.map((i) => i.intent), s.name).toEqual([]);
    }
  });

  it('a 400 ms ground dropout is lost and found and pauses nothing, even with the body driving', () => {
    for (const seed of SEEDS) {
      const s = stream(`ground dropout 400 ms s${seed}`);
      const kinds = s.packets.flatMap((p) => p.events.map((e) => e.kind));
      expect(kinds, `s${seed}`).toContain('lost');
      expect(kinds, `s${seed}`).toContain('found');
      const r = machine(SKATE, s);
      expect(r.evidence.body, `s${seed}: the body played (its hop)`).toBeGreaterThan(0);
      expect(r.phases.map((x) => x.phase), `s${seed}`).toEqual(['playing']);
    }
  });

  it(`2 s gone with the body driving: released first, then paused at lastSeen + ${LOST_PAUSE_MS} ± 34 ms (on the arrival clock)`, () => {
    for (const seed of SEEDS) {
      const s = droppable(seed, 'lean then gone 2 s', 2000);
      const r = machine(SKATE, s);
      const seenP = lastSeenBefore(s, DROP_AT(s.beats)), lastSeen = seenP.read.t;
      const pause = r.phases.find((x) => x.phase === 'paused');
      expect(pause?.why, `s${seed}`).toBe('body-lost');
      expect(Math.abs(pause!.at - (seenP.arrivedAt + LOST_PAUSE_MS)), `s${seed}: ${(pause!.at - seenP.arrivedAt).toFixed(0)} ms after the last frame arrived`).toBeLessThanOrEqual(34);
      const leanAt = r.bus.filter((x) => x.e.t === 'stick' && x.seq < pause!.seq && (x.e as { x: number }).x !== 0);
      expect(leanAt.length, `s${seed}: the lean was held`).toBeGreaterThan(0);
      const release = r.bus.find((x) => x.seq > leanAt[leanAt.length - 1].seq && x.e.t === 'stick');
      expect(release?.e, `s${seed}: released`).toEqual({ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' });
      expect(release!.seq, `s${seed}: before the pause`).toBeLessThan(pause!.seq);
      expect(release!.phase, `s${seed}: while still playing`).toBe('playing');
      const due = s.packets.find((q) => q.read.t >= lastSeen + 100)!;
      expect(release!.t, `s${seed}: by the first frame at lost + 100 ms`).toBeLessThanOrEqual(due.read.t);
    }
  });

  it('the same with a hand driving (a key press after the body\'s last) or a session-only mode: released, never paused', () => {
    for (const seed of SEEDS) {
      const s = droppable(seed, 'lean then gone 2 s', 2000);
      const dropAt = DROP_AT(s.beats);
      const keyAt = s.packets.find((p) => p.read.t >= dropAt - 400)!.arrivedAt;
      const r = machine(SKATE, s, { inputs: [{ at: keyAt, e: { t: 'button', btn: 'Y', pressed: true } }, { at: keyAt + 80, e: { t: 'button', btn: 'Y', pressed: false } }] });
      expect(r.evidence.external, `s${seed}`).toBe(1);
      expect(r.phases.map((x) => x.phase), `s${seed}: pad driving`).toEqual(['playing']);
      expect(neutral(stateAt(r.bus, r.steps.find((st) => st.t >= dropAt + 200)!.seq)), `s${seed}: released`).toBe(true);
      for (const p of PROFILES.filter((x) => !x.bindings.length)) {
        expect(machine(p, s).phases.map((x) => x.phase), `${p.key} s${seed}`).toEqual(['playing']);
      }
    }
  });

  it('resumed by a tap after a body-lost pause, seen, then gone again with no counted input: never paused again (P3 Z5)', () => {
    for (const seed of SEEDS) {
      // the body hops (the driver), then stands; gone 2 s (paused); back; a tap resumes; seen 400 ms standing; gone 2 s
      const s = scriptStream('lost, tap, gone', [['rest', hold(R0, 1.5)], ['move', jumpBeat(R0, 2.4)], ['rest', hold(R0, 6.5)]], seed,
        (b) => [{ from: b[2] + 800, to: b[2] + 2800 }, { from: b[2] + 3500, to: b[2] + 5500 }]);
      const tapAt = s.packets.find((q) => q.read.t >= s.beats[2] + 3100)!.arrivedAt;
      const r = machine(SKATE, s, { inputs: [{ at: tapAt, e: { t: 'button', btn: 'A', pressed: true } }, { at: tapAt + 80, e: { t: 'button', btn: 'A', pressed: false } }] });
      expect(r.evidence.body, `s${seed}: the body drove (its hop)`).toBeGreaterThan(0);
      expect(r.phases.map((x) => [x.phase, x.why]), `s${seed}`).toEqual([['playing', 'start'], ['paused', 'body-lost'], ['playing', 'input']]);
      expect(r.intents.map((i) => i.intent), `s${seed}`).toEqual(['pause-lost']);
    }
  });

  it('340 ms gone in the air through a confirmed flight: no pause (and the hop still pressed once)', () => {
    for (const seed of SEEDS) {
      const s = stream(`air dropout 340 ms s${seed}`);
      const r = machine(SKATE, s);
      expect(r.phases.map((x) => x.phase), `s${seed}`).toEqual(['playing']);
      expect(hopPulses(SKATE, s, r).filter((q) => q.jump).length, `s${seed}`).toBe(1);
    }
  });

  it('found while paused does not resume; a hands-up hold afterwards does', () => {
    for (const seed of SEEDS) {
      const s = droppable(seed, 'gone, back, hands up', 2000, [['rest', hold(LEANT, 1.2)], ['hands', hold(armsSwing(LEANT, 1), 1.2)], ['rest', hold(LEANT, 1.0)]]);
      const r = machine(SKATE, s);
      expect(r.phases.map((x) => [x.phase, x.why]), `s${seed}`).toEqual([['playing', 'start'], ['paused', 'body-lost'], ['playing', 'body']]);
      const found = s.packets.find((p) => p.events.some((e: BodyEvent) => e.kind === 'found'))!;
      const resume = r.phases[2];
      const upAt = s.beats[5];
      expect(found.read.t, `s${seed}`).toBeLessThan(upAt);
      expect(Math.abs(resume.t - (upAt + START_HOLD_MS)), `s${seed}: resumed ${(resume.t - upAt).toFixed(0)} ms into the hold`).toBeLessThanOrEqual(67);
      expect(r.intents.map((i) => i.intent), `s${seed}`).toEqual(['pause-lost', 'resume']);
    }
  });

  it('a final packet (the Body switched off) releases and does not pause', () => {
    for (const seed of SEEDS) {
      const s = scriptStream('crouch, then off', [['rest', hold(R0, 1.5)], ['move', [0.3, (t) => crouch(R0, 0.3 * t / 0.3)]], ['move', hold(crouch(R0, 0.3), 0.8)]], seed);
      const r = machine(SKATE, s);
      expect(r.phases.map((x) => x.phase), `s${seed}`).toEqual(['playing']);
      const last = r.bus[r.bus.length - 1];
      expect(r.bus.some((x) => x.e.t === 'trigger' && (x.e as { value: number }).value > 0.5), `s${seed}: crouched`).toBe(true);
      expect(last.e, `s${seed}`).toEqual({ t: 'trigger', side: 'R', value: 0, src: 'body' });
      expect(last.frame, `s${seed}: at the final packet`).toBe(s.packets[s.packets.length - 1].frame + 1);
    }
  });
});

// ── the evidence ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('the play evidence', () => {
  it('standing still is no play in any profile; a session-only profile gets no body evidence on any stream', () => {
    for (const p of PROFILES) {
      expect(play(p, stream('stand_still'), 'playing').evidence, p.key).toEqual({ body: 0, external: 0 });
      if (!p.bindings.length) for (const s of streams()) expect(play(p, s, 'playing').evidence.body, `${p.key} on ${s.name}`).toBe(0);
    }
  });
  it('skate counts its hops: ≥ 3 on each three-jump take, ≥ one per true jump on every jump take', () => {
    for (const s of streams().filter((x) => x.kind === 'fixture' && x.jumps.length)) {
      const n = play(SKATE, s, 'playing').evidence.body;
      const jumps = s.jumps.filter((j) => !j.dangling && j.takeoff >= s.t0 + SPLICE_MS).length;
      expect(n, s.name).toBeGreaterThanOrEqual(jumps >= 3 ? 3 : jumps);
    }
  });
});

// ── the positive checks: a silent floor cannot pass these ────────────────────────────────────────────────────────

describe('what the body does press', () => {
  it('VS, Mixed and Showdown on punch_kick: exactly the three punches as A (each within MATCH_ARM_MS of one) and the kick as B', () => {
    const s = stream('punch_kick');
    const punches = s.gt.wrist.filter((w) => w.kind === 'punch').map((w) => w.at.t);
    expect(punches).toHaveLength(3);
    expect(s.gt.kicks).toHaveLength(1);
    for (const key of ['karate_vs', 'mixedcombat', 'showdown']) {
      const r = play(bySkey(key), s, 'playing');
      const a = r.bus.filter((x) => x.e.t === 'button' && x.e.btn === 'A' && x.e.pressed);
      const b = r.bus.filter((x) => x.e.t === 'button' && x.e.btn === 'B' && x.e.pressed);
      expect(a.length, key).toBe(3);
      expect(b.length, key).toBe(1);
      // matched on the event's own instant (the frame that told it is later): each A to its own punch
      const told = s.packets.flatMap((p) => p.events).filter((e) => e.kind === 'punch').map((e) => e.t);
      punches.forEach((gt, i) => expect(Math.abs(told[i] - gt), `${key} punch ${i}`).toBeLessThanOrEqual(MATCH_ARM_MS));
      const kickT = s.packets.flatMap((p) => p.events).find((e) => e.kind === 'kick')!.t;
      expect(Math.abs(kickT - s.gt.kicks[0].at.t), key).toBeLessThanOrEqual(MATCH_ARM_MS);
      expect(r.evidence, key).toEqual({ body: 4, external: 0 });
    }
  });

  it('VS, Mixed and Showdown from a fighting stance held 16 and 20 cm down: the three jabs are A, the kick off the bent leg is B', () => {
    for (const seed of SEEDS) {
      for (const name of [...STANCE_CM.map((cm) => `stance ${cm} cm jabs`), 'stance 16 cm kick']) {
        const s = stream(`${name} s${seed}`);
        const kicks = name.endsWith('kick');
        // the stance is past the dead band (the old veto's line) on every strike, and the truth has the strikes
        const told = s.packets.flatMap((q) => q.events.filter((e) => e.kind === (kicks ? 'kick' : 'punch')).map((e) => ({ e, q })));
        const gt = kicks ? s.gt.kicks.map((k) => k.at.t) : s.gt.wrist.filter((w) => w.kind === 'punch').map((w) => w.at.t);
        expect(gt, s.name).toHaveLength(kicks ? 1 : 3);
        expect(told, s.name).toHaveLength(gt.length);
        for (const { e, q } of told) expect(q.read.squat!, `${s.name}: crouched at ${e.t.toFixed(0)}`).toBeGreaterThanOrEqual(CROUCH_DEAD);
        for (const key of ['karate_vs', 'mixedcombat', 'showdown']) {
          const r = play(bySkey(key), s, 'playing');
          const btn = kicks ? 'B' : 'A';
          const presses = r.bus.filter((x) => x.e.t === 'button' && x.e.pressed);
          expect(presses.map((x) => (x.e as { btn: string }).btn), `${key} on ${s.name}`).toEqual(gt.map(() => btn));
          told.forEach(({ e }, i) => expect(Math.abs(e.t - gt[i]), `${key} on ${s.name}: strike ${i}`).toBeLessThanOrEqual(MATCH_ARM_MS));
          expect(r.evidence, `${key} on ${s.name}`).toEqual({ body: gt.length, external: 0 });
        }
      }
    }
  });

  it('skate, snow and surf pop once per true jump on every take — no more, no fewer', () => {
    for (const key of ['skateboard', 'snowboard_slalom', 'surf']) {
      for (const s of streams().filter((x) => x.kind === 'fixture' || x.kind === 'script')) {
        const r = play(bySkey(key), s, 'playing');
        const pulses = hopPulses(bySkey(key), s, r);
        const graded = s.jumps.filter((j) => !j.dangling && j.takeoff >= s.t0 + SPLICE_MS);
        expect(pulses.filter((q) => !q.jump).map((q) => q.x.t), `${key} on ${s.name}: a pop with no jump`)
          .toEqual(pulses.filter((q) => !q.jump && s.jumps.some((j) => j.dangling && Math.abs(q.x.t - j.takeoff) <= 350)).map((q) => q.x.t));
        expect(pulses.filter((q) => q.jump && !q.jump.dangling).length, `${key} on ${s.name}`).toBe(graded.length);
      }
    }
  });

  it('THE POP SCALING: skate and snow carry the gather\'s depth on RT into the A (≥ 0.9 × its ramp), and RT is 0 the same step', () => {
    let deep = 0;
    for (const key of ['skateboard', 'snowboard_slalom']) {
      const p = bySkey(key);
      for (const s of streams().filter((x) => x.kind === 'fixture' || x.kind === 'script')) {
        const r = play(p, s, 'playing');
        for (const { x, jump } of hopPulses(p, s, r)) {
          if (!jump || jump.dangling) continue;
          const gather = s.packets.filter((q) => q.read.airborne === false && q.read.squat !== null && q.read.t >= jump.takeoff - PEAK_HOLD_MS && q.read.t <= jump.takeoff);
          const peak = Math.max(0, ...gather.map((q) => q.read.squat!));
          const rtAtA = stateAt(r.bus, x.seq).rt;
          const tag = `${key} on ${s.name}: jump ${jump.takeoff.toFixed(0)} (peak squat ${peak.toFixed(2)})`;
          expect(rtAtA, tag).toBeGreaterThanOrEqual(0.9 * ramp(peak));
          const after = r.steps.find((st) => st.seq > x.seq)!;
          expect(stateAt(r.bus, after.seq).rt, tag).toBe(0);
          if (ramp(peak) >= 0.3) deep++;
        }
      }
    }
    expect(deep, 'deep gathers reached a pop').toBeGreaterThanOrEqual(20);
  });

  it('Sprint and Big Air on run_in_place: one d-pad pulse per step the reader read, ◀ for the left foot, ▶ for the right', () => {
    const s = stream('run_in_place');
    const steps = s.packets.flatMap((p) => p.events.filter((e): e is Extract<BodyEvent, { kind: 'step' }> => e.kind === 'step'));
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const key of ['sprint', 'bigair']) {
      const d = play(bySkey(key), s, 'playing').bus.filter((x) => x.e.t === 'dpad' && x.e.pressed).map((x) => (x.e as { dir: string }).dir);
      expect(d, key).toEqual(steps.map((e) => (e.foot === 'L' ? 'left' : 'right')));
    }
  });

  it('Free Run runs in place: y ≤ −0.3 while stepping, 0 within 700 ms of the last step, and x ≡ 0 despite the drift', () => {
    const p = bySkey('freerun');
    for (const s of [stream('run_in_place'), ...SEEDS.map((sd) => stream(`jog 3 Hz s${sd}`))]) {
      const r = play(p, s, 'playing');
      const steps = s.packets.flatMap((q) => q.events.filter((e) => e.kind === 'step'));
      const last = steps[steps.length - 1];
      const sticks = r.bus.filter((x) => x.e.t === 'stick');
      const first = sticks.find((x) => (x.e as { y: number }).y !== 0)!;
      expect(first, s.name).toBeDefined();
      for (const x of sticks) expect((x.e as { x: number }).x, s.name).toBe(0);
      for (const x of sticks.filter((y) => y.t >= first.t && y.t <= last.seen)) expect((x.e as { y: number }).y, `${s.name} at ${x.t.toFixed(0)}`).toBeLessThanOrEqual(-0.3);
      const zeroAt = r.steps.find((st) => st.t >= last.t + 700 + 34)?.seq ?? Infinity;
      expect(stateAt(r.bus, zeroAt).y, s.name).toBe(0);
    }
    const drift = stream('run_in_place').packets.map((q) => q.read.lean?.sideSw ?? 0);
    expect(Math.min(...drift)).toBeLessThan(-0.5);                  // the drift a lean steer would have steered on
  });

  it('skate on shuffle_lateral: the lean follows the body\'s side (the image\'s left is the player\'s right) and reaches |x| ≥ 0.8', () => {
    const s = stream('shuffle_lateral');
    const r = play(SKATE, s, 'playing');
    const hipX = (f: PoseFrame) => (f.image[23].x + f.image[24].x) / 2;
    const standX = hipX(s.frames[0]);
    const sticks = r.bus.filter((x) => x.e.t === 'stick' && Math.abs((x.e as { x: number }).x) >= 0.1);
    expect(sticks.length).toBeGreaterThan(5);
    for (const x of sticks) {
      const f = s.frames[x.frame + s.lead];
      expect(Math.sign((x.e as { x: number }).x), `at ${x.t.toFixed(0)}`).toBe(Math.sign(-(hipX(f) - standX)));
    }
    expect(Math.max(...sticks.map((x) => Math.abs((x.e as { x: number }).x)))).toBeGreaterThanOrEqual(0.8);
  });

  it('a hand and the body compose: a pad\'s y with the body\'s lean; a seated pad at rest carries the body\'s crouch on RT', () => {
    // a key push forward (y −0.8) while the body shuffles sideways: the mode gets both axes
    const sh = stream('shuffle_lateral');
    const at = sh.packets.find((q) => q.read.t >= 3500)!.arrivedAt + 1;
    const r = machine(SKATE, sh, { inputs: [{ at, e: { t: 'stick', side: 'L', x: 0, y: -0.8 } }] });
    const after = r.events.filter((x) => x.e.t === 'stick' && x.at >= at && x.at < at + 600);
    expect(after.length).toBeGreaterThan(1);
    for (const x of after) {
      expect((x.e as { y: number }).y).toBe(-0.8);
      expect((x.e as { x: number }).x).toBeGreaterThan(0.3);
    }
    // a pad seated and at rest (its trigger 0 every frame) under a 30 cm duck: the mode sees the crouch, then 0
    const duck = stream('duck 30 cm s17');
    const q = machine(SKATE, duck, { padSeated: true });
    const rt = q.events.filter((x) => x.e.t === 'trigger' && x.e.side === 'R');
    expect(rt.length).toBeGreaterThan(100);                          // every render tick
    const peak = Math.max(...rt.map((x) => (x.e as { value: number }).value));
    expect(peak).toBeGreaterThanOrEqual(0.6);
    const top = rt.find((x) => (x.e as { value: number }).value === peak)!;
    expect(top.e.src).toBe('body');
    expect((rt[rt.length - 1].e as { value: number }).value).toBe(0);
    expect(rt[rt.length - 1].e.src).toBeUndefined();                // the pad's own 0 again
  });

  it('a pad\'s START in the middle of a crouch: the mode sees the body let go of RT, down to the pad\'s value, BEFORE it pauses', () => {
    // the step-3 review: "releases FIRST, still playing" did not hold for a trigger with a pad seated — the let-go
    // waited for the next pad frame, which reached a paused game and was dropped, so the mode held the crouch through
    // the pause (and SkateRun read its end, on the first frame after the resume, as a charged pop)
    const duck = stream('duck 30 cm s17');
    const rtOf = (r: SeamReplay) => r.events.filter((x) => x.e.t === 'trigger' && x.e.side === 'R');
    const val = (x: SeamEmitted) => (x.e as { value: number }).value;
    const free = machine(SKATE, duck, { padSeated: true });
    const top = rtOf(free).reduce((a, b) => (val(b) > val(a) ? b : a));
    expect(val(top)).toBeGreaterThanOrEqual(0.6);
    const q = machine(SKATE, duck, { padSeated: true, inputs: [{ at: top.at + 1, e: { t: 'button', btn: 'START', pressed: true } }] });
    const paused = q.phases.find((p) => p.phase === 'paused')!;
    expect(paused.why).toBe('input');
    const before = rtOf(q).filter((x) => x.seq < paused.seq);
    expect(val(before[before.length - 2])).toBeGreaterThanOrEqual(0.6);   // crouching up to the press…
    expect(before[before.length - 1].e).toStrictEqual({ t: 'trigger', side: 'R', value: 0, src: 'body' });   // …let go first
    expect(rtOf(q).filter((x) => x.seq > paused.seq)).toEqual([]);        // nothing reaches a paused game
  });
});
