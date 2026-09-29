// _body-seam-live — movement play P3, step 3's live check (2026-09-24): the seam on a real running mode, driven by
// the body alone. No camera: frames go in through window.__FEL_POSE_FEED__ and the Body button is __FEL_BODY__.start().
//
// The gate (lib/input/bodyGate.test.ts) replays the same chain offline; this proves the harness really runs it — the
// packets reach the mode's bus, the session starts and pauses the real game, the floor's presses reach the mode — on
// /dev/mode/<key>?agent=1, per mode:
//   1. READY   a still stand keeps READY (the body presses nothing to wake it);
//   2. START   both hands held up moves READY → playing (START_HOLD_MS + the camera's lag);
//   3. QUIET   stand_still, jump_two_foot_low and a 20 cm duck, each on its own stand: no misfire — every body event
//              on the bus (a tap on __FEL_DEV__.input) is one the mode's profile allows: nothing at all in a
//              session-only mode, the hop's button once per true jump, the crouch's trigger where a crouch is bound;
//   4. POP     skate on jump_two_foot_low: the QA trace's A presses (the POPs) against the take's true jumps;
//   5. LOST    a 2 s ground dropout pauses a mode the body drives within ~1.3 s of the last tracked frame, never one it
//              does not drive; a body back in frame does not resume it;
//   6. RESUME  both hands up again: back to playing;
//   7. DRIVE   the positive half (a silent floor would pass 1–6): each bound mode, on a fresh body-woken run, gets the
//              take its other bindings exist for — punch_kick (combat: 3 A, 1 B), run_in_place (sprint: one d-pad pulse
//              per step told, by foot; freerun: y ≤ −0.3 with x ≡ 0), shuffle_lateral (skate: |x| ≥ 0.8) — read off
//              what the mode received (QA's presses, the bus's body sticks);
//   COST       the seam's per-frame cost in the page (a frame pushed through the feed synchronously: the reader, the
//              channels and the harness's own handling of the packet — an upper bound on the reader's) — the budget
//              is a median under 1 ms.
// Free Run and Mixed Combat carry the owner's cut line (call 5): a misfire there makes that mode session-only.
//
// It needs a `next dev` of the tree under test at BASE (/dev/mode 404s under `next start`, and preview_start serves
// another tree) — the lane's once it carries the seam, or a checkout of it with no .env (/dev/mode needs no database).
// It starts no server and signs nobody in (/dev/mode needs no login).
//
//   BASE=http://localhost:3011 MODES=skateboard,dunk \
//     PATH=/opt/homebrew/bin:$PATH node node_modules/tsx/dist/cli.mjs scripts/probes/_body-seam-live.mts
//   DRY=1 …   builds the streams and times the reader in node only (no browser, no server)
//   SHOTS=<dir> …   also screenshots each mode at READY, after the hands-up, after the dropout, resumed, and driven
//
// The pad regression half of the live check is two other probes, run before and after the switch-over with the same
// counts expected: scripts/probes/_trigger-count.mts and scripts/probes/_controller-stick-live-smoke.mts. (Run on a
// checkout with no database: _trigger-count without its sign-in, PATHNAME=/dev/mode/football?agent=1; both headless
// with --use-angle=metal — headless on --use-gl=angle never leaves 'loading'.)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as gradeNs from '../../lib/pose/grade.ts';
import * as bNs from '../../lib/pose/baseline.ts';
import * as readerNs from '../../lib/pose/BodyReader.ts';
import * as chNs from '../../lib/pose/bodyChannels.ts';
import * as profNs from '../../lib/input/bodyProfiles.ts';
import type { PoseFixture } from '../../lib/pose/synth.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';
import type { BodyProfile } from '../../lib/input/bodyProfiles.ts';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (as in scripts/body/seam.mts)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { restPose, synthesize } = unwrap(synNs);
const { holdStill, dropout, script, hold, jumpBeat, armsSwing } = unwrap(kitNs);
const { standFrame, STAND_SEC, SPLICE_MS } = unwrap(gradeNs);
const { duckFixture } = unwrap(bNs);
const { BodyReader } = unwrap(readerNs);
const { ChannelReader } = unwrap(chNs);
const { BODY_PROFILES } = unwrap(profNs);

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const MODES = (process.env.MODES ?? 'skateboard,karate_vs,sprint,freerun,mixedcombat,dunk,onevone,brainbrawl,who_scene_it').split(',').map((s) => s.trim()).filter(Boolean);
/** Owner call 5: bound in P3 on the live probe's word — a misfire moves the mode to session-only. */
const CUT_LINE = new Set(['freerun', 'mixedcombat']);
/** 7 (DRIVE): the take each bound mode's non-hop bindings exist for (the gate's positive checks, live). */
const DRIVE: Record<string, string> = {
  karate_vs: 'punch_kick', mixedcombat: 'punch_kick', showdown: 'punch_kick',
  sprint: 'run_in_place', bigair: 'run_in_place', freerun: 'run_in_place', skateboard: 'shuffle_lateral',
};
const DRY = process.env.DRY === '1';
const HEADLESS = process.env.HEADED !== '1';
// MOVEMENT PLAY P3 (2026-09-24, the step-3 live check): SHOTS=<dir> keeps each mode's READY, woken, paused and resumed
// frames — the evidence a report points at (nothing is written without it)
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p: Page, name: string): Promise<void> => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});
};

// ── the streams (node side; the page plays them on its own clock: the feed retimes t and arrive) ────────────────────

interface Stream { name: string; frames: PoseFrame[]; t0: number; lead: number; jumps: number; marks: Record<string, number>; takeoffs?: number[] }
const R0 = restPose();
const ARMS_UP = armsSwing(R0, 1);
const FIX = join(process.cwd(), 'lib/pose/__fixtures__');   // run from the app root, as the usage line says
const loadFx = (n: string) => JSON.parse(readFileSync(join(FIX, `${n}.json`), 'utf8')) as PoseFixture;
const OWNER_STAND = loadFx('stand_still').frames[70];

/** A scripted stream (synth body, seeded); marks = each named beat's start (capture ms). */
function scripted(name: string, beats: [string, ReturnType<typeof hold>][], seed: number, gap?: (m: Record<string, number>) => [number, number]): Stream {
  const marks: Record<string, number> = {};
  let at = 0;
  for (const [k, b] of beats) { marks[k] = at; at += b[0] * 1000; }
  marks.end = at;
  const syn = synthesize(script(beats.map(([, b]) => b)), { seed });
  const g = gap?.(marks);
  if (g) { marks.gapFrom = g[0]; marks.gapTo = g[1]; }
  const frames = g ? dropout(syn.frames, g[0], g[1]) : syn.frames;
  return { name, frames, t0: frames[0].t, lead: 0, jumps: syn.gt.jumps.length, marks };
}
/** A take on its own 1.2 s stand (the gate's lead: grade.standFrame, or the given frame — a duck stands on its first). */
function take(name: string, fx: PoseFixture, stand?: PoseFrame): Stream {
  const t0 = fx.frames[0].t;
  const on = stand ?? standFrame(fx, fx.source?.kind === 'deepmotion' ? OWNER_STAND : undefined).frame;
  const lead = holdStill(on, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: t0 });
  const frames = [...lead, ...fx.frames];
  return { name, frames, t0: frames[0].t, lead: lead.length, jumps: fx.gt.jumps.length, marks: { take: t0 }, takeoffs: fx.gt.jumps.map((j) => j.takeoff.t) };
}

const S_START = scripted('stand, then hands up', [['stand', hold(R0, 2.0)], ['armsUp', hold(ARMS_UP, 1.2)], ['down', hold(R0, 1.2)]], 17);
const S_QUIET: Stream[] = [
  take('stand_still', loadFx('stand_still')),
  take('jump_two_foot_low', loadFx('jump_two_foot_low')),
  (() => { const d = duckFixture(0.2, 17); const s = take('duck 20 cm', d.fx, d.fx.frames.find((f) => f.present)); return { ...s, marks: { ...s.marks, down: d.downAt } }; })(),
];
const JUMP = jumpBeat(R0, 2.4);
const S_LOST = scripted('jump, then 2 s gone', [['stand', hold(R0, 1.5)], ['jump', JUMP], ['stand2', hold(R0, 4.0)]], 23,
  (m) => [m.stand2 + 600, m.stand2 + 2600]);
const S_RESUME = scripted('hands up to resume', [['stand', hold(R0, 1.0)], ['armsUp', hold(ARMS_UP, 1.2)], ['down', hold(R0, 1.0)]], 41);

/** The reader + channels' cost per frame in node (ms, median), over every stream. */
function nodeCost(): { median: number; p90: number; frames: number } {
  const ms: number[] = [];
  for (const s of [S_START, ...S_QUIET, S_LOST, S_RESUME]) {
    const r = new BodyReader(), c = new ChannelReader();
    for (const f of s.frames) { const t = performance.now(); const { read, events } = r.read(f); c.step(read, events); ms.push(performance.now() - t); }
  }
  ms.sort((a, b) => a - b);
  return { median: +ms[ms.length >> 1].toFixed(4), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(4), frames: ms.length };
}

if (DRY) {
  console.log(JSON.stringify({
    streams: [S_START, ...S_QUIET, S_LOST, S_RESUME].map((s) => ({ name: s.name, frames: s.frames.length, lead: s.lead, jumps: s.jumps, marks: s.marks })),
    nodeCostMs: nodeCost(),
  }, null, 1));
  process.exit(0);
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: HEADLESS, args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
// tsx compiles the page callbacks below with esbuild's keepNames, which wraps named functions in __name()
await ctx.addInitScript('window.__name = (f) => f;');

type Tapped = { at: number; e: { t: string; btn?: string; dir?: string; pressed?: boolean; side?: string; x?: number; y?: number; value?: number; src?: string } };
interface Tap {
  bus: Tapped[];
  body: { at: number; tracking: boolean; calibrated: boolean; final: boolean }[];
  /** Every body event (its kind and capture time, page clock after the feed's retiming): to tell the splice's. */
  events: { at: number; kind: string; t: number; foot?: string }[];
  phases: { at: number; phase: string }[];
}

async function open(p: Page, key: string): Promise<void> {
  await p.goto(`${BASE}/dev/mode/${key}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_DEV__?.input && !!w.__FEL_QA__
      && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 240_000, polling: 250 });
  await p.evaluate(async () => {
    const w = window as any, bus = w.__FEL_DEV__.input;
    const tap: Tap = { bus: [], body: [], events: [], phases: [] };
    w.__SEAM = tap;
    bus.on((e: Tapped['e']) => tap.bus.push({ at: performance.now(), e }));
    bus.onBody((p: any) => {
      const at = performance.now();
      tap.body.push({ at, tracking: p.read.tracking, calibrated: p.read.calibrated, final: !!p.final });
      for (const ev of p.events) tap.events.push({ at, kind: ev.kind, t: ev.t, ...(ev.kind === 'step' ? { foot: ev.foot } : {}) });
    });
    // the dev runner prints the harness's phase ("DEV · key · phase"): the only place 'paused' is published. It prints
    // the ModePhase itself — 'ready' at READY (the ready marker's 'loaded' is its own word for the same phase)
    let last = '';
    setInterval(() => {
      const m = /DEV · \S+ · (\w+)/.exec(document.body.innerText);
      if (m && m[1] !== last) { last = m[1]; tap.phases.push({ at: performance.now(), phase: last }); }
    }, 20);
    w.__FEL_POSE_FEED__.begin();
    // the Body button — P3's self-calibrating reader (movement play P4 gates the player's source on the space check,
    // which this probe does not run: scripts/probes/_space-check-live.mts does), so these numbers stay comparable
    await w.__FEL_BODY__.start({ autoCalibrate: true });
  });
}

/** Play a stream on the feed's timing; `from` = when its first frame's capture time maps to (page clock). */
async function play(p: Page, s: Stream): Promise<{ from: number; to: number }> {
  return p.evaluate(async (frames) => {
    const feed = (window as any).__FEL_POSE_FEED__;
    const from = performance.now();
    await feed.play(frames);
    await new Promise((r) => setTimeout(r, 250));   // the last frames' pulses and ticks
    return { from, to: performance.now() };
  }, s.frames);
}

/** A new body: Body off (a final packet), the feed back, Body on (a fresh reader, calibrating on the next stand). */
async function newBody(p: Page): Promise<void> {
  await p.evaluate(async () => {
    const w = window as any;
    w.__FEL_BODY__.stop();
    w.__FEL_POSE_FEED__.begin();   // stop() ended the feed too: without this, start() would open the camera
    await w.__FEL_BODY__.start({ autoCalibrate: true });
  });
}

const tapOf = (p: Page) => p.evaluate(() => (window as any).__SEAM as Tap);
/** The ModePhase the dev runner showed at `at`. Before the first poll it was READY: open() waits for it. */
const phaseAt = (t: Tap, at: number) => { let ph = 'ready'; for (const x of t.phases) { if (x.at > at) break; ph = x.phase; } return ph; };
const firstPhase = (t: Tap, phase: string, after: number) => t.phases.find((x) => x.at >= after && x.phase === phase)?.at ?? null;

/** Every body FelInput on the bus in [a, b], as short labels (a press, a non-zero stick, a trigger value). */
function bodyInputs(t: Tap, a: number, b: number): string[] {
  return t.bus.filter((x) => x.at >= a && x.at <= b && x.e.src === 'body').map(({ e }) =>
    e.t === 'button' ? `${e.btn}${e.pressed ? '↓' : '↑'}`
      : e.t === 'dpad' ? `${e.dir}${e.pressed ? '↓' : '↑'}`
        : e.t === 'stick' ? `L(${e.x},${e.y})` : `${e.side}T ${e.value}`);
}

/**
 * The reader's take-offs at the stand → take splice (a take that starts in the air — jump_two_foot_low — lands its
 * first frame mid-flight on a standing lead): the stream's seam, not a jump, and the gate excludes them the same way
 * (SPLICE_MS of the take's first capture time). The feed moves capture times onto the page clock from the play's start.
 */
function spliceTakeoffs(t: Tap, s: Stream, w: { from: number }): number {
  if (s.marks.take === undefined || s.lead === 0) return 0;
  const splice = w.from + (s.marks.take - s.t0);
  return t.events.filter((e) => e.kind === 'takeoff' && Math.abs(e.t - splice) <= SPLICE_MS).length;
}

/** Misfires on a QUIET stream: body inputs the profile does not allow there (derived from the bindings, as the gate). */
function misfires(prof: BodyProfile, labels: string[], jumps: number): string[] {
  const hop = prof.bindings.find((x) => x.from === 'takeoff')?.to ?? null;
  const trig = prof.bindings.find((x) => x.from === 'squat')?.to ?? null;
  const bad: string[] = [];
  let hops = 0;
  for (const l of labels) {
    if (hop && l === `${hop}↓`) { hops++; continue; }
    if (hop && l === `${hop}↑`) continue;
    if (trig && l.startsWith(`${trig === 'RT' ? 'R' : 'L'}T `)) continue;
    if (l === 'L(0,0)') continue;                     // a release to neutral is never a misfire
    bad.push(l);
  }
  if (hop && hops !== jumps) bad.push(`${hop}×${hops} for ${jumps} jumps`);
  return bad;
}

/**
 * 5 (LOST): play S_LOST and read what the session did with the loss. `endedAfterMs`: the run ended (or left play for
 * anything but a pause) this long after the body left, before the pause could come — nothing to judge on this page.
 */
async function lostCheck(p: Page, drives: boolean): Promise<{ row: Record<string, unknown>; pausedAt: number | null; endedAfterMs: number | null }> {
  const before = firstPhase(await tapOf(p), 'paused', 0);
  const l = await play(p, S_LOST);
  const t = await tapOf(p);
  const pausedAt = firstPhase(t, 'paused', l.from);
  const lastSeen = t.body.filter((x) => x.tracking && !x.final && x.at >= l.from && (pausedAt == null || x.at <= pausedAt)).pop()?.at ?? null;
  const gapAt = l.from + (S_LOST.marks.gapFrom - S_LOST.t0);
  const left = t.phases.find((x) => x.at >= gapAt && x.phase !== 'playing' && x.phase !== 'paused');
  const endedAfterMs = pausedAt == null && left ? Math.round(left.at - gapAt) : null;
  const row: Record<string, unknown> = {
    drives, pausedBefore: before != null,
    // the game's own phase when the body left, and every change over the stream (ms from the body leaving)
    phaseAtGap: phaseAt(t, gapAt),
    phases: t.phases.filter((x) => x.at >= l.from && x.at <= l.to).map((x) => `${Math.round(x.at - gapAt)}:${x.phase}`),
    // who was playing when it left (the session's driver is the latest counted input): inputs over the stream so far
    inputsBeforeGap: {
      body: t.bus.filter((x) => x.at >= l.from && x.at <= gapAt && x.e.src === 'body').length,
      other: t.bus.filter((x) => x.at >= l.from && x.at <= gapAt && x.e.src !== 'body').length,
    },
    paused: pausedAt != null, afterLastSeenMs: pausedAt != null && lastSeen != null ? Math.round(pausedAt - lastSeen) : null,
    stillPausedWhenBack: pausedAt != null ? phaseAt(t, l.to) === 'paused' : null,
    verdict: drives
      ? (pausedAt != null && lastSeen != null && pausedAt - lastSeen <= 1400 ? 'PAUSED'
        : endedAfterMs != null ? `NOT JUDGED (the run ended ${endedAfterMs} ms after the loss)` : 'NO PAUSE (expected one)')
      : (pausedAt == null ? 'NOT PAUSED (session-only)' : 'PAUSED (must not)'),
  };
  return { row, pausedAt, endedAfterMs };
}

const report: Record<string, unknown> = {};
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

for (const key of MODES) {
  const prof = Object.values(BODY_PROFILES).find((x) => x.key === key);
  if (!prof) { report[key] = { error: 'no body profile' }; continue; }
  const drives = prof.bindings.length > 0;
  const row: Record<string, unknown> = { profile: prof.bindings.map((b) => `${b.from}→${b.to} ${b.verb}`).join(', ') || 'session-only' };
  try {
    await open(page, key);
    await shot(page, `${key}-1-ready`);

    // 1 + 2: the stand keeps READY; the hands-up hold wakes it
    const st = await play(page, S_START);
    await shot(page, `${key}-2-after-hands-up`);
    let t = await tapOf(page);
    const upAt = st.from + (S_START.marks.armsUp - S_START.t0);
    const wokeAt = firstPhase(t, 'playing', st.from);
    // MOVEMENT PLAY P3 (2026-09-24, the step-3 review): 'ready', the ModePhase the runner prints — this compared with
    // the ready marker's 'loaded', a word the runner never shows, so READY held on the stand read as a failure
    row.ready = { keptOnStand: phaseAt(t, upAt) === 'ready', bodyInputsBeforeWake: bodyInputs(t, st.from, wokeAt ?? st.to).length };
    row.start = { woke: wokeAt != null, afterArmsUpMs: wokeAt != null ? Math.round(wokeAt - upAt) : null };

    // 3 + 4: the quiet streams, each on a new body (its own stand)
    const quiet: Record<string, unknown> = {};
    for (const s of S_QUIET) {
      await newBody(page);
      const w = await play(page, s);
      t = await tapOf(page);
      const labels = bodyInputs(t, w.from, w.to);
      // a hop is allowed once per true jump, and once for a take-off the reader tells at the splice (the gate's rule)
      const splice = spliceTakeoffs(t, s, w);
      const bad = misfires(prof, labels, (s.name.startsWith('jump') ? s.jumps : 0) + splice);
      quiet[s.name] = { phase: phaseAt(t, w.to), bodyInputs: labels.length, misfires: bad, ...(splice ? { spliceTakeoffs: splice } : {}) };
      if (key === 'skateboard' && s.name === 'jump_two_foot_low') {
        const qa = await page.evaluate(() => (window as any).__FEL_QA__.events(4000) as { t: number; kind: string; key: string }[]);
        const popAt = qa.filter((e) => e.kind === 'press' && e.key === 'A' && e.t >= w.from && e.t <= w.to).map((e) => e.t);
        const pops = popAt.length;
        // MOVEMENT PLAY P3 (2026-09-24, the step-3 live check): each true take-off (page clock) and how long after it
        // its POP reached the mode — the one after it, not before (a POP before the jump would be a misfire, not a lag)
        const truth = (s.takeoffs ?? []).map((to) => w.from + (to - s.t0));
        const popLagMs = truth.map((at) => { const p = popAt.find((x) => x >= at); return p == null ? null : Math.round(p - at); });
        row.pop = { qaPops: pops, trueJumps: s.jumps, spliceTakeoffs: splice, popLagMs, verdict: pops === s.jumps + splice ? 'ONE POP PER JUMP' : 'MISMATCH' };
      }
    }
    row.quiet = quiet;

    // 5: a jump (the body is driving), then 2 s out of frame; the body back in frame does not resume. A mode whose run
    // ends inside the grace (the sprint's rival calls the race ~20 s after GO) cannot show it on this page: it is opened
    // again, woken, and given the loss first thing.
    let lost = await lostCheck(page, drives);
    if (drives && !lost.row.paused && lost.endedAfterMs != null) {
      await open(page, key);
      await play(page, S_START);
      lost = await lostCheck(page, drives);
      lost.row.retried = 'the first run ended before the grace; reopened and woken, the loss run first';
    }
    row.lost = lost.row;
    const pausedAt = lost.pausedAt;
    await shot(page, `${key}-3-after-dropout`);

    // 6: both hands up resumes a paused game
    if (pausedAt != null) {
      const r = await play(page, S_RESUME);
      t = await tapOf(page);
      const upAt2 = r.from + (S_RESUME.marks.armsUp - S_RESUME.t0);
      const back = firstPhase(t, 'playing', r.from);
      row.resume = { resumed: back != null, afterArmsUpMs: back != null ? Math.round(back - upAt2) : null };
      await shot(page, `${key}-4-after-resume`);
    }

    // COST: frames pushed through the feed one at a time, timed around the push (the whole seam, synchronously)
    await newBody(page);
    row.pageCostMs = await page.evaluate((frames) => {
      const feed = (window as any).__FEL_POSE_FEED__;
      const base = performance.now() + 50, t0 = frames[0].t, ms: number[] = [];
      for (const f of frames) {
        const t = base + (f.t - t0);
        const at = performance.now();
        feed.push({ ...f, t, arrive: t + 66 });
        ms.push(performance.now() - at);
      }
      ms.sort((a, b) => a - b);
      return { median: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3), frames: ms.length };
    }, S_QUIET[1].frames);
    row.bodyStats = await page.evaluate(() => (window as any).__FEL_DEV__.input.bodyStats());
    if (CUT_LINE.has(key)) {
      const n = Object.values(quiet).reduce((a: number, q) => a + ((q as { misfires: string[] }).misfires.length), 0);
      row.cutLine = n ? `CUT: ${n} misfire(s) — ${key} goes session-only (owner call 5)` : 'KEEP: no misfire';
    }
    await page.evaluate(() => (window as any).__FEL_BODY__.stop());

    // 7 (DRIVE): the positive half. A silent floor passes every check above, so each bound mode also gets the take its
    // other bindings exist for, on a fresh run the body woke — and what the MODE received is read from QA (a press is
    // logged there after the harness let it through, right before onInput) and the bus (the body's sticks).
    const dn = DRIVE[key];
    if (drives && dn) {
      await open(page, key);
      await play(page, S_START);
      await newBody(page);
      const s = take(dn, loadFx(dn));
      const w = await play(page, s);
      t = await tapOf(page);
      const qa = await page.evaluate(() => (window as any).__FEL_QA__.events(4000) as { t: number; kind: string; key: string }[]);
      const presses: Record<string, number> = {};
      for (const e of qa) if (e.kind === 'press' && e.t >= w.from && e.t <= w.to) presses[e.key] = (presses[e.key] ?? 0) + 1;
      const told: Record<string, number> = {};
      for (const e of t.events) if (e.at >= w.from && e.at <= w.to) told[e.kind] = (told[e.kind] ?? 0) + 1;
      const sticks = t.bus.filter((x) => x.at >= w.from && x.at <= w.to && x.e.src === 'body' && x.e.t === 'stick').map((x) => x.e);
      const minY = sticks.length ? Math.min(...sticks.map((e) => e.y ?? 0)) : 0;
      const maxAbsX = sticks.length ? Math.max(...sticks.map((e) => Math.abs(e.x ?? 0))) : 0;
      const dpad = t.bus.filter((x) => x.at >= w.from && x.at <= w.to && x.e.src === 'body' && x.e.t === 'dpad' && x.e.pressed).map((x) => x.e.dir === 'left' ? 'L' : 'R').join('');
      // by FOOT, as the gate has it: ◀ for each step the reader told on the left foot, ▶ on the right — the reader's own
      // order, which is not always strict alternation (a take can hold two lefts running)
      const feet = t.events.filter((e) => e.at >= w.from && e.at <= w.to && e.kind === 'step').map((e) => e.foot ?? '?').join('');
      const ok = dn === 'punch_kick' ? presses.A === 3 && presses.B === 1
        : dn === 'shuffle_lateral' ? maxAbsX >= 0.8
          : prof.bindings.some((b) => b.from === 'cadence') ? minY <= -0.3 && maxAbsX === 0
            : (presses.DPAD_LEFT ?? 0) + (presses.DPAD_RIGHT ?? 0) === feet.length && dpad.length > 0 && dpad === feet;
      const stats = await page.evaluate(() => (window as any).__FEL_DEV__.input.bodyStats() as Record<string, { n: number; medMs: number; p90Ms: number }>);
      const lagMs = Object.fromEntries(Object.entries(stats).filter(([k]) => ['step', 'punch', 'kick', 'takeoff'].includes(k))
        .map(([k, v]) => [k, { n: v.n, med: Math.round(v.medMs), p90: Math.round(v.p90Ms) }]));
      row.drive = { take: dn, phase: phaseAt(t, w.to), qaPresses: presses, readerTold: told, bodySticks: sticks.length, minY, maxAbsX, ...(dpad ? { dpadByFoot: dpad, feetTold: feet } : {}), lagMs, verdict: ok ? 'RECEIVED' : 'NOT RECEIVED' };
      await shot(page, `${key}-5-drive-${dn}`);
      await page.evaluate(() => (window as any).__FEL_BODY__.stop());
    }
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 240);
  }
  report[key] = row;
}

console.log(JSON.stringify({ base: BASE, nodeCostMs: nodeCost(), modes: report, pageErrors: errors.slice(0, 20) }, null, 1));
await browser.close();
