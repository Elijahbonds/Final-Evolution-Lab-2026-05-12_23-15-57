// seam — the movement-play SEAM report (phase 3, 2026-09-24): BASELINE.md's §0–4 side by side with the P3 seam's
// numbers, and a lag table per verb. The P1 half is lib/pose/baseline.ts's replay of the frozen poseControl mapper, as
// scripts/body/baseline.mts prints it; the P3 half is lib/pose/seamReplay.ts — the body reader, the channels, the
// session, each mode's profile through its floor, and the arbiter — on the same streams, each take with the 1.2 s stand
// the P3 gate holds before it (grade.standFrame + holdStill).
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/seam.mts [--out <file>]
//
// Default out: ~/Claude/outbox/finish-release/movementplay/p3-seam/SEAM.md (outside the repo). Numbers only: no camera,
// no server, deterministic (the fixtures and the scripted streams are seeded). The gate asserting these is
// lib/input/bodyGate.test.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import * as bNs from '../../lib/pose/baseline.ts';
import * as seamNs from '../../lib/pose/seamReplay.ts';
import * as gradeNs from '../../lib/pose/grade.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as synNs from '../../lib/pose/synth.ts';
import * as profNs from '../../lib/input/bodyProfiles.ts';
import * as floorNs from '../../lib/input/bodyFloor.ts';
import type { PoseFixture, GroundTruth } from '../../lib/pose/synth.ts';
import type { Replay, ReplayOptions } from '../../lib/pose/baseline.ts';
import type { SeamReplay, StreamPacket } from '../../lib/pose/seamReplay.ts';
import type { BodyProfile } from '../../lib/input/bodyProfiles.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const B = unwrap(bNs);
const { bodyPackets, seamReplay } = unwrap(seamNs);
const { standFrame, STAND_SEC, MATCH_ARM_MS, SPLICE_MS } = unwrap(gradeNs);
const { holdStill, script, hold, jumpBeat, jogBeat } = unwrap(kitNs);
const { restPose, synthesize } = unwrap(synNs);
const { BODY_PROFILES } = unwrap(profNs);
const { CROUCH_DEAD, CROUCH_FULL } = unwrap(floorNs);

const FIX = join(process.cwd(), 'lib/pose/__fixtures__');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : join(homedir(), 'Claude/outbox/finish-release/movementplay/p3-seam/SEAM.md');
const names: string[] = JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')).map((f: { name: string }) => f.name);
const fixtures = new Map<string, PoseFixture>(names.map((n) => [n, JSON.parse(readFileSync(join(FIX, `${n}.json`), 'utf8')) as PoseFixture]));
const PROFILES = Object.values(BODY_PROFILES) as BodyProfile[];
const prof = (key: string) => PROFILES.find((p) => p.key === key)!;

// ── P1: the baseline's replays, calibrated as BASELINE.md was (the owner's stand for his takes that never stand up) ──
const still = fixtures.get('stand_still')!, ownerStandAt = B.uprightFrame(still), ownerHipM = still.gt.perFrame.hipH[ownerStandAt];
const p1Opt = (n: string): ReplayOptions => {
  const fx = fixtures.get(n)!, s = B.standFor(fx);
  if (s.upright) return { calibration: 'stand' };
  const { contact, hipH } = fx.gt.perFrame;
  const tallest = Math.max(...hipH.filter((_, i) => contact[i][0] && contact[i][1]));
  return fx.source.kind === 'deepmotion' && tallest < ownerHipM ? { calibration: 'stand', stand: still.frames[ownerStandAt] } : { calibration: 'stand' };
};
const p1 = new Map<string, Replay>(names.map((n) => [n, B.replay(fixtures.get(n)!, p1Opt(n))]));

// ── P3: the seam, each take with the gate's 1.2 s stand ──
interface Take { name: string; fx: { gt: GroundTruth; frames: PoseFrame[] }; packets: StreamPacket[]; lead: number; t0: number }
const OWNER_STAND = still.frames[70];
const takes = new Map<string, Take>(names.map((n) => {
  const fx = fixtures.get(n)!;
  const lead = holdStill(standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined).frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  return [n, { name: n, fx, packets: bodyPackets([...lead, ...fx.frames], { lead: lead.length }), lead: lead.length, t0: fx.frames[0].t }];
}));
const seamCache = new Map<string, SeamReplay>();
const seam = (key: string, t: Take): SeamReplay => {
  const k = `${key}|${t.name}`;
  if (!seamCache.has(k)) seamCache.set(k, seamReplay(t.packets, { profile: prof(key), phase: 'machine', start: 'playing', name: t.name }));
  return seamCache.get(k)!;
};
// scripted streams (the gate's): jumps and a jog, three seeds
const R0 = restPose();
const scripted: Take[] = [];
for (const seed of [17, 23, 41]) {
  for (const v0 of [2.0, 2.4, 2.8]) for (const arms of [false, true]) {
    const syn = synthesize(script([hold(R0, 1.5), jumpBeat(R0, v0, 0.3, arms), hold(R0, 1.0)]), { seed });
    scripted.push({ name: `jump v0 ${v0}${arms ? ' arms' : ''} s${seed}`, fx: syn, packets: bodyPackets(syn.frames), lead: 0, t0: -Infinity });
  }
  const jog = synthesize(script([hold(R0, 1.5), jogBeat(R0, 2, 3, 0.2), hold(R0, 1.2)]), { seed });
  scripted.push({ name: `jog 3 Hz s${seed}`, fx: jog, packets: bodyPackets(jog.frames), lead: 0, t0: -Infinity });
}

// ── formatting ──
const fin = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const sgn = (v: number | null | undefined, unit = '') => { if (!fin(v)) return '–'; const r = Math.round(v) || 0; return `${r >= 0 ? '+' : '−'}${Math.abs(r)}${unit}`; };
const f2 = (v: number | null | undefined) => (!fin(v) ? '–' : v < 0 ? `−${Math.abs(v).toFixed(2)}` : v.toFixed(2));
const pct = (v: number) => `${Math.round(v * 100)} %`;
const span = (v: number[], unit = '') => (!v.length ? '–' : Math.min(...v) === Math.max(...v) ? sgn(v[0], unit) : `${sgn(Math.min(...v))} … ${sgn(Math.max(...v), unit)}`);
const quant = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] : NaN; };
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const md: string[] = [];
const say = (...s: string[]) => md.push(...s, '');
const presses = <T extends { e: { t: string; pressed?: boolean; btn?: string } }>(r: { events: T[] }, btn?: string): T[] =>
  r.events.filter((x) => (x.e.t === 'button' || x.e.t === 'dpad') && x.e.pressed && (!btn || x.e.btn === btn));
const ramp = (v: number) => Math.max(0, Math.min(1, (v - CROUCH_DEAD) / (CROUCH_FULL - CROUCH_DEAD)));

let head = 'unknown';
try { head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
say('# Movement play, phase 3: the seam against the baseline',
  `The P1 mapper (BASELINE.md, frozen) and the P3 seam on the same streams, 2026-09-24, tree \`${head}\`. Measurement only: no mode runs; each mode read is lib/pose/baseline.ts's model of its \`onInput\`.`);

// ── key numbers (filled in as the sections compute them) ──
const key: string[] = [];
const keyAt = md.length;

say('## How it was measured',
  '- **P1** is `lib/pose/baseline.ts` exactly as BASELINE.md ran it: `poseControl` on a 60 Hz rAF loop, 12 good ticks of calibration on a 0.5 s stand.',
  '- **P3** is `lib/pose/seamReplay.ts`: `BodyReader` → `ChannelReader` → `BodySession` + the mode\'s `BodyFloor` → `BodyArbiter` → the mode. A packet is handled when its frame arrives (the app clock), render ticks run at 60 Hz, and the game is `playing` from the first frame (the START hold is measured in the gate). Each take is held 1.2 s still before it (`grade.standFrame` + `holdStill`), the stand the reader calibrates on.',
  '- **Times.** "App" is when the mode receives the event, minus the ground-truth instant (the camera and inference latency included, ~66 ms on the fixtures). "Capture" uses the capture time of the frame that produced it.',
  '- **Profiles.** 9 of the 28 modes bind the body in P3 (plan §2.2); the rest are session-only: the body starts and pauses them and presses nothing.');

// ── §0 the mapper on its own ──
say('## 0. The mapper on its own', '### The jump as a take-off detector',
  'P1: every hip rise past ~4 cm was A, in every mode. P3: a take-off the reader TOLD is A only where a mode binds it (skate POP shown; snow and surf are the same floor). "Extra" = a press matching no true jump (300 ms before its take-off to its landing for P1, as BASELINE.md; within 350 ms of the take-off for P3, as the gate). Events inside the stand → take splice are the splice\'s.');
const jumpRows: (string | number)[][] = [];
let p1Extra = 0, p3Extra = 0, p3Dangling = 0, p1Matched = 0, p3Matched = 0, nJumps = 0;
const p3PopLagApp: number[] = [];
for (const n of names) {
  const fx = fixtures.get(n)!, r1 = p1.get(n)!, t = takes.get(n)!, r3 = seam('skateboard', t);
  const jumps = fx.gt.jumps;
  nJumps += jumps.length;
  // P1 as BASELINE.md: a jump is caught by the presses captured from 300 ms before its take-off to its landing (one
  // counts; the rest are extra)
  const a1 = presses(r1, 'A');
  const caught1 = jumps.filter((j) => a1.some((x) => x.t >= j.takeoff.t - 300 && x.t <= j.landing.t)).length;
  // P3 as the gate: each press to the nearest unmatched take-off within 350 ms; the splice's excluded
  const a3 = presses(r3, 'A').filter((x) => !(t.packets[x.frame + t.lead]?.events ?? []).some((ev) => Math.abs(ev.t - t.t0) <= SPLICE_MS));
  const used = new Set<number>(), lags: number[] = [];
  let caught3 = 0, dangling = 0;
  for (const x of a3) {
    const j = jumps.findIndex((q, i) => !used.has(i) && Math.abs(x.t - q.takeoff.t) <= 350);
    if (j >= 0) { used.add(j); caught3++; lags.push(x.at - jumps[j].takeoff.t); continue; }
    const c = fx.gt.perFrame.contact;   // a take-off still in the air when the take ends: the truth grades no jump there
    if (!c[c.length - 1][0] && !c[c.length - 1][1] && x.t >= fx.frames[fx.frames.length - 1].t - 1100) dangling++;
  }
  p3PopLagApp.push(...lags);
  p1Extra += a1.length - caught1; p3Extra += a3.length - caught3 - dangling; p3Dangling += dangling; p1Matched += caught1; p3Matched += caught3;
  jumpRows.push([n, jumps.length, `${a1.length} / ${caught1} / ${a1.length - caught1}`, `${a3.length} / ${caught3} / ${a3.length - caught3 - dangling}${dangling ? ` (+${dangling} in the air at the end)` : ''}`, span(lags, ' ms')]);
}
say(table(['fixture', 'true jumps', 'P1 A: presses / jumps caught / extra', 'P3 POP: presses / jumps caught / extra', 'P3 POP vs take-off (app)'], jumpRows));
key.push(`- **Jumps as A:** on the 12 takes P1 pressed A ${p1Matched + p1Extra} times for ${p1Matched} of ${nJumps} true jumps, **${p1Extra} extra**; the P3 skate POP pressed ${p3Matched + p3Extra + p3Dangling} times for ${p3Matched} of ${nJumps}, **${p3Extra} extra** (${p3Dangling ? `plus ${p3Dangling} for the jump still in the air when jump_two_foot_high ends` : 'none in the air at the end'}). On those 12 takes it reaches the mode a median ${sgn(quant(p3PopLagApp, 0.5))} ms after the real take-off (p90 ${sgn(quant(p3PopLagApp, 0.9))}; n ${p3PopLagApp.length}), where P1 took +98 ms: the reader waits until it is sure it is a jump. (The lag table at the end pools the takes with the scripted jumps, so its POP row differs.)`);

say('### The L stick at rest',
  'P1 held the stick at full back whenever the body stood on its calibration. P3 sends nothing at rest, in every profile: the table shows the stick events of the stand in the busiest stick profiles and the share of each take P3 spent at y ≥ 0.99.');
const restRows: (string | number)[][] = [];
let p3AnyRest = 0;
for (const n of names) {
  const r1 = p1.get(n)!, t = takes.get(n)!;
  const rest1 = B.restStick(r1);
  const standSticks = PROFILES.reduce((a, p) => a + seam(p.key, t).events.filter((x) => x.frame < 0 && x.e.t === 'stick').length, 0);
  p3AnyRest += standSticks;
  const back = Math.max(...['skateboard', 'freerun', 'surf'].map((k) => B.stickYStats(seam(k, t), 0.99).shareAtLevel));
  const ys = seam('freerun', t).events.flatMap((x) => (x.e.t === 'stick' ? [x.e.y] : []));
  restRows.push([n, rest1 ? `(${f2(Math.abs(rest1.x))}, ${f2(rest1.y)})` : '–', pct(B.stickYStats(r1).shareAtLevel), standSticks ? `${standSticks} events` : 'none', pct(back),
    ys.length ? `${f2(Math.min(...ys))} … ${f2(Math.max(...ys))}` : '0']);
}
say(table(['fixture', 'P1 rest stick', 'P1 share at y ≥ 0.99', 'P3 stick events in the stand (all 28 profiles)', 'P3 share at y ≥ 0.99', 'P3 Free Run y range'], restRows));
key.push(`- **The resting stick:** P1 (0, +1) on 12 of 12 takes; P3 sends ${p3AnyRest ? p3AnyRest : 'no'} stick event${p3AnyRest === 1 ? '' : 's'} at rest in any profile, and never holds y back: only Free Run's run in place pushes y, and only forward.`);

say('### Calibration',
  'P1 took one frame\'s neutral after 12 rAF ticks, whatever the body did. P3\'s reader calibrates on the first still window (StillnessGate) and presses nothing before it: in the no-stand pass of the gate, nothing reaches any mode before the reader is calibrated.');
const calRows = names.map((n) => {
  const r1 = p1.get(n)!, r3 = seam('skateboard', takes.get(n)!);
  return [n, sgn(r1.calAt - r1.takeAt, ' ms'), sgn(r3.calAt - r3.takeAt, ' ms')];
});
say(table(['fixture', 'P1 live (0.5 s stand; vs the take\'s first frame)', 'P3 calibrated (1.2 s stand; vs the take\'s first frame)'], calRows));

// ── §1 dunk ──
say('## 1. Dunk contest and Dunk Duel',
  'The dunk binds nothing in P3 (plan §2.2): every dunk verb is timed against the apex, and any RT or A the body sends recreates the baseline. So the body can start and pause the dunk and nothing else; P5 launches at the real take-off and grades the strike against the apex.');
const dunkNames = ['dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot', 'jump_two_foot_high', 'jump_one_foot_runup', 'jump_two_foot_low', 'jumpshot', 'jumpshot_dribble', 'run_in_place'];
let p1Made = 0, p1Early = 0;
const dunkRows = dunkNames.map((n) => {
  const d1 = B.dunkRead(p1.get(n)!.events), d3 = B.dunkRead(seam('dunk', takes.get(n)!).events);
  const du1 = B.duelRead(p1.get(n)!.events), du3 = B.duelRead(seam('dunkduel', takes.get(n)!).events);
  if (d1.made) p1Made++;
  if (d1.verdict === 'too early') p1Early++;
  const notes1 = d1.notes.filter((x) => x.at < (d1.launch ?? Infinity)).length;
  return [n, `${d1.verdict}${d1.made ? ' (MADE)' : ''}`, notes1, du1.hit ? 'hit' : 'miss', `${d3.verdict}; run ${d3.run === null ? 'no' : 'yes'}, slam ${d3.slam ? 'yes' : 'no'}, menus ${d3.notes.length}`, du3.launch === null ? 'no launch' : 'launch'];
});
say(table(['take', 'P1 dunk', 'P1 approach menu changes', 'P1 duel', 'P3 dunk', 'P3 duel'], dunkRows));
key.push(`- **Dunk:** P1 launched on the dip and was refused TOO EARLY on ${p1Early} of ${dunkNames.length} takes (made ${p1Made}, by accident); P3 presses nothing in the dunk or the duel — no run, no launch, no slam, no menu change — until P5.`);

// ── §2 hoops ──
say('## 2. Hoops shooting', 'All three hoops modes are session-only in P3 (P6 merges a body control source into the hoops ControlSource).');
const hoopRows: (string | number)[][] = [];
for (const n of ['jumpshot', 'jumpshot_dribble']) {
  const s1 = B.shotRead(p1.get(n)!.events), s3 = B.shotRead(seam('threepoint', takes.get(n)!).events), v3 = B.shotRead(seam('threevthree', takes.get(n)!).events);
  hoopRows.push([n, s1.threePt ? `${s1.threePt.btn} at ${sgn(s1.threePt.at - fixtures.get(n)!.gt.jumps[0].takeoff.t)}` : '–', s1.turbo.length, s1.pass.length, s1.block.length,
    s3.threePt ? s3.threePt.btn : 'nothing', `${v3.turbo.length} / ${v3.pass.length} / ${v3.block.length}`]);
}
say(table(['take', 'P1 3PT fires', 'P1 turbo spans', 'P1 A = pass', 'P1 Y = block', 'P3 3PT', 'P3 3v3 turbo / pass / block'], hoopRows));

// ── §3 combat ──
say('## 3. Combat', 'VS, Mixed Combat and Showdown bind a punch to their A verb (JAB / STRIKE / JAB) and the kick to B (KICK). The Hundred and Duel are session-only (their menus read A and B as BUY and FISTS / BLADE).');
const pk = fixtures.get('punch_kick')!, pkT = takes.get('punch_kick')!;
const acts = [...pk.gt.wrist.filter((w) => w.kind === 'punch').map((w) => ({ what: `${w.hand} punch`, t: w.at.t })), ...pk.gt.kicks.map((k) => ({ what: `${k.side} kick`, t: k.at.t }))].sort((a, b) => a.t - b.t);
const combatLag: Record<string, number[]> = { A: [], B: [] };
const actRows = acts.map((a) => {
  const r1 = B.actRead(p1.get('punch_kick')!.events, a.t);
  const vs = seam('karate_vs', pkT);
  const got = presses(vs).filter((x) => Math.abs(x.t - a.t) <= MATCH_ARM_MS + 150);
  for (const x of got) combatLag[(x.e as { btn: string }).btn]?.push(x.at - a.t);
  return [`${a.what} at ${Math.round(a.t)} ms`, r1.presses.map((p) => `${p.btn} ${sgn(p.dt)}`).join(', ') || 'nothing', r1.heldAt.join(', ') || '–',
    got.map((x) => `${(x.e as { btn: string }).btn} ${sgn(x.at - a.t)}`).join(', ') || 'nothing',
    ['mixedcombat', 'showdown'].map((k) => presses(seam(k, pkT)).filter((x) => Math.abs(x.t - a.t) <= MATCH_ARM_MS + 150).map((x) => (x.e as { btn: string }).btn).join('')).join(' / ')];
});
say(table(['act', 'P1 bus (ms vs the peak)', 'P1 held', 'P3 VS (app ms vs the peak)', 'P3 Mixed / Showdown'], actRows));
const duckRows: (string | number)[][] = [];
for (const cm of [10, 20, 30]) {
  const { fx, downAt } = B.duckFixture(cm / 100);
  const r1 = B.replay(fx, { calibration: 'stand' });
  const lead = holdStill(fx.frames.find((f) => f.present)!, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  const pks = bodyPackets([...lead, ...fx.frames], { lead: lead.length });
  const vs = seamReplay(pks, { profile: prof('karate_vs'), phase: 'machine', start: 'playing' });
  const sk = seamReplay(pks, { profile: prof('skateboard'), phase: 'machine', start: 'playing' });
  const peak = (r: { events: { e: { t: string; side?: string; value?: number } }[] }) => Math.max(0, ...r.events.filter((x) => x.e.t === 'trigger' && x.e.side === 'R').map((x) => x.e.value ?? 0));
  const sq = Math.max(0, ...pks.map((q) => q.read.squat ?? 0));
  duckRows.push([`${cm} cm`, f2(peak(r1)), B.triggerAbove(r1.events, 0.35).length, vs.events.length ? `${vs.events.length} events` : 'nothing', f2(sq), f2(peak(sk)), sgn(sk.events.filter((x) => x.e.t === 'trigger').pop()!?.at - (downAt + 700), ' ms')]);
}
say('### A duck', table(['hip drop', 'P1 R2 peak', 'P1 Focus spans', 'P3 combat (no crouch bound)', 'P3 squat peak', 'P3 skate PUMP peak', 'P3 PUMP let go (vs standing)'], duckRows));
key.push(`- **Combat:** P1 read 2 of 3 punches as B (a KICK in VS, Mixed and Showdown) and the kick as R1; P3 presses A for each punch and B for the kick in all three (VS on punch_kick: medians ${sgn(quant(combatLag.A, 0.5))} / ${sgn(quant(combatLag.B, 0.5))} ms after the peak, n ${combatLag.A.length} / ${combatLag.B.length}), and a duck presses nothing in combat (P1's 10 cm duck turned Focus on and off 3 times).`);

// ── §4 boards and racing ──
say('## 4. Boards and racing',
  'P1\'s resting stick braked the skater forever, climbed the surfer up the face and sprinted the Free Runner at the camera. P3 writes y only from running in place (Free Run), holds both axes through a jump, and pops once per told take-off with the gather\'s depth still on the trigger.');
const boardRows: (string | number)[][] = [];
for (const k of ['skateboard', 'snowboard_slalom', 'surf', 'bigair', 'sprint', 'freerun', 'velocitykart', 'aeroaces']) {
  const p = prof(k), st = seam(k, takes.get('stand_still')!);
  const all = [...takes.values(), ...scripted].map((t) => seam(k, t));
  const out = all.reduce((a, r) => a + r.floor.length, 0);
  boardRows.push([k, p.bindings.map((b) => `${b.from} → ${b.verb}`).join(', ') || 'session-only (P8)', st.events.length ? `${st.events.length} events` : 'nothing', out]);
}
say(table(['mode', 'P3 binds', 'P3 standing still sends', 'P3 floor outputs, 12 takes + 21 scripts'], boardRows));
// the pop scaling
const popRows: (string | number)[][] = [];
for (const t of [...takes.values(), ...scripted]) {
  const r = seam('skateboard', t);
  for (const x of presses(r, 'A')) {
    const j = t.fx.gt.jumps.find((q) => Math.abs(x.t - q.takeoff.t) <= 350);
    if (!j) continue;
    const gather = t.packets.filter((q) => q.read.airborne === false && q.read.squat !== null && q.read.t >= j.takeoff.t - 450 && q.read.t <= j.takeoff.t);
    const peak = Math.max(0, ...gather.map((q) => q.read.squat!));
    let rt = 0;
    for (const y of r.events) { if (y.seq >= x.seq) break; if (y.e.t === 'trigger' && y.e.side === 'R') rt = y.e.value; }
    if (ramp(peak) > 0) popRows.push([t.name, Math.round(j.takeoff.t), f2(peak), f2(ramp(peak)), f2(rt)]);
  }
}
say('### The pop carries the gather (skate PUMP on RT at the POP)', table(['stream', 'take-off (ms)', 'gather squat peak', 'its ramp', 'RT at the A'], popRows));
key.push(`- **Boards:** standing still sends nothing (the skater coasts); ${popRows.length} pops with a gather past the dead band carried it on RT into the A (RT at the A ${span(popRows.map((r) => Number(r[4]) * 100))} %, the gathers' ramps ${span(popRows.map((r) => Number(r[3]) * 100))} %).`);

// ── the lag table per verb ──
say('## Lag per verb', 'From the true event to the mode (app) and to the frame that told it (capture): the body reader\'s own wait (a hop is told once it is sure) plus the camera. P3 claims no feel; P5–P8 compensate on the capture clock. Population: the 12 fixtures AND the gate\'s scripted streams (jumps at 2.0 / 2.4 / 2.8 m/s, a 3 Hz jog; seeds 17, 23, 41), pooled — so the POP row here is not the key numbers\' fixtures-only POP lag; `n` counts what each row pooled.');
const lagRows: (string | number)[][] = [];
const verb = (label: string, key: string, match: (t: Take) => { at: number; t: number; truth: number }[]) => {
  const all = [...takes.values(), ...scripted].flatMap(match);
  if (!all.length) return;
  const app = all.map((x) => x.at - x.truth), cap = all.map((x) => x.t - x.truth);
  lagRows.push([label, key, all.length, sgn(quant(app, 0.5)), sgn(quant(app, 0.9)), sgn(quant(cap, 0.5)), sgn(quant(cap, 0.9))]);
};
const hopLag = (key: string) => (t: Take) => presses(seam(key, t), prof(key).bindings.find((b) => b.from === 'takeoff')!.to).flatMap((x) => {
  const j = t.fx.gt.jumps.find((q) => Math.abs(x.t - q.takeoff.t) <= 350);
  return j ? [{ at: x.at, t: x.t, truth: j.takeoff.t }] : [];
});
verb('POP (take-off → A)', 'skateboard', hopLag('skateboard'));
verb('JUMP (take-off → A)', 'snowboard_slalom', hopLag('snowboard_slalom'));
verb('AIR (take-off → A)', 'surf', hopLag('surf'));
verb('JUMP (take-off → A)', 'freerun', hopLag('freerun'));
const strikeLag = (key: string, kind: 'punch' | 'kick') => (t: Take) => {
  const truths = kind === 'punch' ? t.fx.gt.wrist.filter((w) => w.kind === 'punch').map((w) => w.at.t) : t.fx.gt.kicks.map((k) => k.at.t);
  const btn = prof(key).bindings.find((b) => b.from === kind)!.to;
  return presses(seam(key, t), btn).flatMap((x) => { const g = truths.find((q) => Math.abs(x.t - q) <= MATCH_ARM_MS + 150); return g === undefined ? [] : [{ at: x.at, t: x.t, truth: g }]; });
};
verb('JAB (punch → A)', 'karate_vs', strikeLag('karate_vs', 'punch'));
verb('STRIKE (punch → A)', 'mixedcombat', strikeLag('mixedcombat', 'punch'));
verb('KICK (kick → B)', 'karate_vs', strikeLag('karate_vs', 'kick'));
verb('STRIDE (step → d-pad)', 'sprint', (t) => {
  const downs = t.fx.gt.steps.flatMap((s) => (s.down ? [s.down.t] : []));
  return seam('sprint', t).events.filter((x) => x.e.t === 'dpad' && x.e.pressed).flatMap((x) => { const g = downs.filter((q) => q <= x.t && x.t - q <= 300).pop(); return g === undefined ? [] : [{ at: x.at, t: x.t, truth: g }]; });
});
say(table(['verb', 'mode', 'n', 'app median', 'app p90', 'capture median', 'capture p90'], lagRows));

md.splice(keyAt, 0, '## Key numbers', ...key, '');
say('## Reproduce', '```', 'node node_modules/tsx/dist/cli.mjs scripts/body/seam.mts', 'npx vitest run lib/input/bodyGate.test.ts lib/pose/baseline.test.ts', '```');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`wrote ${OUT} (${md.length} lines)`);
