// clip-strides — the speed each captured hoops LOOP was really moving at, and so the stride reference each locomotion
// state of the basketball tree paces against (HOOPS MOTION phase 2b, 2026-09-25: HOOPS_STRIDE_CAPTURE is derived here,
// not tuned by eye).
//
// A stride reference is the ground speed a loop covers at rate 1: stride length × cadence, which over a whole cut
// window is the hips' planar travel divided by the window's REAL time (scripts/mocap/sources.mts reads each subject at
// its true frame rate), scaled by the retarget's own body scale (source leg → the reference hero's 0.82 m; cgspeed put
// every subject on one Daz skeleton, so that is one number). The hoops loops carry no `duration`, so the played time IS
// the window's real time. Windows are the refined loop windows the generated module records in `source`.
//
// A state is paced against the clip it really PLAYS on a hoops rig: its tree clip (basketballTree CLIP_FOR), swapped for
// the capture that replaces it (opponentMotion.variantFor — `run` plays run_forward, which is the 78_06 dribbling capture
// until phase 3 gives the ball-less runner 78_12). A state whose clip has no capture (the closeout, the carry strafes)
// keeps the authored reference (HOOPS_STRIDE), so nothing authored changes pace.
//
//   node node_modules/tsx/dist/cli.mjs scripts/mocap/clip-strides.mts
import { join } from 'node:path';
import { readBvhStream, type JointStream } from './sources.mts';
import * as ocNs from '../../lib/babylon/anim/authored/mocapOpponents.ts';
import * as omNs from '../../lib/babylon/anim/opponentMotion.ts';
import * as btNs from '../../lib/babylon/anim/basketballTree.ts';
import * as smNs from '../../lib/babylon/core/StrideMatch.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { MOCAP_OPPONENT_CLIPS } = unwrap(ocNs);
const { variantFor } = unwrap(omNs);
const { basketballClipTable } = unwrap(btNs);
const { HOOPS_STRIDE, HOOPS_STRIDE_CAPTURE, RATE_MAX, strideKindFor } = unwrap(smNs);
const ROOT = join(process.env.HOME ?? '', 'Downloads/fel-mocap-sources');
const REF_LEG = 0.82;
const streams = new Map<string, JointStream>();

// ── every captured hoops loop: its real window, its played duration, the ground it covers per real second ──
interface LoopStride { name: string; file: string; from: number; to: number; real: number; duration: number; travelM: number; speed: number }
const loops = new Map<string, LoopStride>();
for (const c of MOCAP_OPPONENT_CLIPS) {
  if (!c.loop || !c.name.startsWith('bball_mc_')) continue;
  const m = /^cmu:(\S+) ([\d.]+)–([\d.]+)s/.exec(c.source); if (!m) continue;
  const file = `cmu/${m[1].split('_')[0]}/${m[1]}`;
  let s = streams.get(file); if (!s) { s = readBvhStream(join(ROOT, file), 'cmu'); streams.set(file, s); }
  const from = +m[2], to = +m[3];
  // the frames mocapRetarget cuts for this window (floor / ceil of the window × the true rate)
  const f0 = Math.max(0, Math.floor(from * s.fps)), f1 = Math.min(s.frames.length - 1, Math.ceil(to * s.fps));
  const leg = (fr: JointStream['frames'][number]) => Math.hypot(...[0, 1, 2].map((i) => fr.LeftUpLeg[i] - fr.LeftLeg[i])) + Math.hypot(...[0, 1, 2].map((i) => fr.LeftLeg[i] - fr.LeftFoot[i]));
  const S = REF_LEG / leg(s.frames[f0]);
  const travel = Math.hypot(s.frames[f1].Hips[0] - s.frames[f0].Hips[0], s.frames[f1].Hips[2] - s.frames[f0].Hips[2]) * S;
  const real = (f1 - f0) / s.fps;
  loops.set(c.name, { name: c.name, file, from, to, real, duration: c.duration, travelM: travel, speed: +(travel / real).toFixed(2) });
}
console.log('captured loop                      window (true s)          real      played    real/played   hips travel   ground speed');
for (const r of loops.values()) console.log(`${r.name.padEnd(34)} ${r.file.split('/').pop()} ${r.from.toFixed(2)}–${r.to.toFixed(2)}   ${r.real.toFixed(3)} s   ${r.duration.toFixed(2)} s    ${(r.real / r.duration).toFixed(3)}×        ${r.travelM.toFixed(2)} m        ${r.speed.toFixed(2)} m/s`);

// ── every stride-matched LOOP state of the tree → the clip it plays on a hoops rig → its reference ──
const captured = new Set([...loops.keys(), ...MOCAP_OPPONENT_CLIPS.filter((c) => c.name.startsWith('bball_mc_')).map((c) => c.name)]);
const kindRef = (ref: smNs.StrideRef, kind: string): number => (kind === 'run' ? ref.run : kind === 'sprint' ? (ref.sprint ?? ref.run) : kind === 'slide' ? ref.slide : kind === 'walk' ? (ref.walk ?? ref.run * 0.2) : (ref.jog ?? ref.run * 0.78));
interface StateRef { state: string; kind: string; clip: string; plays: string; ref: number; from: 'capture' | 'authored' }
const states: StateRef[] = [];
for (const [state, c] of Object.entries(basketballClipTable())) {
  const kind = strideKindFor(state);
  if (!c.loop || kind === 'none') continue;
  const plays = variantFor(c.clip, new Set([...captured, c.clip]));
  const cap = loops.get(plays);
  states.push({ state, kind, clip: c.clip, plays, ref: cap ? cap.speed : kindRef(HOOPS_STRIDE, kind), from: cap ? 'capture' : 'authored' });
}
// the ground the feet can cover at the state's rate ceiling (its own, else RATE_MAX): what a body faster than that skates over
const ceilingOf = (s: StateRef) => s.ref * (HOOPS_STRIDE_CAPTURE.rateMaxByState?.[s.state] ?? RATE_MAX);
console.log('\nstate                     kind     tree clip                        plays on a hoops rig             reference              feet at the ceiling');
for (const s of states) console.log(`${s.state.padEnd(25)} ${s.kind.padEnd(8)} ${s.clip.padEnd(32)} ${s.plays.padEnd(32)} ${s.ref.toFixed(2)} m/s (${s.from})`.padEnd(125) + `${ceilingOf(s).toFixed(2)} m/s${HOOPS_STRIDE_CAPTURE.rateMaxByState?.[s.state] ? ` (its own ceiling, ${HOOPS_STRIDE_CAPTURE.rateMaxByState[s.state]}×)` : ''}`);

// the kind's field is its representative state's clip; any state that plays something else rides in byState
const REP: Record<string, string> = { run: 'run', sprint: 'drive', jog: 'speed_dribble', walk: 'walk_dribble', slide: 'defend_slide' };
const refOf = (state: string) => states.find((s) => s.state === state)!.ref;
const derived: smNs.StrideRef = { run: refOf(REP.run), sprint: refOf(REP.sprint), jog: refOf(REP.jog), walk: refOf(REP.walk), slide: refOf(REP.slide) };
const byState: Record<string, number> = {};
for (const s of states) if (Math.abs(s.ref - kindRef(derived, s.kind)) > 1e-9) byState[s.state] = +s.ref.toFixed(2);
derived.byState = byState;
console.log(`\nderived  HOOPS_STRIDE_CAPTURE = ${JSON.stringify(derived)}`);
// the rate ceilings are a pacing decision (StrideMatch: the right slide keeps a37a90ce's), not a measured stride: compare the references
const { rateMaxByState, ...refsInCode } = HOOPS_STRIDE_CAPTURE;
console.log(`in code  HOOPS_STRIDE_CAPTURE = ${JSON.stringify(refsInCode)}${rateMaxByState ? ` + rateMaxByState ${JSON.stringify(rateMaxByState)}` : ''}`);
const canon = (v: unknown): string => (v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : String(v));
const same = canon(derived) === canon(refsInCode);
console.log(same ? 'MATCH: the table in core/StrideMatch.ts is the instrument\'s' : 'DIFFERS: update core/StrideMatch.ts HOOPS_STRIDE_CAPTURE and authored/mocapPins.test.ts CLIP_SPEED');
