// _pose-feed — drive body control with a pose fixture through window.__FEL_POSE_FEED__, no camera (movement play,
// phase 2, 2026-09-24).
//
// What it proves in a real browser: the feed takes the camera's place in PoseService, body control
// (lib/input/poseSource.ts) calibrates on the take's stand and reads it, and a running InputBus receives the body
// channel — one BodyPacket per camera frame (onBody). The same frames are read offline through the same readers
// (lib/pose/seamReplay's bodyPackets: BodyReader, then ChannelReader) and the take-off events are compared: live and
// offline should agree to within a frame or two of scheduling.
//
// MOVEMENT PLAY P3 (2026-09-24, the step-3 review): the source presses nothing any more. It used to pump the P1 mapper
// into the bus and this compared the A presses with lib/pose/baseline's replay of that mapper; now it publishes the
// body, and what a body PRESSES is each mode's profile, run by the harness (scripts/probes/_body-seam-live.mts proves
// that on real modes). So the bench records packets and compares the reader's events, and it no longer hands the
// source a bus (sharedPoseSource takes a PoseService now: the old `{ emit }` argument broke start()).
//
// Two ways to run it. Both need a running FEL server at BASE (any dev or prod server: it serves /pose/*). Neither
// starts one.
//
//   BENCH (default, no login): the real modules (PoseService, poseSource, InputBus) are bundled with esbuild and served
//   at BASE's own origin by route interception, so /pose/* comes from the server as it would in the app. Without
//   CAMERA nothing is fetched from it (the bench page itself is intercepted). CAMERA=1 also runs the camera path on
//   Chromium's fake device: the real model loads from /pose, frames arrive on the capture clock, stop() frees
//   everything, and no request leaves the origin. The fake picture has no body in it, so the full→lite budget is not
//   exercised here (lib/pose/PoseService.test.ts covers it).
//
//   PAGE=/play/<mode>: a real GameShell mode. It signs in with the local playtest account (PLAYTEST_EMAIL /
//   PLAYTEST_PASSWORD, as _proveit-flow does; the /play routes are behind login), clicks the Body button, and reads
//   the mode's own bus through __FEL_DEV__.input. The hook exists only in development, or on a production build served
//   from this machine (localhost) with AGENT=1 (?agent=1, which also swaps some modes' local input for the agent
//   bridge). The deployed site never has it.
//
//   BASE=http://localhost:3011 FIXTURE=jump_two_foot_low CAMERA=1 \
//     PATH=/opt/homebrew/bin:$PATH node node_modules/tsx/dist/cli.mjs scripts/probes/_pose-feed.mts
//
// By hand, in a browser console on a page with body control:
//   __FEL_POSE_FEED__.begin(); /* click Body */ await __FEL_POSE_FEED__.play(frames); __FEL_POSE_FEED__.status()
import { chromium, type Page } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as seamNs from '../../lib/pose/seamReplay.ts';
import * as gradeNs from '../../lib/pose/grade.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import type { PoseFixture } from '../../lib/pose/synth';
import type { PoseFrame } from '../../lib/pose/landmarks';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (as in scripts/body/baseline.mts)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const S = unwrap(seamNs), G = unwrap(gradeNs), K = unwrap(kitNs);

const LANE = join(import.meta.dirname, '../..');
const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const PAGE = process.env.PAGE ?? null;
const FIXTURE = process.env.FIXTURE ?? 'jump_two_foot_low';
const CAMERA = process.env.CAMERA === '1';
const AGENT = process.env.AGENT === '1';
/** The stand held before the take (the gate's: grade.STAND_SEC): BodyReader calibrates on its still window. */
const STAND_SEC = Number(process.env.STAND_SEC ?? G.STAND_SEC);
/** Live vs offline take-off (capture clock): the feed's timer slack and a frame of retiming. */
const MATCH_MS = 40;

const fixture = (n: string) => JSON.parse(readFileSync(join(LANE, 'lib/pose/__fixtures__', `${n}.json`), 'utf8')) as PoseFixture;
const fx = fixture(FIXTURE);
const f0 = fx.frames[0];
const fps = fx.settings.synth.fps;
// the take on its own stand, as the gate builds it (grade.standFrame; the owner's takes that never stand borrow his)
const stand = G.standFrame(fx, fx.source?.kind === 'deepmotion' ? fixture('stand_still').frames[70] : undefined);
const standFrames: PoseFrame[] = K.holdStill(stand.frame, { sec: STAND_SEC, fps, beforeT: f0.t });

const browser = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-angle=metal', ...(CAMERA ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [])],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: CAMERA ? ['camera'] : [] });
const page = await ctx.newPage();
// tsx compiles the page callbacks below with esbuild's keepNames, which wraps named functions in __name()
await page.addInitScript('window.__name = (f) => f;');
// one packet as the probe keeps it: its capture time, whether it was read, its events (kind + capture time), final
interface Packet { t: number; tracking: boolean; calibrated: boolean; final: boolean; events: { kind: string; t: number }[] }
await page.addInitScript(`window.packetOf = (p) => ({ t: p.read.t, tracking: p.read.tracking, calibrated: p.read.calibrated,
  final: !!p.final, events: p.events.map((e) => ({ kind: e.kind, t: e.t })) });`);
declare const packetOf: (p: unknown) => Packet;
const errors: string[] = [];
const benign = (t: string) => /^(INFO|WARNING|W\d{4}|I\d{4}):/.test(t.trim()) || /XNNPACK delegate|401|favicon/.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !benign(`${m.text()} ${m.location().url}`)) errors.push(`${m.text().slice(0, 140)} ${m.location().url}`); });
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
const offOrigin: string[] = [];
page.on('request', (r) => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(ORIGIN)) offOrigin.push(r.url()); });

/** The bench: the real modules, bundled, on BASE's origin, with a started InputBus as the running "mode". */
async function openBench(p: Page): Promise<void> {
  const out = await build({
    stdin: {
      contents: `
        import { poseService } from './lib/pose/PoseService';
        import { sharedPoseSource, holdSharedPoseSource } from './lib/input/poseSource';
        import { InputBus } from './lib/babylon/core/InputBus';
        window.__POSE_BENCH__ = { poseService, sharedPoseSource, holdSharedPoseSource, InputBus };`,
      resolveDir: LANE, loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    tsconfig: join(LANE, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"development"' },
    banner: { js: 'window.process = { env: { NODE_ENV: "development" } };' },
    logLevel: 'silent',
  });
  const js = out.outputFiles[0].text;
  await p.route(`${ORIGIN}/__pose_bench/**`, (route) => route.request().url().endsWith('.js')
    ? route.fulfill({ contentType: 'application/javascript', body: js })
    : route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><script src="/__pose_bench/bench.js"></script></body>' }));
  await p.goto(`${ORIGIN}/__pose_bench/`);
  await p.waitForFunction(() => !!(window as any).__POSE_BENCH__);
  await p.evaluate(async () => {
    const w = window as any, T = w.__POSE_BENCH__;
    const bus = new T.InputBus();
    bus.start();                                // a running bus: the source publishes to every one (publishBodyToLive)
    w.__PF_EVENTS = [];
    w.__PF_PACKETS = [];
    bus.on((e: unknown) => w.__PF_EVENTS.push({ at: performance.now(), e }));
    bus.onBody((p: any) => w.__PF_PACKETS.push(packetOf(p)));
    w.__PF_SRC = T.sharedPoseSource();          // the page's one source, on the page's PoseService (no bus: P3)
    w.__PF_HOLD = T.holdSharedPoseSource();
    w.__FEL_POSE_FEED__.begin();
    await w.__PF_SRC.start();   // the Body button's click
  });
}

/** A real GameShell mode: sign in, open it, record its bus, switch the Body button on. */
async function openMode(p: Page, path: string): Promise<void> {
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await p.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await p.click('button[type="submit"]');
    const t = Date.now();
    while (Date.now() - t < 30_000 && /\/login/.test(p.url())) await p.waitForTimeout(300);
  }
  await p.goto(`${BASE}${path}${AGENT ? (path.includes('?') ? '&' : '?') + 'agent=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  if (/\/login/.test(p.url())) throw new Error('still on /login: set PLAYTEST_EMAIL / PLAYTEST_PASSWORD for this server');
  await p.waitForFunction(() => !!(window as any).__FEL_POSE_FEED__ && !!(window as any).__FEL_DEV__?.input, null, { timeout: 240_000 });
  await p.evaluate(() => {
    const w = window as any;
    w.__PF_EVENTS = [];
    w.__PF_PACKETS = [];
    w.__FEL_DEV__.input.on((e: unknown) => w.__PF_EVENTS.push({ at: performance.now(), e }));
    w.__FEL_DEV__.input.onBody((p: any) => w.__PF_PACKETS.push(packetOf(p)));
    w.__FEL_POSE_FEED__.begin();
  });
  await p.locator('button[aria-label="Play with your body as the controller"]:visible').first().click();
}

if (PAGE) await openMode(page, PAGE);
else await openBench(page);

const run = await page.evaluate(async ({ standFrames, frames }) => {
  const w = window as any, feed = w.__FEL_POSE_FEED__;
  await feed.play(standFrames);
  await new Promise((r) => setTimeout(r, 100));   // a few more rAF ticks on the stand
  const start = performance.now();
  const delivered = await feed.play(frames);
  await new Promise((r) => setTimeout(r, 300));   // the last frames' events
  const status = feed.status();
  const bodyControl = w.__PF_SRC?.state ?? document.querySelector('button[aria-pressed="true"]')?.getAttribute('aria-label') ?? null;
  feed.end();
  return { start, delivered, status, bodyControl, events: w.__PF_EVENTS as { at: number; e: any }[], packets: w.__PF_PACKETS as Packet[] };
}, { standFrames, frames: fx.frames });

// Live take-offs, as ms after the take's first frame on the capture clock (the feed moves frame i's t to
// start + t_i − t_0) …
const takePackets = run.packets.filter((p) => p.t >= run.start - 1);
const liveOff = run.packets.flatMap((p) => p.events).filter((e) => e.kind === 'takeoff' && e.t >= run.start - 1).map((e) => Math.round(e.t - run.start));
// … and the same frames through the same readers offline, the stand ending a frame before the take (live, the probe
// waits 100 ms between the two plays; the reader is on a still stand across it)
const offOff = S.bodyPackets([...standFrames, ...fx.frames]).flatMap((p) => p.events)
  .filter((e) => e.kind === 'takeoff' && e.t >= f0.t).map((e) => Math.round(e.t - f0.t));
const worst = liveOff.length === offOff.length ? Math.max(0, ...liveOff.map((a, i) => Math.abs(a - offOff[i]))) : null;
// a take with jumps that read none, live or offline, proves nothing: that is not a match
const matched = worst != null && worst <= MATCH_MS && (offOff.length > 0 || fx.gt.jumps.length === 0);

let camera: unknown = null;
if (CAMERA && !PAGE) {
  camera = await page.evaluate(async () => {
    const svc = (window as any).__POSE_BENCH__.poseService();
    let frames = 0, withWorld = 0;
    const unsub = svc.onFrame((f: any) => { frames++; if (!f.present || f.world?.length === 33) withWorld++; });
    const t0 = performance.now();
    const ok = await svc.start();
    const loadMs = Math.round(performance.now() - t0);
    const status = svc.status;
    await new Promise((r) => setTimeout(r, 4000));
    const stats = svc.stats;
    const track = (svc.video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    svc.stop();
    unsub();
    // a stop while the permission prompt is up: the late stream must be stopped, and nothing left behind
    const late = svc.start();
    svc.stop();
    const lateOk = await late;
    await new Promise((r) => setTimeout(r, 500));
    return {
      ok, loadMs, model: status.model, modelWhy: status.modelWhy, camera: status.camera, stats, frames, withWorld,
      trackAfterStop: track?.readyState ?? null, videosLeft: document.querySelectorAll('video').length,
      lateStart: lateOk, stateAfterLateStop: svc.state,
    };
  });
}

console.log(JSON.stringify({
  where: PAGE ? `${BASE}${PAGE}` : `${ORIGIN} (bench)`, fixture: FIXTURE, stand: stand.from, trueJumps: fx.gt.jumps.length,
  delivered: `${run.delivered}/${fx.frames.length}`, bodyControl: run.bodyControl,
  feed: { source: run.status.source, fps: run.status.stats.fps, latencyMs: Math.round(run.status.stats.latencyMs ?? NaN) },
  packets: { total: run.packets.length, take: takePackets.length, calibratedFrom: run.packets.findIndex((p) => p.calibrated), final: run.packets.filter((p) => p.final).length },
  // the source presses nothing (P3): a bus with no harness on it hears no FelInput from the body
  busEvents: run.events.length,
  takeoff: { live: liveOff, offline: offOff, worstDiffMs: worst, verdict: matched ? 'MATCH' : 'DIFFERS' },
  camera, offOriginRequests: offOrigin, errors,
}, null, 1));
await browser.close();
