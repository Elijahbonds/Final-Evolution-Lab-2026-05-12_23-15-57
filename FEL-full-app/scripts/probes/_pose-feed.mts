// _pose-feed — drive body control with a pose fixture through window.__FEL_POSE_FEED__, no camera (movement play,
// phase 2, 2026-09-24).
//
// What it proves in a real browser: the feed takes the camera's place in PoseService, body control
// (lib/input/poseSource.ts) calibrates on the take's stand and maps it, and a running InputBus receives the events. The
// same take is replayed offline through lib/pose/baseline.ts (the phase 1 model of how poseSource drives the mapper)
// and the A presses are compared: live and baseline should agree to within a render tick or two.
//
// Two ways to run it. Both need a running FEL server at BASE (any dev or prod server: it serves /pose/*). Neither
// starts one.
//
//   BENCH (default, no login): the real modules (PoseService, poseSource, InputBus) are bundled with esbuild and served
//   at BASE's own origin by route interception, so /pose/* comes from the server as it would in the app. CAMERA=1 also
//   runs the camera path on Chromium's fake device: the real model loads from /pose, frames arrive on the capture
//   clock, stop() frees everything, and no request leaves the origin. The fake picture has no body in it, so the
//   full→lite budget is not exercised here (lib/pose/PoseService.test.ts covers it).
//
//   PAGE=/play/<mode>: a real GameShell mode. It signs in with the local playtest account (PLAYTEST_EMAIL /
//   PLAYTEST_PASSWORD, as _proveit-flow does; the /play routes are behind login), clicks the Body button, and reads
//   the mode's own bus through __FEL_DEV__.input. The hook exists only in development, or on a production build served
//   from this machine (localhost) with AGENT=1 (?agent=1, which also swaps some modes' local input for the agent
//   bridge). The deployed site never has it.
//
//   BASE=http://localhost:3011 FIXTURE=jump_two_foot_low CAMERA=1 \
//     PATH=/opt/homebrew/Cellar/node/26.8.2/bin:$PATH node node_modules/tsx/dist/cli.mjs scripts/probes/_pose-feed.mts
//
// By hand, in a browser console on a page with body control:
//   __FEL_POSE_FEED__.begin(); /* click Body */ await __FEL_POSE_FEED__.play(frames); __FEL_POSE_FEED__.status()
import { chromium, type Page } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as bNs from '../../lib/pose/baseline.ts';
import type { PoseFixture } from '../../lib/pose/synth';
import type { PoseFrame } from '../../lib/pose/landmarks';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (as in scripts/body/baseline.mts)
const B = ((bNs as unknown as { default?: typeof bNs }).default ?? bNs);

const LANE = join(import.meta.dirname, '../..');
const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const PAGE = process.env.PAGE ?? null;
const FIXTURE = process.env.FIXTURE ?? 'jump_two_foot_low';
const CAMERA = process.env.CAMERA === '1';
const AGENT = process.env.AGENT === '1';
/** The stand held before the take, as the baseline holds it (0.5 s): body control calibrates on it. */
const STAND_SEC = Number(process.env.STAND_SEC ?? 0.5);
/** Live vs baseline A press: a rAF tick (16.7 ms) either side, plus timer slack. */
const MATCH_MS = 40;

const fx = JSON.parse(readFileSync(join(LANE, 'lib/pose/__fixtures__', `${FIXTURE}.json`), 'utf8')) as PoseFixture;
const stand = B.standFor(fx);
const f0 = fx.frames[0];
const lat = (f0.arrive ?? f0.t) - f0.t;
const fps = fx.settings.synth.fps;
const standFrames: PoseFrame[] = Array.from({ length: Math.max(1, Math.round(STAND_SEC * fps)) }, (_, i) => {
  const t = (i * 1000) / fps;
  return { ...fx.frames[stand.frame], t, arrive: t + lat };
});

const browser = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-angle=metal', ...(CAMERA ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [])],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: CAMERA ? ['camera'] : [] });
const page = await ctx.newPage();
// tsx compiles the page callbacks below with esbuild's keepNames, which wraps named functions in __name()
await page.addInitScript('window.__name = (f) => f;');
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
        import { InputBus, emitToLive } from './lib/babylon/core/InputBus';
        window.__POSE_BENCH__ = { poseService, sharedPoseSource, holdSharedPoseSource, InputBus, emitToLive };`,
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
    bus.start();
    w.__PF_EVENTS = [];
    bus.on((e: unknown) => w.__PF_EVENTS.push({ at: performance.now(), e }));
    w.__PF_SRC = T.sharedPoseSource({ emit: (e: unknown) => T.emitToLive(e) });
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
    w.__FEL_DEV__.input.on((e: unknown) => w.__PF_EVENTS.push({ at: performance.now(), e }));
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
  return { start, delivered, status, bodyControl, events: w.__PF_EVENTS as { at: number; e: any }[] };
}, { standFrames, frames: fx.frames });

// Live A presses, as ms after frame 0 ARRIVED (the feed delivers frame i at start + arrive_i − t_0) …
const takeAt = run.start + lat;
const liveA = run.events.filter((x) => x.e.t === 'button' && x.e.btn === 'A' && x.e.pressed).map((x) => Math.round(x.at - takeAt));
// … and the same take through the phase 1 model of poseSource, same stand, same clock origin.
const off = B.replay(fx, { calibration: 'stand' });
const baseA = off.events.filter((x) => B.isPress(x, 'A')).map((x) => Math.round(x.at - off.takeAt));
const worst = liveA.length === baseA.length ? Math.max(0, ...liveA.map((a, i) => Math.abs(a - baseA[i]))) : null;

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
  where: PAGE ? `${BASE}${PAGE}` : `${ORIGIN} (bench)`, fixture: FIXTURE, stand: stand.frame,
  delivered: `${run.delivered}/${fx.frames.length}`, bodyControl: run.bodyControl,
  feed: { source: run.status.source, fps: run.status.stats.fps, latencyMs: Math.round(run.status.stats.latencyMs ?? NaN) },
  busEvents: run.events.length,
  A: { live: liveA, baseline: baseA, worstDiffMs: worst, verdict: worst != null && worst <= MATCH_MS ? 'MATCH' : 'DIFFERS' },
  camera, offOriginRequests: offOrigin, errors,
}, null, 1));
await browser.close();
