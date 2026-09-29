// _ride-body-live — movement play P8's live check (2026-09-26): the boards and the racers played by the body, on the real
// running modes. No camera: frames go in through window.__FEL_POSE_FEED__, the Body button is __FEL_BODY__.start() (P3's
// self-calibrating reader, as _body-seam-live), and what the MODE did is read off the bus, QA and each mode's own read-only
// seam (__FEL_DEV__.skate(), scene.metadata.<mode>.state()).
//
// One continuous session per mode (a player does not step out between moves), on /dev/mode/<key>?agent=1, labelled beat
// by beat (PLAN-P8 §9):
//   L1 READY   the facing stand and (a board) the turn into the stance and its still hold keep READY: 0 body inputs;
//   L2 START   both hands up — from the stance on a board — wakes the game;
//   L3 QUIET   rest, idle sway, a wave and a stretch, a walk and a jog in place (kart, plane); on a board the nose / tail
//              shift, the head turn and shoulder check, a 20 cm crouch, a wave and a stretch in the stance: every body
//              input on the bus is one the row allows there (the crouch's trigger; surf's trim inside the crouch), 0 mode
//              intents (grab / spin / push / cutback / drift), and the board's heading still;
//   L4 FOLLOW  toe / heel at 12° and 8° (the stick's sign by the lead, |x| by depth, the heading turned that way); a hop
//              (one POP), a backside quarter in a hop (the spin named), a hop with the rear hand at the toe edge (the grab
//              named), two kick-pushes (skate); the wheel at 15° / 30° / 60° each way and a hop into 30° (the kart's
//              gas, steer, heading and drift); the wings banked and pitched (the plane's gas, steer, heading, climb);
//              a run, high knees, a hop (Free Run's speed band and SPRINT); the sprint's jog to the tape; big air's run-up;
//   L5 PHASES  big air: steps in the Air phase ignored (0 spin-direction changes while flying); sprint: a jog before the
//              gun is a false start, the reaction timed on the capture clock;
//   L6 LOST    a 2 s dropout pauses a driven game; both hands up resumes it (P3's session, unchanged by P8);
//   L8 LATENCY QA's bodyLog (now − ev.t per kind) and the bus's bodyStats;
//   L9 COST    the seam's per-frame cost in the page (frames pushed synchronously), and the ride read's own share in node;
//   L1b STANCE (STANCE=1, board modes; REQUIRED — PLAN-P8 R-F1) the READY screen's stance line through the shipping host
//              (/dev/body/<key>: the splash, the space check — _space-check-live's flow): after "All set", the ask with its
//              ring, then REGULAR once a side-on stance is held (data-fel-body-stance on the panel's line), the check still
//              'ready' through the turn (it dropped back to the framing before R-F1);
//   L2b START FROM THE STANCE (with L1b) both hands up while side-on → playing, and the stance taken at READY survives the
//              latch (the session's stance still REGULAR), then a toe lean steers (the carve on the shipping path);
//   L3b REAL  (kart, plane) the twelve P1 takes — the owner's own recordings and the CMU ones, each after its stand — fed
//              through the same page while playing: not one body input (PLAN-P8 R-F2's G1-R, live);
//   L2c RACE START (RACESTART=1, kart, plane; review fix 2026-09-26) the count after a body's START: arms dropped straight
//              onto the wheel / out as wings the moment the game wakes, and arms that wait and take it on "2" — the mode's own
//              `[RACE] start` outcome (its read-only seam) and when the gas went down after the wake;
//   L7 PAD     (PAD=1) the Body off, the same game driven by external input through InputBus.emit (the touch deck's road into
//              the arbiter; a pad's FelInput is the same shape): the stick steers, A pops, the gas goes, and no body verb
//              fires. The before / after on the P8 base (_trigger-count, _controller-stick-live-smoke) needs a second
//              server of the base tree, which this pass's rules do not allow; the offline G10 covers the cores.
// The kart and the plane need NEXT_PUBLIC_FEL_BODY_RIDE=velocitykart,aeroaces on the dev server (their rows are session-only
// until this probe measures 0 misfires in them — the owner's call).
//
//   BASE=http://localhost:3095 MODES=skateboard,snowboard_slalom PATH=/opt/homebrew/bin:$PATH \
//     node node_modules/tsx/dist/cli.mjs scripts/probes/_ride-body-live.mts
//   DRY=1 …   builds the sessions and times the ride read in node only
//   SHOTS=<dir> …   a screenshot per mode after the follow
// It needs a `next dev` of the tree under test (/dev/mode 404s under `next start`), no .env, no login. It starts no server.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as rkNs from '../../lib/pose/rideKit.ts';
import * as readerNs from '../../lib/pose/BodyReader.ts';
import * as chNs from '../../lib/pose/bodyChannels.ts';
import * as profNs from '../../lib/input/bodyProfiles.ts';
import * as rpNs from '../../lib/input/rideProfiles.ts';
import * as grNs from '../../lib/pose/grade.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';
import type { Joints } from '../../lib/pose/synth.ts';
import type { BodyProfile } from '../../lib/input/bodyProfiles.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { restPose, synthesize, bodyAxes } = unwrap(synNs);
const { script, hold, jumpBeat, crouch, armsSwing, dropout, spaceSession, holdStill, scriptedJump } = unwrap(kitNs);
const {
  stanceBase, inStance, edgeTilt, noseTailTilt, grabHopBeat, turnBeat, turnHopBeat, kickPushBeat, wheelArms, wingArms,
  waveBeat, stretchBeat, swayBeat, runBeat, lerpJoints, turnAbout,
} = unwrap(rkNs);
const { BodyReader } = unwrap(readerNs);
const { ChannelReader } = unwrap(chNs);
const { BODY_PROFILES } = unwrap(profNs);
const { RIDE_ROWS_ON } = unwrap(rpNs);
const { standFrame, STAND_SEC } = unwrap(grNs);
type Beat = [number, (t: number) => Joints];

const BASE = (process.env.BASE ?? 'http://localhost:3095').replace(/\/$/, '');
const ALL = ['skateboard', 'snowboard_slalom', 'surf', 'freerun', 'sprint', 'bigair', 'velocitykart', 'aeroaces'];
const MODES = (process.env.MODES ?? ALL.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.env.DRY === '1';
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ── the sessions (node side; the feed retimes t and arrive onto the page clock) ─────────────────────────────────────

const R0 = restPose();
const UP = armsSwing(R0, 1);
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
interface Session { name: string; frames: PoseFrame[]; marks: Record<string, number>; beats: { name: string; from: number; to: number }[]; t0: number; pads?: { atMs: number; e: BusE }[] }
/** Named beats → a synthesized session (30 fps, seed), each beat's [from, to] in capture ms; `gap` = a dropout's beat name. */
function session(name: string, beats: [string, Beat][], seed: number, gap?: string | string[]): Session {
  const marks: Record<string, number> = {};
  const spans: Session['beats'] = [];
  let t = 0;
  for (const [n, b] of beats) { marks[n] ??= t; spans.push({ name: n, from: t, to: t + b[0] * 1000 }); t += b[0] * 1000; }
  marks.end = t;
  let frames = synthesize(script(beats.map((b) => b[1])), { seed, fps: 30, latencyMs: 80, latencyJitterMs: 15 }).frames as PoseFrame[];
  for (const nm of gap === undefined ? [] : Array.isArray(gap) ? gap : [gap]) { const g = spans.find((s) => s.name === nm)!; frames = dropout(frames, g.from, g.to); }
  return { name, frames, marks, beats: spans, t0: frames[0].t };
}
const THETA = 45, LEAD = 'L' as const;   // a regular rider (left foot forward), 45° off square
const base = stanceBase(), ST = inStance(base, THETA, LEAD);
const turned = (j: Joints) => inStance(j, THETA, LEAD);
const tilt = (nm: string, deg: number, hold2 = 1.3): [string, Beat][] => [
  [`${nm}In`, [0.3, (t) => edgeTilt(ST, deg * ease(t / 0.3))]], [nm, hold(edgeTilt(ST, deg), hold2)], [`${nm}Out`, [0.3, (t) => edgeTilt(ST, deg * (1 - ease(t / 0.3)))]], [`${nm}Rest`, hold(ST, 1.0)],
];
const low = inStance(crouch(base, 0.2), THETA, LEAD);
const hop: Beat = (() => { const J = jumpBeat(base, 2.4, 0.25); return [J[0], (t) => turned(J[1](t))]; })();
const push: Beat = (() => { const P = kickPushBeat(base, LEAD); return [P[0], (t) => turned(P[1](t))]; })();
/** The lead / rear hand at the board's edge in a hop: the rear hand of a regular rider is the right. */
const grabHop = grabHopBeat(base, 2.8, 'Right', 'toe', 0.12, turned);
/** Backside for a regular rider: the back turned to the lens (turnBody −). */
const bsHop = turnHopBeat(base, 2.8, -90, turned);
const headTurn: Beat = [1.2, (t) => {
  const j = ST, o = { ...j }, pv = j.Neck, a = (45 * Math.sin(Math.PI * Math.min(1, t / 1.2)) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const x = j.Head[0] - pv[0], z = j.Head[2] - pv[2];
  o.Head = [pv[0] + x * c + z * sn, j.Head[1], pv[2] - x * sn + z * c];
  return o;
}];
const armsUpFrom = (j: Joints): [string, Beat][] => [['armsIn', [0.3, (t) => lerpJoints(j, armsSwing(j, 1), ease(t / 0.3))]], ['armsUp', hold(armsSwing(j, 1), 1.3)], ['armsOut', [0.3, (t) => lerpJoints(armsSwing(j, 1), j, ease(t / 0.3))]]];
const lost = (j: Joints): [string, Beat][] => [['preLost', hold(j, 1.2)], ['gone', hold(j, 2.0)], ['back', hold(j, 1.5)], ...armsUpFrom(j).map(([n, b]) => [`re${n}`, b] as [string, Beat]), ['end', hold(j, 1.2)]];

/** Review fix (2026-09-26): the stance kept through a 'lost' — a 450 ms dropout onto a held toe edge, then the true stance —
 *  and the axes re-taken when the rider squares up 30° toward the screen, then a backside hop turn from there. */
const EDGE8 = edgeTilt(ST, 8);
const SQ = turnAbout(ST, 30);
const sqBsHop = turnHopBeat(base, 2.8, -90, (j: Joints) => turnAbout(turned(j), 30));
const keptBeats: [string, Beat][] = [
  ['kGap', [0.45, (t) => lerpJoints(ST, EDGE8, ease(t / 0.3))]], ['kEdge', hold(EDGE8, 1.5)], ['kOut', [0.3, (t) => lerpJoints(EDGE8, ST, ease(t / 0.3))]], ['kRest', hold(ST, 2.5)],
  ['sqTurn', [1.5, (t) => turnAbout(ST, 30 * ease(t / 1.5))]], ['sqHeld', hold(SQ, 2.5)], ['sqBs', sqBsHop], ['sqRest', hold(SQ, 1.8)],
  ['sqBack', [1.0, (t) => turnAbout(ST, 30 * (1 - ease(t / 1.0)))]], ['sqBackRest', hold(ST, 1.5)],
];
function boardSession(key: string): Session {
  const beats: [string, Beat][] = [
    ['face', hold(R0, 2.2)], ['turnIn', [0.5, (t) => lerpJoints(R0, ST, ease(t / 0.5))]], ['take', hold(ST, 1.6)],
    ...armsUpFrom(ST), ['settle', hold(ST, 1.0)],
    // L3 QUIET
    ['qRest', hold(ST, 3.0)], ['qSway', swayBeat(ST, 4)],
    ['qNoseIn', [0.3, (t) => noseTailTilt(ST, 12 * ease(t / 0.3))]], ['qNose', hold(noseTailTilt(ST, 12), 1.3)], ['qNoseOut', [0.3, (t) => noseTailTilt(ST, 12 * (1 - ease(t / 0.3)))]],
    ['qTailIn', [0.3, (t) => noseTailTilt(ST, -12 * ease(t / 0.3))]], ['qTail', hold(noseTailTilt(ST, -12), 1.3)], ['qTailOut', [0.3, (t) => noseTailTilt(ST, -12 * (1 - ease(t / 0.3)))]],
    ['qRest2', hold(ST, 0.8)], ['qLook', headTurn], ['qRest3', hold(ST, 0.6)], ['qCheck', turnBeat(ST, 30)], ['qRest4', hold(ST, 1.2)],
    ['qCrouchDown', [0.4, (t) => lerpJoints(ST, low, ease(t / 0.4))]], ['qCrouch', hold(low, 0.6)], ['qCrouchUp', [0.4, (t) => lerpJoints(low, ST, ease(t / 0.4))]], ['qRest5', hold(ST, 1.6)],
    ['qWave', waveBeat(ST, 3)], ['qRest6', hold(ST, 1.0)], ['qStretch', stretchBeat(ST, 4)], ['qRest7', hold(ST, 1.6)],
    // L4 FOLLOW
    ...tilt('toe12', 12), ...tilt('heel12', -12), ...tilt('toe8', 8), ...tilt('heel8', -8),
    ['hop', hop], ['hopRest', hold(ST, 1.8)],
    ['bs', bsHop], ['bsRest', hold(ST, 1.8)],
    ['grab', grabHop], ['grabRest', hold(ST, 1.8)],
    ...(key === 'skateboard' ? [['push1', push], ['pushRoll1', hold(ST, 1.0)], ['push2', push], ['pushRoll2', hold(ST, 1.2)]] as [string, Beat][] : []),
    ...keptBeats,
    // review fix: a PAD pop, then the body's hop told ~140 ms later — the body coyote must not jump the rider again mid-air
    ...(key !== 'surf' ? [['padHop', hop], ['padHopRest', hold(ST, 1.8)]] as [string, Beat][] : []),
    ...lost(ST),
  ];
  const ses = session(`${key} session`, beats, 29, ['gone', 'kGap']);
  if (key !== 'surf') {
    const tOff = scriptedJump(base, 2.4, 0.25).tOff * 1000;
    const at = ses.marks.padHop + tOff;
    ses.pads = [{ atMs: at, e: { t: 'button', btn: 'A', pressed: true } }, { atMs: at + 100, e: { t: 'button', btn: 'A', pressed: false } }];
  }
  return ses;
}
function kartSession(): Session {
  const g0 = wheelArms(R0, 0);
  const wheel = (nm: string, deg: number, hopIt = false): [string, Beat][] => {
    const J = jumpBeat(wheelArms(R0, deg), 2.4, 0.2);
    return [
      [`${nm}In`, [0.35, (t) => wheelArms(R0, deg * ease(t / 0.35))]],
      hopIt ? [nm, [J[0] + 0.6, (t) => (t < J[0] ? wheelArms(J[1](t), deg) : wheelArms(R0, deg))]] : [nm, hold(wheelArms(R0, deg), 1.3)],
      [`${nm}Out`, [0.35, (t) => wheelArms(R0, deg * (1 - ease(t / 0.35)))]], [`${nm}Centre`, hold(g0, 0.8)],
    ];
  };
  return session('kart session', [
    ['face', hold(R0, 2.2)], ...armsUpFrom(R0), ['settle', hold(R0, 1.0)],
    ['qRest', hold(R0, 3.0)], ['qSway', swayBeat(R0, 4)], ['qWave', waveBeat(R0, 3)], ['qRest2', hold(R0, 0.8)], ['qStretch', stretchBeat(R0, 4.5)], ['qRest3', hold(R0, 1.0)],
    ['qWalk', runBeat(R0, 4, 1.6, 0.08)], ['qRest4', hold(R0, 1.5)], ['qJog', runBeat(R0, 4, 3.0, 0.18)], ['qRest5', hold(R0, 1.5)],
    ['grip', [0.5, (t) => wheelArms(R0, 0, ease(t / 0.5))]], ['centre', hold(g0, 1.0)],
    ...wheel('r15', 15), ...wheel('l15', -15), ...wheel('r30', 30), ...wheel('l30', -30), ...wheel('r60', 60), ...wheel('l60', -60),
    ...wheel('hop30', 30, true), ...wheel('hop10', 10, true),
    ['letGo', [0.5, (t) => wheelArms(R0, 0, 1 - ease(t / 0.5))]], ['down', hold(R0, 1.2)],
    ...lost(R0),
  ], 41, 'gone');
}
function aeroSession(): Session {
  const w0 = wingArms(R0, 0, 0);
  const wing = (nm: string, b: number, p: number): [string, Beat][] => [
    [`${nm}In`, [0.35, (t) => wingArms(R0, b * ease(t / 0.35), p * ease(t / 0.35))]], [nm, hold(wingArms(R0, b, p), 1.3)],
    [`${nm}Out`, [0.35, (t) => wingArms(R0, b * (1 - ease(t / 0.35)), p * (1 - ease(t / 0.35)))]], [`${nm}Level`, hold(w0, 0.7)],
  ];
  return session('aero session', [
    ['face', hold(R0, 2.2)], ...armsUpFrom(R0), ['settle', hold(R0, 1.0)],
    ['qRest', hold(R0, 3.0)], ['qSway', swayBeat(R0, 4)], ['qWave', waveBeat(R0, 3)], ['qRest2', hold(R0, 0.8)], ['qStretch', stretchBeat(R0, 4.5)], ['qRest3', hold(R0, 1.0)],
    ['qWalk', runBeat(R0, 4, 1.6, 0.08)], ['qRest4', hold(R0, 1.5)], ['qJog', runBeat(R0, 4, 3.0, 0.18)], ['qRest5', hold(R0, 1.5)],
    ['spread', [0.5, (t) => wingArms(R0, 0, 0, ease(t / 0.5))]], ['level', hold(w0, 1.0)],
    ...wing('bankR', 20, 0), ...wing('bankL', -20, 0), ...wing('bankR35', 35, 0), ...wing('up', 0, 20), ...wing('down', 0, -20),
    ['fold', [0.5, (t) => wingArms(R0, 0, 0, 1 - ease(t / 0.5))]], ['down2', hold(R0, 1.2)],
    ...lost(R0),
  ], 53, 'gone');
}
function freerunSession(): Session {
  const J = jumpBeat(R0, 2.4, 0.25);
  return session('freerun session', [
    ['face', hold(R0, 2.2)], ...armsUpFrom(R0), ['settle', hold(R0, 1.0)],
    ['qRest', hold(R0, 3.0)], ['qSway', swayBeat(R0, 3)], ['qWave', waveBeat(R0, 3)], ['qRest2', hold(R0, 0.8)], ['qStretch', stretchBeat(R0, 4.5)], ['qRest3', hold(R0, 1.5)],
    ['walk', runBeat(R0, 4, 1.6, 0.08)], ['walkRest', hold(R0, 1.5)],
    ['run', runBeat(R0, 5, 3.0, 0.18)], ['runRest', hold(R0, 1.5)],
    ['knees', runBeat(R0, 4, 3.8, 0.5)], ['kneesRest', hold(R0, 1.5)],
    ['hop', J], ['hopRest', hold(R0, 1.5)],
    ...lost(R0),
  ], 17, 'gone');
}
function sprintSession(): Session {
  // the hands up wakes it; the jog starts AT once (before READY → SET → GO's 1.6 s): a false start. A still stand through
  // the next gun, then the jog to the tape.
  return session('sprint session', [
    ['face', hold(R0, 2.2)], ...armsUpFrom(R0),
    ['early', runBeat(R0, 1.2, 3.1, 0.18)], ['blocks', hold(R0, 3.2)],
    ['jog', runBeat(R0, 19, 3.1, 0.18)], ['after', hold(R0, 2.0)],
  ], 23);
}
function bigairSession(): Session {
  // a run-up jog that keeps going through the flight (steps in the Air phase must not steer the spin), then a stand;
  // a second run-up, and quarter turns every 1.3 s through the second flight (one plants the spin)
  const turns: [string, Beat][] = [];
  for (let i = 0; i < 4; i++) turns.push([`turn${i}`, turnBeat(R0, 90, 0.3, 0.4, 0.4)], [`turnRest${i}`, hold(R0, 0.4)]);
  return session('bigair session', [
    ['face', hold(R0, 2.2)], ...armsUpFrom(R0), ['settle', hold(R0, 0.5)],
    ['run1', runBeat(R0, 8, 3.1, 0.18)], ['stand1', hold(R0, 3.5)],
    ['run2', runBeat(R0, 4.2, 3.1, 0.18)], ...turns, ['stand2', hold(R0, 3)],
  ], 47);
}
const SESSIONS: Record<string, () => Session> = {
  skateboard: () => boardSession('skateboard'), snowboard_slalom: () => boardSession('snowboard_slalom'), surf: () => boardSession('surf'),
  velocitykart: kartSession, aeroaces: aeroSession, freerun: freerunSession, sprint: sprintSession, bigair: bigairSession,
};

/** The ride read's share of the seam, in node: the channels stepped with the frame (the ride read) vs without. */
function nodeCost(): { withRide: { median: number; p90: number }; without: { median: number; p90: number }; rideShareMs: number; frames: number } {
  const s = boardSession('skateboard');
  const time = (ride: boolean) => {
    const ms: number[] = [];
    for (let k = 0; k < 3; k++) {
      const r = new BodyReader(), c = new ChannelReader({ calibration: () => r.calibration });
      for (const f of s.frames) { const t = performance.now(); const { read, events } = r.read(f); if (ride) c.step(read, events, f); else c.step(read, events); ms.push(performance.now() - t); }
    }
    ms.sort((a, b) => a - b);
    return { median: +ms[ms.length >> 1].toFixed(4), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(4) };
  };
  const a = time(true), b = time(false);
  return { withRide: a, without: b, rideShareMs: +(a.median - b.median).toFixed(4), frames: s.frames.length };
}

if (DRY) {
  console.log(JSON.stringify({ sessions: MODES.map((k) => { const s = SESSIONS[k](); return { key: k, frames: s.frames.length, sec: +(s.marks.end / 1000).toFixed(1) }; }), nodeCostMs: nodeCost() }, null, 1));
  process.exit(0);
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────

type BusE = { t: string; btn?: string; dir?: string; pressed?: boolean; side?: string; x?: number; y?: number; value?: number; src?: string };
interface Tap { bus: { at: number; e: BusE }[]; phases: { at: number; phase: string }[]; polls: { at: number; s: any }[]; logs: { at: number; text: string }[] }

/** Each mode's read-only state, compact (polled every 50 ms). */
const POLL: Record<string, string> = {
  skateboard: `(() => { const s = w.__FEL_DEV__.skate?.(); return s ? { h: s.rot.y, sp: +s.speed.toFixed(2), air: !s.grounded, chain: s.chainNow, b: s.body } : null; })()`,
  snowboard_slalom: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.snow?.state(); return s ? { h: s.heading, sp: s.speed, air: !s.grounded, b: s.body } : null; })()`,
  surf: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.surf?.state(); return s ? { h: s.heading, air: !s.grounded, trim: s.trim, pumps: s.pumps, b: s.body } : null; })()`,
  freerun: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.freerun?.state(); return s ? { sp: s.speed, st: s.state, z: s.z } : null; })()`,
  sprint: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.sprint?.state(); return s ? { phase: s.phase, d: s.distanceM, fs: s.falseStarts, fin: s.finishTimeS, react: s.reactS, b: s.body, cad: s.cadence, rival: s.rivalDist } : null; })()`,
  bigair: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.bigair?.state(); return s ? { phase: s.phase, dir: s.spinDir, spin: s.spinning, turns: s.spinTurns, att: s.attempt, grade: s.lastGrade, rot: s.lastRotations, named: s.named, b: s.body, sp: s.speed } : null; })()`,
  velocitykart: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.kart?.state(); return s ? { h: s.heading, sp: s.speed, start: s.start, ev: s.events } : null; })()`,
  aeroaces: `(() => { const s = w.__FEL_DEV__.scene?.metadata?.aero?.state(); return s ? { h: s.heading, y: s.pos ? +s.pos.y.toFixed(2) : null, sp: s.speed, stunt: s.stunt, start: s.start, lat: s.lateral, cor: s.corridor } : null; })()`,
};

async function open(p: Page, key: string): Promise<void> {
  await p.goto(`${BASE}/dev/mode/${key}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_DEV__?.input && !!w.__FEL_QA__
      && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300_000, polling: 250 });
  await p.evaluate(async (poll) => {
    const w = window as any, bus = w.__FEL_DEV__.input;
    const tap: Tap = { bus: [], phases: [], polls: [], logs: [] };
    w.__RIDE = tap;
    bus.on((e: BusE) => tap.bus.push({ at: performance.now(), e }));
    let last = '';
    const read = new Function('w', `return ${poll};`) as (w: unknown) => unknown;
    setInterval(() => {
      const m = /DEV · \S+ · (\w+)/.exec(document.body.innerText);
      if (m && m[1] !== last) { last = m[1]; tap.phases.push({ at: performance.now(), phase: last }); }
    }, 20);
    setInterval(() => { try { tap.polls.push({ at: performance.now(), s: read(w) }); } catch { /* a mode mid-teardown */ } }, 50);
    w.__FEL_POSE_FEED__.begin();
    await w.__FEL_BODY__.start({ autoCalibrate: true });
  }, POLL[key]);
}
async function play(p: Page, s: Session): Promise<{ from: number; to: number }> {
  // (a session's pad presses, s.pads, go through the bus at their capture instant on the feed's clock: the touch deck's road)
  return p.evaluate(async ({ frames, pads, t0 }) => {
    const w = window as any, feed = w.__FEL_POSE_FEED__;
    const from = performance.now();
    for (const x of pads) setTimeout(() => w.__FEL_DEV__.input.emit(x.e), x.atMs - t0);
    await feed.play(frames);
    await new Promise((r) => setTimeout(r, 400));
    return { from, to: performance.now() };
  }, { frames: s.frames, pads: s.pads ?? [], t0: s.t0 });
}
const tapOf = (p: Page) => p.evaluate(() => (window as any).__RIDE as Tap);

// ── the grading helpers ──────────────────────────────────────────────────────────────────────────────────────────

const phaseAt = (t: Tap, at: number) => { let ph = 'ready'; for (const x of t.phases) { if (x.at > at) break; ph = x.phase; } return ph; };
const firstPhase = (t: Tap, phase: string, after: number) => t.phases.find((x) => x.at >= after && x.phase === phase)?.at ?? null;
const pollAt = (t: Tap, at: number) => { let s: any = null; for (const x of t.polls) { if (x.at > at) break; s = x.s ?? s; } return s; };
const label = (e: BusE) => e.t === 'button' ? `${e.btn}${e.pressed ? '↓' : '↑'}` : e.t === 'dpad' ? `${e.dir}${e.pressed ? '↓' : '↑'}` : e.t === 'stick' ? `L(${e.x},${e.y})` : `${e.side}T ${e.value}`;
const inputs = (t: Tap, a: number, b: number) => t.bus.filter((x) => x.at >= a && x.at <= b && x.e.src === 'body');
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = 180 / Math.PI;
const sumB = (b: Record<string, number> | undefined, keys: string[]) => keys.reduce((a, k) => a + (b?.[k] ?? 0), 0);

/** L1b + L2b (STANCE=1): the READY stance line on the shipping host — the space check at 3.6 m (lens 1.2 m), then a turn into
 *  a regular 45° stance held still; the panel's line, the check's stage and the session (phase, stance) polled every 50 ms;
 *  then both hands up FROM the stance (L2b) and a toe lean once playing. */
const STANCE = process.env.STANCE === '1';
const PLAY_CAM = { distance: 3.6, heightM: 1.2 };
async function stanceCheck(p: Page, key: string): Promise<Record<string, unknown>> {
  await p.goto(`${BASE}/dev/body/${key}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_SPACE__ && !!w.__FEL_DEV__?.input && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300_000, polling: 250 });
  await p.evaluate(() => {
    const w = window as any;
    w.__STANCE = [] as unknown[];
    w.__STBUS = [] as unknown[];
    w.__FEL_DEV__.input.on((e: BusE) => w.__STBUS.push({ at: performance.now(), e }));
    setInterval(() => {
      const panel = document.querySelector('[data-fel-space-panel]') as HTMLElement | null;
      const line = panel?.querySelector('[data-fel-body-stance]') as HTMLElement | null;
      const p2 = panel?.querySelector('p[aria-live]') as HTMLElement | null;
      const ses = w.__FEL_SPACE__.session?.() ?? null, view = w.__FEL_SPACE__.view?.() ?? null;
      w.__STANCE.push({
        at: performance.now(), stage: view?.stage ?? null, check: view?.space?.stage ?? null, stance: line?.dataset.felBodyStance ?? null, line: p2?.innerText ?? null,
        phase: ses?.phase ?? null, sesStance: ses?.stance ? `${ses.stance.kind ?? '-'}/${ses.stance.lead ?? '-'}/${ses.stance.hold01}` : null,
      });
    }, 50);
    w.__FEL_POSE_FEED__.begin();
  });
  await p.click('[data-fel-body-play]');
  const check = synthesize(spaceSession({ end: 5.5 }), { camera: PLAY_CAM, seed: 17 }).frames as PoseFrame[];
  // the turn into the stance and its still hold, then (L2b) both hands up from the stance, then a toe lean while playing
  const turnBeats: [number, (t: number) => Joints][] = [hold(R0, 1.0), [0.5, (t: number) => lerpJoints(R0, ST, ease(t / 0.5))], hold(ST, 2.4)];
  const upBeats = armsUpFrom(ST).map(([, b]) => b);
  const leanBeats: [number, (t: number) => Joints][] = [hold(ST, 1.2), [0.3, (t: number) => edgeTilt(ST, 12 * ease(t / 0.3))], hold(edgeTilt(ST, 12), 1.3), [0.3, (t: number) => edgeTilt(ST, 12 * (1 - ease(t / 0.3)))], hold(ST, 1.0)];
  const all = synthesize(script([...turnBeats, ...upBeats, ...leanBeats]), { camera: PLAY_CAM, seed: 19 }).frames as PoseFrame[];
  // (the turn's frames go into the page BEFORE the check plays. Sent after it, their transfer took 1.75 s on a loaded
  // machine, longer than the check's RATE_WINDOW_MS, and P4 answers such a gap by taking the stand again: frame → still →
  // ready, read off the page's own stages. Staged first, the gap is 6 ms.)
  await p.evaluate((fs) => { (window as any).__STANCE_NEXT = fs; }, all);
  await p.evaluate(async (fs) => { await (window as any).__FEL_POSE_FEED__.play(fs); }, check);
  const ready = await p.waitForFunction(() => (window as any).__FEL_SPACE__.view?.()?.space?.stage === 'ready', null, { timeout: 5000, polling: 50 }).then(() => true, () => false);
  const w = await p.evaluate(async () => { const from = performance.now(); await (window as any).__FEL_POSE_FEED__.play((window as any).__STANCE_NEXT); await new Promise((r) => setTimeout(r, 300)); return { from, to: performance.now() }; });
  type SP = { at: number; stage: string | null; check: string | null; stance: string | null; line: string | null; phase: string | null; sesStance: string | null };
  const polls = await p.evaluate(() => (window as any).__STANCE as SP[]);
  const bus = await p.evaluate(() => (window as any).__STBUS as { at: number; e: BusE }[]);
  const turnEnd = w.from + 3900, upAt = turnEnd + 300, leanFrom = upAt + 1900 + 1200;   // the beats' own seconds (1.0 + 0.5 + 2.4; arms 0.3 + 1.3 + 0.3)
  const seq = polls.filter((x) => x.at >= w.from && x.at <= turnEnd).map((x) => `${x.stance ?? '-'}`).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const lines = polls.filter((x) => x.at >= w.from && x.at <= turnEnd).map((x) => x.line ?? '').filter((v, i, a) => v && (i === 0 || v !== a[i - 1]));
  const checkStages = polls.filter((x) => x.at >= w.from && x.at <= turnEnd).map((x) => x.check ?? '-').filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const regAt = polls.find((x) => x.at >= w.from && x.stance === 'regular')?.at ?? null;
  const holdFrom = w.from + 1500;   // the stance's still hold starts after the 1 s stand and the 0.5 s turn
  const playingAt = polls.find((x) => x.at >= upAt && x.phase === 'playing')?.at ?? null;
  const stanceAtPlay = playingAt != null ? polls.find((x) => x.at >= playingAt)?.sesStance ?? null : null;
  const stanceAfter = polls.filter((x) => x.at >= (playingAt ?? Infinity)).map((x) => x.sesStance).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const leanX = bus.filter((x) => x.at >= leanFrom && x.at <= w.to && x.e.src === 'body' && x.e.t === 'stick').map((x) => x.e.x ?? 0);
  await p.evaluate(() => (window as any).__FEL_BODY__?.stop?.());
  const L1b = { ready, checkStagesThroughTurn: checkStages, stanceSeq: seq, lines, regularAfterHoldMs: regAt != null ? Math.round(regAt - holdFrom) : null, verdict: ready && seq.includes('ask') && seq[seq.length - 1] === 'regular' && !checkStages.includes('frame') ? 'ASK → REGULAR, READY HELD' : 'NOT SHOWN' };
  const L2b = {
    playing: playingAt != null, afterArmsUpMs: playingAt != null ? Math.round(playingAt - upAt) : null, stanceAtPlay, stanceAfter,
    toeLeanMaxX: leanX.length ? Math.max(...leanX) : 0, toeLeanWrongSign: leanX.filter((x) => x < 0).length,
    verdict: playingAt != null && /^side\/L/.test(stanceAtPlay ?? '') && leanX.some((x) => x > 0.5) && !leanX.some((x) => x < 0) ? 'STARTED FROM THE STANCE, THE CARVE STEERS' : 'FAILED',
  };
  return { L1b, L2b };
}

/** L3b (kart, plane): the twelve P1 takes (lib/pose/__fixtures__), each after the P3 gate's stand (its own stand frame held,
 *  the owner's where DeepMotion's has none), fed while the game plays; every body input on the bus is a misfire. */
const P1_DIR = join(process.cwd(), 'lib/pose/__fixtures__');
function p1Takes(): { name: string; frames: PoseFrame[]; t0: number }[] {
  const load = (n: string) => JSON.parse(readFileSync(join(P1_DIR, `${n}.json`), 'utf8'));
  const names = (JSON.parse(readFileSync(join(P1_DIR, 'index.json'), 'utf8')) as { name: string }[]).map((f) => f.name);
  const ownerStand = load('stand_still').frames[70];
  return names.map((name) => {
    const fx = load(name);
    const lead = holdStill(standFrame(fx, fx.source.kind === 'deepmotion' ? ownerStand : undefined).frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
    return { name, frames: [...lead, ...fx.frames] as PoseFrame[], t0: fx.frames[0].t };
  });
}
async function realNegatives(p: Page): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  let misfires = 0, heard = 0;
  // (every take's frames go into the page first, in one call, and each take's restart, resume and play are one call: with
  // a frame array's transfer between the restart and the play — 1–2 s on a loaded machine — the harness saw the body gone
  // past its lost pause, and the kart sat paused through all twelve takes. A take that finds the game paused — the gap
  // after the session before it — resumes it with a pad START press, as a player's thumb would: a paused game hears nothing.)
  const takes = p1Takes();
  await p.evaluate((fs) => { (window as any).__TAKES = fs; }, takes.map((tk) => tk.frames));
  for (const [i, tk] of takes.entries()) {
    // a new body: the reader re-centres on the take's own stand (P3's self-calibration), the game keeps playing
    const w = await p.evaluate(async (k) => {
      const x = window as any, bus = x.__FEL_DEV__.input;
      x.__FEL_BODY__.stop(); x.__FEL_POSE_FEED__.begin(); await x.__FEL_BODY__.start({ autoCalibrate: true });
      const resumed = /DEV · \S+ · paused/.test(document.body.innerText);
      if (resumed) { bus.emit({ t: 'button', btn: 'START', pressed: true }); bus.emit({ t: 'button', btn: 'START', pressed: false }); }
      const from = performance.now(); await x.__FEL_POSE_FEED__.play(x.__TAKES[k]); await new Promise((r) => setTimeout(r, 300));
      return { from, to: performance.now(), resumed };
    }, i);
    const t = await tapOf(p);
    const got = t.bus.filter((x) => x.at >= w.from && x.at <= w.to && x.e.src === 'body').map((x) => label(x.e)).filter((l) => l !== 'L(0,0)' && !/T 0$/.test(l) && !/↑$/.test(l));
    misfires += got.length;
    // (a take that walks out of the frame pauses the game — P3's lost pause — and a paused floor presses nothing: when it
    // paused is said, so a take is never counted clean for the part the game did not hear)
    const pausedAt = t.phases.find((x) => x.at >= w.from && x.at <= w.to && x.phase === 'paused')?.at ?? null;
    const takeMs = Math.round(w.to - w.from - 300);
    const phaseAtStart = phaseAt(t, w.from + 50);
    if (phaseAtStart === 'playing' && pausedAt == null) heard++;
    out[tk.name] = { phase: phaseAt(t, w.to), phaseAtStart, resumedByPad: w.resumed, inputs: got.slice(0, 6), ...(pausedAt != null ? { pausedAtMs: Math.round(pausedAt - w.from), takeMs } : {}) };
  }
  return { misfires, heardWhole: heard, takes: out };
}

/** L2c (RACESTART=1, kart / plane): a body racer's start. A fresh page each: the facing stand, both hands up (held 1.0 s — the
 *  START fires 0.8 s in), then either straight onto the wheel / out as wings (`quick`), or down, a wait, and onto it so the
 *  gas goes down on "2" (`onTwo`); held through GO. The outcome is the mode's own (scene.metadata.<kart|aero>.state().start). */
const RACESTART = process.env.RACESTART === '1';
async function raceStart(p: Page, key: 'velocitykart' | 'aeroaces'): Promise<Record<string, unknown>> {
  const hands = key === 'velocitykart' ? wheelArms(R0, 0) : wingArms(R0, 0, 0);
  const out: Record<string, unknown> = {};
  for (const [nm, waitSec] of [['quick', -1], ['onTwo', 0.3]] as const) {
    logs.length = 0;
    const up: [string, Beat][] = [['armsIn', [0.3, (t) => lerpJoints(R0, UP, ease(t / 0.3))]], ['armsUp', hold(UP, 1.0)]];
    const into: [string, Beat][] = waitSec < 0 ? [['into', [0.6, (t) => lerpJoints(UP, hands, ease(t / 0.6))]]]
      : [['down', [0.4, (t) => lerpJoints(UP, R0, ease(t / 0.4))]], ['wait', hold(R0, waitSec)], ['into', [0.5, (t) => lerpJoints(R0, hands, ease(t / 0.5))]]];
    const s = session(`${key} start ${nm}`, [['face', hold(R0, 2.2)], ...up, ...into, ['held', hold(hands, 6)]], 61);
    await open(p, key);
    const w = await play(p, s);
    const t = await tapOf(p);
    const woke = firstPhase(t, 'playing', w.from);
    const gas = t.bus.filter((x) => x.at >= (woke ?? w.from) && x.e.src === 'body' && x.e.t === 'trigger' && x.e.side === 'R').map((x) => ({ ms: Math.round(x.at - (woke ?? 0)), v: x.e.value }));
    const starts = t.polls.map((x) => x.s?.start).filter((v) => typeof v === 'string');
    const outcome = starts.find((v: string) => !/^count/.test(v) && v !== '') ?? null;
    out[nm] = { woke: woke != null, gas: gas.slice(0, 4), outcome, raceLog: logs.filter((l) => /\[RACE\] start/.test(l)) };
    await p.evaluate(() => (window as any).__FEL_BODY__.stop());
  }
  return out;
}

/** L7 (PAD=1): what an external stick / button / trigger does to the mode, read off its own seam (no src: a pad's input). */
const PAD = process.env.PAD === '1';
type PadStep = { e: BusE | null; ms: number };
const PAD_DRIVE: Record<string, PadStep[]> = {
  skateboard: [{ e: { t: 'stick', side: 'L', x: 1, y: 0 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 300 }, { e: { t: 'button', btn: 'A', pressed: true }, ms: 120 }, { e: { t: 'button', btn: 'A', pressed: false }, ms: 900 }],
  snowboard_slalom: [{ e: { t: 'stick', side: 'L', x: 1, y: 0 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 300 }, { e: { t: 'button', btn: 'A', pressed: true }, ms: 120 }, { e: { t: 'button', btn: 'A', pressed: false }, ms: 900 }],
  surf: [{ e: { t: 'stick', side: 'L', x: 1, y: 0 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 600 }],
  freerun: [{ e: { t: 'stick', side: 'L', x: 0, y: -1 }, ms: 2500 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 300 }],
  velocitykart: [{ e: { t: 'trigger', side: 'R', value: 1 }, ms: 1000 }, { e: { t: 'stick', side: 'L', x: 1, y: 0 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 200 }, { e: { t: 'trigger', side: 'R', value: 0 }, ms: 200 }],
  aeroaces: [{ e: { t: 'trigger', side: 'R', value: 1 }, ms: 600 }, { e: { t: 'stick', side: 'L', x: 1, y: 0 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 1 }, ms: 1200 }, { e: { t: 'stick', side: 'L', x: 0, y: 0 }, ms: 200 }, { e: { t: 'trigger', side: 'R', value: 0 }, ms: 200 }],
};
async function padPass(p: Page, key: string): Promise<Record<string, unknown>> {
  const a = await p.evaluate(() => performance.now());
  for (const st of PAD_DRIVE[key]) {
    if (st.e) await p.evaluate((e) => (window as any).__FEL_DEV__.input.emit(e), st.e);
    await p.waitForTimeout(st.ms);
  }
  const t = await tapOf(p);
  const b = await p.evaluate(() => performance.now());
  const ps = t.polls.filter((x) => x.at >= a && x.at <= b && x.s);
  const p0 = ps[0]?.s, p1 = ps[ps.length - 1]?.s;
  return {
    phase: phaseAt(t, b), received: t.bus.filter((x) => x.at >= a && x.at <= b && x.e.src !== 'body').length,
    headingDeg: p0 && p1 && typeof p0.h === 'number' ? +(wrapPi(p1.h - p0.h) * DEG).toFixed(1) : null,
    airborne: ps.some((x) => x.s.air === true), maxSpeed: Math.max(0, ...ps.map((x) => x.s.sp ?? 0)),
    dy: p0 && p1 && typeof p0.y === 'number' ? +(p1.y - p0.y).toFixed(1) : null,
    bodyVerbsDuringPad: p0?.b && p1?.b ? sumB(p1.b, ['grabs', 'spins', 'pushes', 'latePops', 'cutbacks', 'rails']) - sumB(p0.b, ['grabs', 'spins', 'pushes', 'latePops', 'cutbacks', 'rails']) : null,
  };
}

const report: Record<string, unknown> = {};
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: process.env.HEADED !== '1', args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript('window.__name = (f) => f;');
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
const logs: string[] = [];
page.on('console', (m) => { const x = m.text(); if (/\[(SKATE|SNOW|SURF|AIR)-BODY\]|\[AIR-TRICK\]|\[SPRINT-DIP\]|\[RACE\] start/.test(x)) logs.push(x.slice(0, 160)); });

for (const key of MODES) {
  const prof: BodyProfile | undefined = Object.values(BODY_PROFILES).find((x) => x.key === key);
  // (the row as it binds with the ride switch on: the page's own table follows the SERVER's NEXT_PUBLIC_FEL_BODY_RIDE, and the
  // bus below shows what it really pressed)
  const rideRow = RIDE_ROWS_ON.find((x) => x.key === key) ?? prof;
  const row: Record<string, unknown> = { profile: rideRow?.bindings.map((b) => `${b.from}→${b.to} ${b.verb}`).join(', ') || 'session-only' };
  if (prof && rideRow && prof.bindings.length !== rideRow.bindings.length) row.switched = 'kart / plane: bound on the page only when the dev server runs with NEXT_PUBLIC_FEL_BODY_RIDE (or RIDE_DEFAULT_ON has it)';
  logs.length = 0;
  try {
    if (STANCE && ['skateboard', 'snowboard_slalom', 'surf'].includes(key)) {
      Object.assign(row, await stanceCheck(page, key));
      if (process.env.STANCE_ONLY === '1') { report[key] = row; console.error(`[ride-live] ${key} stance done`); continue; }
    }
    if (RACESTART && (key === 'velocitykart' || key === 'aeroaces')) {
      logs.length = 0;
      row.L2c_raceStart = await raceStart(page, key);
      if (process.env.RACESTART_ONLY === '1') { report[key] = row; console.error(`[ride-live] ${key} race start done`); continue; }
    }
    const s = SESSIONS[key]();
    await open(page, key);
    const w = await play(page, s);
    const t = await tapOf(page);
    const at = (mark: string) => w.from + (s.marks[mark] - s.t0);
    const span = (name: string) => { const b = s.beats.find((x) => x.name === name)!; return [w.from + (b.from - s.t0), w.from + (b.to - s.t0)] as [number, number]; };
    const between = (a: string, b: string) => [span(a)[0], span(b)[1]] as [number, number];

    // L1 + L2
    const upAt = at('armsUp');
    const woke = firstPhase(t, 'playing', w.from);
    row.L1_ready = { keptUntilHandsUp: phaseAt(t, upAt) === 'ready', bodyInputsBeforeWake: inputs(t, w.from, woke ?? upAt).map((x) => label(x.e)) };
    row.L2_start = { woke: woke != null, afterArmsUpMs: woke != null ? Math.round(woke - upAt) : null, inputsInLatchRelease: inputs(t, upAt, at('armsOut') + 600).map((x) => label(x.e)).filter((l) => l !== 'L(0,0)') };

    // L3 QUIET: from the first quiet beat to the last
    const qBeats = s.beats.filter((b) => b.name.startsWith('q'));
    if (qBeats.length) {
      const qa = w.from + (qBeats[0].from - s.t0), qb = w.from + (qBeats[qBeats.length - 1].to - s.t0);
      const crouchW = s.beats.some((b) => b.name === 'qCrouchDown') ? [span('qCrouchDown')[0], span('qRest5')[0] + 1200] : null;
      const allowed = (x: { at: number; e: BusE }) => {
        const l = label(x.e);
        if (l === 'L(0,0)') return true;
        if (crouchW && x.at >= crouchW[0] && x.at <= crouchW[1]) {
          if (key !== 'surf' && x.e.t === 'trigger') return true;   // the crouch's PUMP / TUCK
          if (key === 'surf' && x.e.t === 'stick' && x.e.x === 0) return true;   // surf's trim (y) inside the crouch
        }
        return false;
      };
      const all = inputs(t, qa, qb);
      const bad = all.filter((x) => !allowed(x)).map((x) => `${Math.round(x.at - qa)}ms ${label(x.e)}`);
      const p0 = pollAt(t, qa), p1 = pollAt(t, qb);
      const intentKeys = ['grabs', 'spins', 'pushes', 'latePops', 'cutbacks', 'rails', 'plants'];
      // (R-F4: the plane coasting at rest is turned back by the course EDGE — AeroAcesMode's wallTurn, "OFF THE COURSE" — with
      // no input at all: its heading is judged BETWEEN edge contacts, the polls where |lateral| is inside the corridor)
      let edgeContacts = 0, edgeFreeDrift = 0;
      if (key === 'aeroaces') {
        const qp = t.polls.filter((x) => x.at >= qa && x.at <= qb && x.s && typeof x.s.lat === 'number');
        let runStart: number | null = null;
        for (let i = 0; i < qp.length; i++) {
          const atEdge = Math.abs(qp[i].s.lat) >= qp[i].s.cor - 0.5;
          if (atEdge && (i === 0 || Math.abs(qp[i - 1].s.lat) < qp[i - 1].s.cor - 0.5)) edgeContacts++;
          if (!atEdge && runStart === null) runStart = i;
          if ((atEdge || i === qp.length - 1) && runStart !== null) {
            const end = atEdge ? i - 1 : i;
            if (end > runStart) edgeFreeDrift = Math.max(edgeFreeDrift, Math.abs(wrapPi(qp[end].s.h - qp[runStart].s.h) * DEG));
            runStart = null;
          }
        }
      }
      row.L3_quiet = {
        phase: phaseAt(t, qb), bodyInputs: all.length, misfires: bad,
        intents: p0?.b && p1?.b ? sumB(p1.b, intentKeys) - sumB(p0.b, intentKeys) : null,
        headingDriftDeg: p0 && p1 && typeof p0.h === 'number' ? +(wrapPi(p1.h - p0.h) * DEG).toFixed(2) : null,
        ...(key === 'aeroaces' ? { edgeContacts, headingDriftBetweenEdgesDeg: +edgeFreeDrift.toFixed(2) } : {}),
        ...(key === 'freerun' || key === 'velocitykart' || key === 'aeroaces' ? { walkMinY: Math.min(0, ...all.filter((x) => x.e.t === 'stick').map((x) => x.e.y ?? 0)) } : {}),
      };
    }

    // L4 FOLLOW
    const f: Record<string, unknown> = {};
    if (['skateboard', 'snowboard_slalom', 'surf'].includes(key)) {
      for (const [nm, want] of [['toe12', 1], ['heel12', -1], ['toe8', 1], ['heel8', -1]] as const) {
        const [a, b] = between(`${nm}In`, `${nm}Out`);
        const xs = inputs(t, a, b + 500).filter((x) => x.e.t === 'stick').map((x) => x.e.x ?? 0);
        const p0 = pollAt(t, a), p1 = pollAt(t, b + 400);
        f[nm] = {
          wantSign: want, maxX: xs.length ? Math.max(...xs.map((x) => x * want)) : 0, wrongSign: xs.filter((x) => x * want < 0).length,
          headingDeg: p0 && p1 ? +(wrapPi(p1.h - p0.h) * DEG).toFixed(1) : null,
        };
      }
      const popsIn = (a: number, b: number) => inputs(t, a, b).filter((x) => x.e.t === 'button' && x.e.btn === 'A' && x.e.pressed).length;
      const bStat = (a: number, b: number) => { const p0 = pollAt(t, a)?.b ?? {}, p1 = pollAt(t, b)?.b ?? {}; return Object.fromEntries(Object.keys(p1).filter((k) => typeof p1[k] === 'number' && p1[k] !== (p0[k] ?? 0)).map((k) => [k, p1[k] - (p0[k] ?? 0)])); };
      for (const nm of ['hop', 'bs', 'grab', ...(key === 'skateboard' ? ['push1'] : [])]) {
        const a = span(nm)[0], b = nm === 'push1' ? span('pushRoll2')[1] : span(`${nm}Rest`)[1];
        const chains = t.polls.filter((x) => x.at >= a && x.at <= b && x.s?.chain?.length).map((x) => x.s.chain.join('+'));
        f[nm] = { pops: popsIn(a, b), body: bStat(a, b), last: pollAt(t, b)?.b?.last ?? null, ...(chains.length ? { chain: [...new Set(chains)] } : {}) };
      }
      // review fix: the stance kept through the 450 ms dropout (no pause; the edge steers toe-ward; the rest after steers nothing),
      // and squared up 30°: a backside hop turn there spins (the mode's own count), and nothing steers while squared or back
      {
        const [ea, eb] = between('kEdge', 'kOut');
        const edgeX = inputs(t, ea, eb + 300).filter((x) => x.e.t === 'stick').map((x) => x.e.x ?? 0);
        const [ra, rb] = span('kRest');
        const restX = inputs(t, ra + 600, rb).filter((x) => x.e.t === 'stick' && (x.e.x ?? 0) !== 0).map((x) => x.e.x);
        const lastBefore = [...t.bus].reverse().find((x) => x.at <= ra + 600 && x.e.src === 'body' && x.e.t === 'stick');
        f.kept = { paused: t.phases.some((x) => x.at >= span('kGap')[0] && x.at <= rb && x.phase === 'paused'), edgeMaxX: edgeX.length ? Math.max(...edgeX) : 0, edgeWrongSign: edgeX.filter((x) => x < 0).length, restNonZero: restX, stickEnteringRest: lastBefore?.e.x ?? 0 };
        const [qa, qb] = [span('sqTurn')[0], span('sqHeld')[1]];
        const sqX = inputs(t, qa, qb).filter((x) => x.e.t === 'stick' && (x.e.x ?? 0) !== 0).map((x) => x.e.x);
        const sa = span('sqBs')[0], sb = span('sqRest')[1];
        const backX = inputs(t, span('sqBack')[0], span('sqBackRest')[1]).filter((x) => x.e.t === 'stick' && (x.e.x ?? 0) !== 0).map((x) => x.e.x);
        f.squared = { stickWhileSquaring: sqX, pops: popsIn(sa, sb), body: bStat(sa, sb), last: pollAt(t, sb)?.b?.last ?? null, stickTurningBack: backX };
      }
      if (s.marks.padHop !== undefined) {
        const [pa, pb] = [span('padHop')[0], span('padHopRest')[1]];
        const extA = t.bus.filter((x) => x.at >= pa && x.at <= pb && x.e.t === 'button' && x.e.btn === 'A' && x.e.pressed && x.e.src !== 'body').map((x) => Math.round(x.at - pa));
        const bodyA = t.bus.filter((x) => x.at >= pa && x.at <= pb && x.e.t === 'button' && x.e.btn === 'A' && x.e.pressed && x.e.src === 'body').map((x) => Math.round(x.at - pa));
        f.padThenBodyHop = { padA: extA, bodyA, body: bStat(pa, pb), airborne: t.polls.some((x) => x.at >= pa && x.at <= pb && x.s?.air === true) };
      }
      f.logs = logs.slice(0, 24);
    } else if (key === 'velocitykart') {
      const gas = inputs(t, span('grip')[0], span('letGo')[1]).filter((x) => x.e.t === 'trigger').map((x) => x.e.value);
      f.gas = gas;
      for (const [nm, want] of [['r15', 1], ['l15', -1], ['r30', 1], ['l30', -1], ['r60', 1], ['l60', -1]] as const) {
        const [a, b] = between(`${nm}In`, `${nm}Out`);
        const xs = inputs(t, a, b + 500).filter((x) => x.e.t === 'stick').map((x) => x.e.x ?? 0);
        const p0 = pollAt(t, a), p1 = pollAt(t, b + 400);
        f[nm] = { maxX: xs.length ? Math.max(...xs.map((x) => x * want)) : 0, wrongSign: xs.filter((x) => x * want < 0).length, headingDeg: p0 && p1 ? +(wrapPi(p1.h - p0.h) * DEG).toFixed(1) : null };
      }
      for (const nm of ['hop30', 'hop10']) {
        const [a, b] = between(`${nm}In`, `${nm}Centre`);
        const xs = inputs(t, a, b).filter((x) => x.e.t === 'button' && x.e.btn === 'X').map((x) => label(x.e));
        f[nm] = { drift: xs, events: pollAt(t, b)?.ev ?? null };
      }
      f.otherPresses = inputs(t, span('grip')[0], span('down')[1]).filter((x) => x.e.t === 'button' && x.e.btn !== 'X' || x.e.t === 'dpad' || (x.e.t === 'trigger' && x.e.side === 'L')).map((x) => label(x.e));
    } else if (key === 'aeroaces') {
      f.gas = inputs(t, span('spread')[0], span('down2')[1]).filter((x) => x.e.t === 'trigger').map((x) => x.e.value);
      for (const [nm, axis, want] of [['bankR', 'x', 1], ['bankL', 'x', -1], ['bankR35', 'x', 1], ['up', 'y', 1], ['down', 'y', -1]] as const) {
        const [a, b] = between(`${nm}In`, `${nm}Out`);
        const vs = inputs(t, a, b + 500).filter((x) => x.e.t === 'stick').map((x) => (axis === 'x' ? x.e.x : x.e.y) ?? 0);
        const p0 = pollAt(t, a), p1 = pollAt(t, b + 400);
        f[nm] = { max: vs.length ? Math.max(...vs.map((v) => v * want)) : 0, wrongSign: vs.filter((v) => v * want < 0).length, headingDeg: p0 && p1 ? +(wrapPi(p1.h - p0.h) * DEG).toFixed(1) : null, dy: p0 && p1 && p0.y != null ? +(p1.y - p0.y).toFixed(1) : null };
      }
      f.presses = inputs(t, span('spread')[0], span('down2')[1]).filter((x) => x.e.t === 'button' || x.e.t === 'dpad').map((x) => label(x.e));
    } else if (key === 'freerun') {
      const ys = (a: number, b: number) => inputs(t, a, b).filter((x) => x.e.t === 'stick').map((x) => x.e.y ?? 0);
      const sp = (a: number, b: number) => Math.max(0, ...t.polls.filter((x) => x.at >= a && x.at <= b).map((x) => x.s?.sp ?? 0));
      f.walk = { minY: Math.min(0, ...ys(...between('walk', 'walk'))), maxSpeed: sp(...between('walk', 'walkRest')) };
      f.run = { minY: Math.min(0, ...ys(...between('run', 'run'))), maxSpeed: sp(...between('run', 'runRest')) };
      f.knees = { minY: Math.min(0, ...ys(...between('knees', 'knees'))), rt: inputs(t, ...between('knees', 'kneesRest')).filter((x) => x.e.t === 'trigger').map((x) => x.e.value), maxSpeed: sp(...between('knees', 'kneesRest')) };
      f.runRT = inputs(t, ...between('run', 'runRest')).filter((x) => x.e.t === 'trigger').map((x) => x.e.value);
      f.hop = inputs(t, ...between('hop', 'hopRest')).filter((x) => x.e.t === 'button').map((x) => label(x.e));
      f.gates = { vault: 2.6, sprint: 5.2 };
    } else if (key === 'sprint') {
      const pe = pollAt(t, span('blocks')[1]), pf = pollAt(t, w.to);
      f.falseStartsAfterEarly = pe?.fs ?? null;
      f.final = pf;
      f.rivalS = 13.4;
    } else if (key === 'bigair') {
      // L5: in the Air phase, the spin's direction never changes because of a step (it only changes on a body quarter)
      const air = t.polls.filter((x) => x.s?.phase === 'Air');
      let dirChanges = 0, bySpin = 0;
      for (let i = 1; i < air.length; i++) {
        if (air[i].s.dir === air[i - 1].s.dir || air[i].s.att !== air[i - 1].s.att) continue;
        // the body's own quarter sets the direction once (its spins count moves in the same poll): anything else is a step's
        if ((air[i].s.b?.spins ?? 0) > (air[i - 1].s.b?.spins ?? 0)) bySpin++; else dirChanges++;
      }
      const last = pollAt(t, w.to);
      f.air = { polls: air.length, dirChangesFromSteps: dirChanges, dirSetByBodySpin: bySpin, body: last?.b ?? null, named: last?.named ?? null, lastGrade: last?.grade ?? null, lastRotations: last?.rot ?? null };
      f.logs = logs.slice(0, 20);
    }
    row.L4_follow = f;

    // L6 LOST / RESUME (not sprint / big air: the race or the attempts end inside the session)
    if (s.marks.gone !== undefined) {
      const gone = at('gone');
      const paused = firstPhase(t, 'paused', gone);
      const back = paused != null ? firstPhase(t, 'playing', paused) : null;
      row.L6_lost = { paused: paused != null, afterGoneMs: paused != null ? Math.round(paused - gone) : null, resumed: back != null, afterReArmsUpMs: back != null ? Math.round(back - at('rearmsUp')) : null };
    }
    // L3b REAL (kart, plane): the P1 takes, fed while the game plays
    if ((key === 'velocitykart' || key === 'aeroaces') && process.env.P1NEG !== '0') {
      // back in play first (the lost / resume beats leave it playing; a pause here would hide every press)
      if (phaseAt(await tapOf(page), await page.evaluate(() => performance.now())) === 'playing') row.L3b_real = await realNegatives(page);
      else row.L3b_real = { skipped: `the game is ${phaseAt(await tapOf(page), await page.evaluate(() => performance.now()))}` };
    }
    // L8 LATENCY
    const qaLog = await page.evaluate(() => (window as any).__FEL_QA__.bodyLog(4000) as { t: number; kind: string; lagMs: number }[]);
    const lat: Record<string, { n: number; med: number; p90: number }> = {};
    for (const k of [...new Set(qaLog.map((x) => x.kind))]) {
      const v = qaLog.filter((x) => x.kind === k).map((x) => x.lagMs).sort((a, b) => a - b);
      lat[k] = { n: v.length, med: Math.round(v[v.length >> 1]), p90: Math.round(v[Math.floor(v.length * 0.9)]) };
    }
    row.L8_latency = lat;
    // L9 COST: frames pushed one at a time, timed around the push
    await page.evaluate(async () => { const w = window as any; w.__FEL_BODY__.stop(); w.__FEL_POSE_FEED__.begin(); await w.__FEL_BODY__.start({ autoCalibrate: true }); });
    row.L9_pageCostMs = await page.evaluate((frames) => {
      const feed = (window as any).__FEL_POSE_FEED__;
      const base = performance.now() + 50, t0 = frames[0].t, ms: number[] = [];
      for (const fr of frames) { const tt = base + (fr.t - t0); const a = performance.now(); feed.push({ ...fr, t: tt, arrive: tt + 66 }); ms.push(performance.now() - a); }
      ms.sort((a, b) => a - b);
      return { median: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3), frames: ms.length };
    }, s.frames.slice(0, 600));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${key}.png`) }).catch(() => {});
    await page.evaluate(() => (window as any).__FEL_BODY__.stop());
    // L7 (PAD=1): the Body off, the same game driven by external input (InputBus.emit, the touch deck's and a pad's road
    // into the arbiter): the stick still steers, A still pops, the gas still goes — the P8 branches are the body's only
    if (PAD && PAD_DRIVE[key]) row.L7_pad = await padPass(page, key);
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  report[key] = row;
  console.error(`[ride-live] ${key} done`);
}

console.log(JSON.stringify({ base: BASE, nodeCostMs: nodeCost(), modes: report, pageErrors: errors.slice(0, 20) }, null, 1));
await browser.close();
