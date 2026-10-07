// _hoops-body-live — hoops by body's live check (Mirror & coaching Phase 7, 2026-10-07): the 3PT, 1v1 and 3v3 driven by the
// body alone on the real running modes. No camera: frames go in through window.__FEL_POSE_FEED__ (the feed moves each
// frame's capture time onto the page clock and keeps its arrival lag), the Body button is __FEL_BODY__.start(). From
// _combat-body-live.mts / _body-seam-live.mts.
//
// The offline gates (lib/move/hoopsBody.test.ts, lib/move/bodyControlSource.test.ts) replay the chain in node; this proves
// the page runs it — the reader's events reach the harness, the claimed kinds reach the mode's onBody past the START latch,
// and the mode acts (its own `[3PT-BODY]` / `[3PT-SHOT]` / `[1V1-SHOT]` / `[3V3-SHOT]` lines) — on /dev/mode/<key>?agent=0
// (NOT the agent bridge: under ?agent=1 the hero's slot is the AgentControlSource and the body's merge is bypassed by design):
//   L1 READY    a still stand keeps READY;
//   L2 START    the hands-up hold → playing;
//   L3 QUIET    a stand, a jog in place, two dips: no shot started (no `[3PT-BODY]`, no `hold:` / `gather` line);
//   L4 SHOTS    synthesized jump shots released 120 ms before the top, 100 ms after it and 300 ms before it: one shot each,
//               graded on the body's clock (3PT: the `[3PT-BODY] timed` line and the release's quality; 1v1 / 3v3: the gather
//               and the follow-through's quality, while the hero carries);
//   L7 LOST     a 2 s dropout pauses the game (the body drives it now); both hands up resumes it.
// SYNTHESIZED streams (lib/move/hoopsStreams): no recorded take has a release at a chosen instant.
//
//   BASE=http://localhost:3197 MODES=threepoint,onevone LAT=120 node node_modules/tsx/dist/cli.mjs scripts/probes/_hoops-body-live.mts
//   PROBE_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" …   the browser's flags (Linux, no GPU)
// It needs a `next dev` of the tree under test (no .env: /dev/mode needs no database and no login).
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as hsNs from '../../lib/move/hoopsStreams.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { synthesize } = unwrap(synNs);
const { script, hold, jogBeat, crouch, armsSwing, dropout } = unwrap(kitNs);
const { REST, shotBeat } = unwrap(hsNs);

const BASE = (process.env.BASE ?? 'http://localhost:3197').replace(/\/$/, '');
const MODES = (process.env.MODES ?? 'threepoint,onevone,threevthree').split(',').map((s) => s.trim()).filter(Boolean);
const LAT = Number(process.env.LAT ?? 120);
const HEADLESS = process.env.HEADED !== '1';
const TAG = /^\[(3PT-BODY|3PT-SHOT|1V1-SHOT|1V1-DEF|3V3-SHOT|3V3-DEF)\]/;

const ARMS_UP = armsSwing(REST, 1);
const film = (beats: Parameters<typeof script>[0], seed = 17): PoseFrame[] => synthesize(script(beats), { seed, fps: 30, latencyMs: LAT }).frames;
const STAND = film([hold(REST, 2.2)]);
const HANDS_UP = film([hold(REST, 1.0), hold(ARMS_UP, 1.3), hold(REST, 1.0)], 41);
const QUIET = film([hold(REST, 1.2), hold(REST, 1.5), jogBeat(REST, 3, 2.6, 0.2), hold(REST, 0.6),
  [0.7, (t: number) => crouch(REST, 0.22 * Math.sin(Math.PI * t / 0.7))], hold(REST, 0.6), [0.7, (t: number) => crouch(REST, 0.18 * Math.sin(Math.PI * t / 0.7))], hold(REST, 0.8)], 23);
const shotFilm = (off: number, seed: number) => film([hold(REST, 1.0), shotBeat({ releaseVsApexSec: off }).beat, hold(REST, 1.4)], seed);

interface Tap { logs: { at: number; text: string }[]; phases: { at: number; phase: string }[] }
// PROBE_ARGS: the browser's flags (on a Linux box with no GPU: "--use-angle=swiftshader --enable-unsafe-swiftshader" — the
// default headless GL never leaves 'loading' there; the Mac probes pass --use-angle=metal)
const ARGS = (process.env.PROBE_ARGS ?? '').split(' ').filter(Boolean);
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: HEADLESS, args: ARGS });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript('window.__name = (f) => f;');

async function open(p: Page, key: string): Promise<void> {
  await p.goto(`${BASE}/dev/mode/${key}?agent=0`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300_000, polling: 250 });
  await p.evaluate(async (tagSrc) => {
    const w = window as any, re = new RegExp(tagSrc);
    const tap: Tap = { logs: [], phases: [] };
    w.__HB = tap;
    void re;
    let last = '';
    setInterval(() => { const m = /DEV · \S+ · (\w+)/.exec(document.body.innerText); if (m && m[1] !== last) { last = m[1]; tap.phases.push({ at: performance.now(), phase: last }); } }, 20);
    w.__FEL_POSE_FEED__.begin();
    await w.__FEL_BODY__.start({ autoCalibrate: true });
  }, TAG.source);
}
/** Play frames, then hold the last one in frame (a body standing still) until the next play — the stall watchdog never fires. */
async function play(p: Page, frames: PoseFrame[]): Promise<{ from: number; to: number }> {
  return p.evaluate(async (fr) => {
    const w = window as any, feed = w.__FEL_POSE_FEED__;
    clearInterval(w.__HB_HOLD);
    const from = performance.now();
    await feed.play(fr);
    const last = fr[fr.length - 1], lag = (last.arrive ?? last.t) - last.t;
    if (last.present) w.__HB_HOLD = setInterval(() => { const now = performance.now(); feed.push({ ...last, t: now - lag, arrive: now }); }, 33);
    await new Promise((r) => setTimeout(r, 600));
    return { from, to: performance.now() };
  }, frames);
}
const tapOf = (p: Page) => p.evaluate(() => (window as any).__HB as Tap);
const phaseAt = (t: Tap, at: number) => { let ph = 'ready'; for (const x of t.phases) { if (x.at > at) break; ph = x.phase; } return ph; };

const report: Record<string, unknown> = {};
const errors: string[] = [];
/** The mode's own lines, read off the page's console as they come (a slow page delivers a take's frames in bursts, so the
 *  lines are filed under the stage that was playing when they arrived, not by a page-clock window). */
let stage = '';
const lines: Record<string, string[]> = {};
const linesOf = (st: string, re?: RegExp) => (lines[st] ?? []).filter((l) => !re || re.test(l));
for (const key of MODES) {
  const row: Record<string, unknown> = {};
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${key}: ${String(e.message).slice(0, 160)}`));
  page.on('console', (m) => { const t = m.text(); if (TAG.test(t)) (lines[`${key}:${stage}`] ??= []).push(t.slice(0, 220)); });
  const at = async (st: string, frames: PoseFrame[], settleMs = 1500) => { stage = st; const w = await play(page, frames); await page.waitForTimeout(settleMs); return w; };
  try {
    await open(page, key);
    const w1 = await at('stand', STAND, 0);
    let t = await tapOf(page);
    row.L1 = { keptOnStand: phaseAt(t, w1.to - 50) === 'ready' };
    const w2 = await at('start', HANDS_UP, 0);
    t = await tapOf(page);
    const woke = t.phases.find((x) => x.at >= w2.from && x.phase === 'playing');
    row.L2 = { woke: !!woke, afterStartMs: woke ? Math.round(woke.at - w2.from) : null };
    // the 3PT's first ball comes off the rack after the jog to it; the 1v1 / 3v3 check-ball settles: wait with the body in frame
    await page.waitForTimeout(key === 'threepoint' ? 3500 : 2500);
    const shotRe = key === 'threepoint' ? /^\[3PT-(BODY|SHOT)\] (timed|set|held|hold:|release:)/ : key === 'onevone' ? /^\[1V1-SHOT\] (gather|follow-through)|^\[1V1-DEF\] my release/ : /^\[3V3-SHOT\] gather|^\[1V1-SHOT\] follow/;
    // L4 first: the 3PT's 60 s contest clock runs on the game's time, and a software-GL page plays a take several times slower
    const shots: Record<string, unknown> = {};
    for (const [name, off, seed] of [['release 120 ms before the top', -0.12, 31], ['100 ms after', 0.1, 32], ['300 ms before', -0.3, 33]] as const) {
      if (key === 'threepoint') await page.waitForTimeout(1500);   // the next ball off the rack
      const w = await at(`shot ${name}`, shotFilm(off, seed), 2500);
      const t = await tapOf(page);
      shots[name] = { lines: linesOf(`${key}:shot ${name}`), phase: phaseAt(t, w.to) };
    }
    row.L4 = shots;
    const w3 = await at('quiet', QUIET);
    const t3 = await tapOf(page);
    row.L3 = { shotLines: linesOf(`${key}:quiet`, shotRe), phase: phaseAt(t3, w3.to) };
    // L7 LOST → RESUME: 2 s gone, then hands up
    const lostFrames = film([hold(REST, 3.5)], 51);
    const gapAt = lostFrames.find((f) => f.t >= lostFrames[0].t + 900)!.t;
    stage = 'lost';
    const wl = await play(page, dropout(lostFrames, gapAt, gapAt + 2000));
    t = await tapOf(page);
    const paused = t.phases.find((x) => x.at >= wl.from && x.phase === 'paused');
    const wr = await play(page, HANDS_UP);
    t = await tapOf(page);
    row.L7 = { paused: !!paused, afterGapMs: paused ? Math.round(paused.at - (wl.from + (gapAt - lostFrames[0].t))) : null, resumed: !!t.phases.find((x) => x.at >= wr.from && x.phase === 'playing') };
    await page.evaluate(() => { const w = window as any; clearInterval(w.__HB_HOLD); w.__FEL_BODY__.stop(); });
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  report[key] = row;
  console.log(JSON.stringify({ [key]: row }, null, 1));
  await page.close();
}
console.log(JSON.stringify({ base: BASE, lat: LAT, pageErrors: errors.slice(0, 20) }, null, 1));
await browser.close();
