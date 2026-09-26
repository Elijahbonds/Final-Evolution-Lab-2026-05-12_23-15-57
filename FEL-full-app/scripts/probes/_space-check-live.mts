// _space-check-live — movement play P4's live check (2026-09-25): the space check on the READY screen of a real game,
// through its shipping host, the way a player meets it. No camera for the most part: frames go in through
// window.__FEL_POSE_FEED__ (streams from lib/pose/streamKit, shot at 3.6 m with the lens at 1.2 m), and the player's own
// taps are real clicks — the READY card's PLAY WITH YOUR BODY, the header's Body button.
//
// It runs on /dev/body/<key>?agent=1 (the host with its BootSplash, and BodyControl above it: /dev/mode has no splash),
// per mode:
//   1. OFFER     READY offers body play on the nine bound games, says "coming" on dunk, and nothing on football;
//   2. MEMORY    after the tap, a reload pre-selects the button — and the camera stays off until the next tap;
//   3. CHECK     the tap, then the check's session (stand → reach → lower → stand): the panel's stage and line go
//                frame → arms → still → ready, and the Coach's lines in that order;
//   4. GATE      polled every 50 ms through the whole check (the 1.4 s reach included): the source never 'live' before
//                the panel's ready, no calibrated packet, no body input on the bus, and the game still at READY;
//   5. FAILS     (the first mode) crafted streams on a new body each: too close, the feet cut, too far, a weak read, a
//                second body, a jog through the stand — each its line, never ready; then the fix, ready;
//   6. WARN      (the first mode) a 15 Hz camera: the slow-camera line, then ready, with jump height 'unread';
//   7. START     both hands up: the game plays; the corner self-view is there, mirrored;
//   8. STOP      the header Body button: the corner goes, the source and the camera service idle, the final packet out;
//   9. SHORTCUT  mid-play, the header Body button again: the game pauses, the check runs over the pause, and both hands
//                up once it is set bring the game back;
//  10. REAL CAMERA (REAL=1, the first mode) Chromium's fake camera (a test pattern): the camera starts, the model loads
//                from /pose/, the <video> sits in a mirrored self-view; Camera off leaves no <video> and an ended track;
//                and from the tap to the stop, no request leaves the origin and none is a POST;
//  11. SHOTS     SHOTS=<dir>: READY with the choice, the panel, the corner in play, the check over a pause;
//  12. COST      the seam's per-frame cost in the page while the check runs and once it has stopped (the difference is
//                the check's), and the check's own cost in node.
//
// It needs a `next dev` of the tree under test (/dev/body 404s under `next start`), with no .env: /dev/body needs no
// database and no login. It starts no server.
//
//   BASE=http://127.0.0.1:3097 MODES=skateboard,dunk,football PATH=/opt/homebrew/bin:$PATH \
//     node node_modules/tsx/dist/cli.mjs scripts/probes/_space-check-live.mts
//   REAL=1 …   also the fake-camera run (step 10)
//   SHOTS=<dir> …   screenshots
//   DRY=1 …   builds the streams and times the check in node only
import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as scNs from '../../lib/move/spaceCheck.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { restPose, moveJoints, synthesize } = unwrap(synNs);
const { spaceSession, swapStream, script, hold, jogBeat, armsSwing } = unwrap(kitNs);
const { SpaceCheck } = unwrap(scNs);

const BASE = (process.env.BASE ?? 'http://127.0.0.1:3097').replace(/\/$/, '');
const BOUND = ['skateboard', 'snowboard_slalom', 'surf', 'sprint', 'bigair', 'freerun', 'karate_vs', 'mixedcombat', 'showdown'];
const MODES = (process.env.MODES ?? [...BOUND, 'dunk', 'football'].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.env.DRY === '1';
const REAL = process.env.REAL === '1';
const HEADLESS = process.env.HEADED !== '1';
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p: Page, name: string): Promise<void> => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {}); };

// ── the streams (node side; the feed retimes them onto the page clock) ────────────────────────────────────────────
const PLAY = { distance: 3.6, heightM: 1.2 };
const R0 = restPose();
const shoot = (clip: ReturnType<typeof spaceSession>, seed: number, camera: object = PLAY, extra: object = {}) =>
  synthesize(clip, { camera, seed, ...extra }).frames as PoseFrame[];
const stand = (sec: number, j = R0) => script([hold(j, sec)], 30);
const SESSION = shoot(spaceSession({ end: 5.5 }), 17);
// both hands up for 1.2 s after a stand (BodySession's START is 800 ms), then down
const HANDS_UP = shoot(script([hold(R0, 0.6), hold(armsSwing(R0, 1), 1.3), hold(R0, 0.8)], 30), 23);
const dimmed = (fs: PoseFrame[]) => fs.map((f) => (f.present ? { ...f, image: f.image.map((l) => ({ ...l, v: l.v * 0.5 })) } : f));
const FAILS: { name: string; frames: PoseFrame[]; say: string }[] = [
  { name: 'too close (2.7 m)', frames: shoot(stand(3), 31, { distance: 2.7, heightM: 1.2 }), say: 'coach.space.back' },
  { name: 'feet cut (lens 1.9 m)', frames: shoot(stand(3), 32, { distance: 3.6, heightM: 1.9 }), say: 'coach.space.feet' },
  { name: 'too far (5.5 m)', frames: shoot(stand(3), 33, { distance: 5.5, heightM: 1.2 }), say: 'coach.space.closer' },
  { name: 'a weak read (visibility × 0.5)', frames: dimmed(shoot(stand(3), 34)), say: 'space.dim' },
  {
    name: 'a second body (turns every 5 frames)',
    frames: swapStream(shoot(spaceSession({ end: 5 }), 35), shoot(spaceSession({ end: 5, body: moveJoints(R0, [0.6, 0, 0]) }), 36), { from: 10, every: 5 }),
    say: 'space.one',
  },
  {
    name: 'a jog through the stand',
    frames: (() => { const r = shoot(spaceSession({ end: 2.9 }), 37); const j = shoot(script([jogBeat(R0, 3, 3, 0.15)], 30), 38); const t0 = r[r.length - 1].t + 33; return [...r, ...j.map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }))]; })(),
    say: 'coach.space.still',
  },
];
const SLOW = shoot(spaceSession({ end: 8 }), 39, PLAY, { fps: 15 });

function nodeCost(): { median: number; p90: number; frames: number } {
  const ms: number[] = [];
  const c = new SpaceCheck();
  for (const f of SESSION) { const t = performance.now(); c.push(f); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return { median: +ms[ms.length >> 1].toFixed(4), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(4), frames: ms.length };
}
if (DRY) {
  console.log(JSON.stringify({ session: SESSION.length, handsUp: HANDS_UP.length, fails: FAILS.map((f) => [f.name, f.frames.length]), slow: SLOW.length, nodeCostMs: nodeCost() }, null, 1));
  process.exit(0);
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────
interface Poll { at: number; stage: string | null; say: string | null; src: string; phase: string | null; view: string }
interface Tap { bus: { at: number; src?: string; t: string }[]; body: { at: number; calibrated: boolean; final: boolean }[]; polls: Poll[] }

async function launch(real = false): Promise<Browser> {
  const args = ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'];
  if (real) args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream');
  return chromium.launch({ executablePath: chromiumExe(), headless: HEADLESS, args });
}

async function open(p: Page, key: string): Promise<void> {
  await p.goto(`${BASE}/dev/body/${key}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_SPACE__ && !!w.__FEL_DEV__?.input
      && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300_000, polling: 250 });
}

/** The bus and the body taps, and a 50 ms poll of the panel, the source and the game's phase. */
async function tap(p: Page): Promise<void> {
  await p.evaluate(() => {
    const w = window as any, bus = w.__FEL_DEV__.input;
    const t: Tap = { bus: [], body: [], polls: [] };
    w.__P4 = t;
    bus.on((e: any) => t.bus.push({ at: performance.now(), src: e.src, t: e.t }));
    bus.onBody((pk: any) => t.body.push({ at: performance.now(), calibrated: pk.read.calibrated, final: !!pk.final }));
    setInterval(() => {
      const panel = document.querySelector('[data-fel-space-panel]') as HTMLElement | null;
      t.polls.push({
        at: performance.now(), stage: panel?.dataset.felSpaceStage ?? null, say: panel?.dataset.felSpaceSay ?? null,
        src: w.__FEL_BODY__.snapshot().state, phase: w.__FEL_SPACE__.session().phase, view: w.__FEL_SPACE__.view().stage,
      });
    }, 50);
  });
}
const tapOf = (p: Page) => p.evaluate(() => (window as any).__P4 as Tap);

async function play(p: Page, frames: PoseFrame[]): Promise<{ from: number; to: number }> {
  return p.evaluate(async (fs) => {
    const feed = (window as any).__FEL_POSE_FEED__;
    const from = performance.now();
    await feed.play(fs);
    await new Promise((r) => setTimeout(r, 300));
    return { from, to: performance.now() };
  }, frames);
}
const waitFor = (p: Page, fn: string, ms = 8000) => p.waitForFunction(fn, null, { timeout: ms, polling: 50 }).then(() => true, () => false);
/** The distinct values a poll field took over [a, b], in order. */
const seq = (t: Tap, k: keyof Poll, a: number, b: number) =>
  t.polls.filter((x) => x.at >= a && x.at <= b).map((x) => x[k]).filter((v, i, arr) => v !== null && v !== '' && (i === 0 || v !== arr[i - 1]));

const report: Record<string, unknown> = {};
const errors: string[] = [];
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await ctx.addInitScript('window.__name = (f) => f;');
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

let first = true;
for (const key of MODES) {
  const row: Record<string, unknown> = {};
  try {
    await open(page, key);
    // 1. OFFER
    const offer = await page.evaluate(() => {
      const b = document.querySelector('[data-fel-body-play]') as HTMLElement | null;
      return { button: b?.textContent ?? null, state: b?.dataset.felBodyPlay ?? null, coming: document.body.innerText.includes('Body play is coming to this game.') };
    });
    row.offer = { ...offer, verdict: BOUND.includes(key) ? (offer.button === 'PLAY WITH YOUR BODY' && !offer.coming ? 'OFFERED' : 'MISSING')
      : key === 'football' ? (!offer.button && !offer.coming ? 'NOTHING (right)' : 'WRONG') : (!offer.button && offer.coming ? 'COMING (right)' : 'WRONG') };
    await shot(page, `${key}-1-ready`);
    if (!BOUND.includes(key)) {
      // the header Body button on a game that does not offer body play: the card, never a camera
      await page.click('button[aria-label="Play with your body"]');
      await page.waitForTimeout(800);
      row.bodyButton = await page.evaluate(() => ({ source: (window as any).__FEL_BODY__.snapshot().state, card: document.body.innerText.includes('Not in this game') }));
      report[key] = row;
      continue;
    }

    // 2. MEMORY: the tap remembers; a reload pre-selects, and the camera stays off
    await page.evaluate(() => (window as any).__FEL_POSE_FEED__.begin());
    await page.click('[data-fel-body-play]');
    await waitFor(page, `document.querySelector('[data-fel-space-panel]') !== null`);
    await open(page, key);
    await page.waitForTimeout(1500);
    row.memory = await page.evaluate(() => ({
      button: (document.querySelector('[data-fel-body-play]') as HTMLElement | null)?.dataset.felBodyPlay ?? null,
      source: (window as any).__FEL_BODY__.snapshot().state, camera: (window as any).__FEL_POSE_FEED__.status().state,
    }));

    // 3 + 4. CHECK, and the GATE through it
    await tap(page);
    await page.evaluate(() => (window as any).__FEL_POSE_FEED__.begin());
    const tapAt = await page.evaluate(() => performance.now());
    await page.click('[data-fel-body-play]');
    await shot(page, `${key}-2-panel`);
    const s1 = await play(page, SESSION);
    await waitFor(page, `document.querySelector('[data-fel-space-panel]')?.dataset.felSpaceStage === 'ready'`, 4000);
    let t = await tapOf(page);
    const readyAt = t.polls.find((x) => x.at >= tapAt && x.stage === 'ready')?.at ?? null;
    await shot(page, `${key}-3-ready`);
    const until = readyAt ?? s1.to;
    row.check = {
      stages: seq(t, 'stage', tapAt, until), says: seq(t, 'say', tapAt, until), readyAfterMs: readyAt ? Math.round(readyAt - s1.from) : null,
      verdict: readyAt ? 'READY' : 'NOT READY',
    };
    row.gate = {
      sourceLiveBeforeReady: t.polls.filter((x) => x.at >= tapAt && x.at < until && x.src === 'live').length,
      calibratedPacketsBeforeReady: t.body.filter((x) => x.at >= tapAt && x.at < until - 60 && x.calibrated).length,
      bodyInputsBeforeReady: t.bus.filter((x) => x.at >= tapAt && x.at < until && x.src === 'body').length,
      phases: seq(t, 'phase', tapAt, until),
    };
    (row.gate as any).verdict = (row.gate as any).sourceLiveBeforeReady === 0 && (row.gate as any).calibratedPacketsBeforeReady === 0
      && (row.gate as any).bodyInputsBeforeReady === 0 && JSON.stringify((row.gate as any).phases) === '["ready"]' ? 'NOTHING BEFORE THE CHECK' : 'LEAK';

    // 5 + 6. FAILS and WARN (the first mode): a new body each, its line, never ready; then the fix
    if (first) {
      const fails: Record<string, unknown> = {};
      for (const f of FAILS) {
        await page.evaluate(() => (window as any).__FEL_SPACE__.handOver());
        const w = await play(page, f.frames);
        t = await tapOf(page);
        const says = seq(t, 'say', w.from, w.to), stages = seq(t, 'stage', w.from, w.to);
        fails[f.name] = { says, stages, verdict: !stages.includes('ready') && says[says.length - 1] === f.say ? 'FAILS RIGHT' : `WRONG (wanted ${f.say})` };
      }
      await page.evaluate(() => (window as any).__FEL_SPACE__.handOver());
      const fx = await play(page, SESSION);
      t = await tapOf(page);
      fails.fix = seq(t, 'stage', fx.from, fx.to).includes('ready') ? 'READY AFTER THE FIX' : 'NOT READY';
      row.fails = fails;
      await page.evaluate(() => (window as any).__FEL_SPACE__.handOver());
      const sw = await play(page, SLOW);
      t = await tapOf(page);
      const v = await page.evaluate(() => (window as any).__FEL_SPACE__.view());
      row.warn = { says: seq(t, 'say', sw.from, sw.to), ready: seq(t, 'stage', sw.from, sw.to).includes('ready'), poseHz: v.poseHz, jumpHeight: v.jumpHeight };
      (row.warn as any).verdict = (row.warn as any).ready && v.jumpHeight === 'unread' && (row.warn as any).says.includes('space.rate') ? 'WARNED, PLAYS' : 'WRONG';
      // back to 30 Hz for the start
      await page.evaluate(() => (window as any).__FEL_SPACE__.handOver());
      await play(page, SESSION);
    }

    // COST while the check runs (frames pushed one at a time through the feed: the whole seam, synchronously)
    const cost = (frames: PoseFrame[]) => page.evaluate((fs) => {
      const feed = (window as any).__FEL_POSE_FEED__;
      const base = performance.now() + 50, t0 = fs[0].t, ms: number[] = [];
      for (const f of fs) { const tt = base + (f.t - t0); const at = performance.now(); feed.push({ ...f, t: tt, arrive: tt + 66 }); ms.push(performance.now() - at); }
      ms.sort((a, b) => a - b);
      return { median: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3), frames: ms.length };
    }, frames);
    // the pushed frames' capture times run ~2 s ahead of the page clock: the next stream waits them out, or its frames
    // would be older than the last one read (a reader never reads backwards, and the session holds nothing on it)
    const costWait = () => page.waitForTimeout(2300);
    const costChecking = await cost(SESSION.slice(0, 60));
    await costWait();

    // 7. START: both hands up
    const h = await play(page, HANDS_UP);
    t = await tapOf(page);
    const playingAt = t.polls.find((x) => x.at >= h.from && x.phase === 'playing')?.at ?? null;
    await page.waitForTimeout(400);
    const corner = await page.evaluate(() => {
      const c = document.querySelector('[data-fel-selfview-corner]') as HTMLElement | null;
      const flip = c?.querySelector('[data-fel-selfview] > div') as HTMLElement | null;
      return { corner: c?.dataset.felSelfviewCorner ?? null, mirrored: flip ? getComputedStyle(flip).transform : null, checking: (window as any).__FEL_SPACE__.view().checking };
    });
    row.start = { playing: playingAt != null, afterArmsUpMs: playingAt ? Math.round(playingAt - (h.from + 600)) : null, ...corner };
    (row.start as any).verdict = playingAt != null && corner.corner && /matrix\(-1/.test(corner.mirrored ?? '') && !corner.checking ? 'PLAYING, CORNER MIRRORED' : 'WRONG';
    await shot(page, `${key}-4-corner`);
    const costPlaying = await cost(SESSION.slice(0, 60));
    await costWait();
    row.pageCostMs = { checking: costChecking, playing: costPlaying, note: 'the whole seam per pushed frame (page timer: 0.1 ms steps)' };

    // 8. STOP: the header Body button (on → off)
    const finalsBefore = (await tapOf(page)).body.filter((x) => x.final).length;
    await page.click('button[aria-label="Turn body play off"]');
    await page.waitForTimeout(500);
    const stop = await page.evaluate(() => ({
      corner: !!document.querySelector('[data-fel-selfview-corner]'), source: (window as any).__FEL_BODY__.snapshot().state,
      camera: (window as any).__FEL_POSE_FEED__.status().state, videos: document.querySelectorAll('video').length,
    }));
    const finals = (await tapOf(page)).body.filter((x) => x.final).length - finalsBefore;
    row.stop = { ...stop, finalPackets: finals, verdict: !stop.corner && stop.source === 'idle' && stop.camera === 'idle' && finals >= 1 ? 'OFF' : 'WRONG' };

    // 9. SHORTCUT mid-play: the header Body button pauses, the check runs over the pause, hands up resumes. (The cost
    // run's frames stopped for 2.3 s with the body playing: P3's stall watchdog paused the game, as it should — a tap
    // on the pause brings it back first.)
    if (await page.evaluate(() => (window as any).__FEL_SPACE__.session().phase === 'paused')) {
      await page.click('text=PAUSED — TAP TO RESUME');
      await waitFor(page, `window.__FEL_SPACE__.session().phase === 'playing'`, 3000);
    }
    const phaseNow = await page.evaluate(() => (window as any).__FEL_SPACE__.session().phase);
    if (phaseNow !== 'playing') row.shortcut = { skipped: `the game is ${phaseNow} (the run ended before the shortcut)` };
    else {
      await page.evaluate(() => (window as any).__FEL_POSE_FEED__.begin());
      await page.click('button[aria-label="Play with your body"]');
      const paused = await waitFor(page, `window.__FEL_SPACE__.session().phase === 'paused' && !!document.querySelector('[data-fel-space-panel="paused"]')`, 4000);
      await shot(page, `${key}-5-check-over-pause`);
      await play(page, SESSION);
      const set = await waitFor(page, `document.querySelector('[data-fel-space-panel="paused"]')?.dataset.felSpaceStage === 'ready'`, 4000);
      const r = await play(page, HANDS_UP);
      t = await tapOf(page);
      const back = t.polls.find((x) => x.at >= r.from && x.phase === 'playing');
      row.shortcut = { paused, set, resumed: !!back, verdict: paused && set && back ? 'PAUSED, CHECKED, RESUMED' : 'WRONG' };
      await page.evaluate(() => (window as any).__FEL_SPACE__.end());
    }
    first = false;
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  report[key] = row;
}
await browser.close();

// 10. REAL CAMERA: Chromium's fake device, no person — the camera, the model, the self-view, the teardown, the network
if (REAL) {
  const key = MODES.find((m) => BOUND.includes(m)) ?? 'skateboard';
  const b = await launch(true);
  const c = await b.newContext({ viewport: { width: 1100, height: 760 }, permissions: ['camera'] });
  await c.addInitScript('window.__name = (f) => f;');
  const p = await c.newPage();
  const row: Record<string, unknown> = {};
  try {
    await open(p, key);
    const origin = new URL(BASE).origin;
    const requests: { url: string; method: string }[] = [];
    let recording = false;
    p.on('request', (r) => { if (recording) requests.push({ url: r.url(), method: r.method() }); });
    recording = true;
    await p.click('[data-fel-body-play]');
    const live = await waitFor(p, `(() => { const s = window.__FEL_POSE_FEED__.status(); return s.state === 'live' && s.source === 'camera'; })()`, 60000);
    await p.waitForTimeout(1500);
    const view = await p.evaluate(() => {
      const v = document.querySelector('video');
      const sv = v?.closest('[data-fel-selfview]') as HTMLElement | null;
      const flip = v?.parentElement?.parentElement as HTMLElement | null;
      const st = (window as any).__FEL_POSE_FEED__.status();
      return { videoInSelfView: !!sv, mirrored: sv?.dataset.felSelfview ?? null, transform: flip ? getComputedStyle(flip).transform : null, model: st.model, camera: st.camera };
    });
    await shot(p, `${key}-6-real-camera`);
    await p.click('text=Camera off');
    await p.waitForTimeout(800);
    const after = await p.evaluate(() => ({ videos: document.querySelectorAll('video').length, camera: (window as any).__FEL_POSE_FEED__.status().state }));
    recording = false;
    const cross = requests.filter((r) => new URL(r.url).origin !== origin && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
    // a GET or a HEAD (lib/pose/assets.ts asks whether our copy of the model is there) reads; anything else would send
    const posts = requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
    const assets = [...new Set(requests.map((r) => new URL(r.url).pathname).filter((u) => u.startsWith('/pose/') || u.startsWith('/audio/voice/v1/coach/')))];
    row.real = {
      live, ...view, after, requests: requests.length, crossOrigin: cross.map((r) => r.url).slice(0, 10), nonGet: posts.map((r) => `${r.method} ${r.url}`).slice(0, 10), assets,
      verdict: live && view.videoInSelfView && /matrix\(-1/.test(view.transform ?? '') && after.videos === 0 && after.camera === 'idle' && !cross.length && !posts.length ? 'LOCAL ONLY' : 'CHECK',
    };
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  report['REAL CAMERA'] = row;
  await b.close();
}

console.log(JSON.stringify({ base: BASE, nodeCostMs: nodeCost(), modes: report, pageErrors: errors.slice(0, 20) }, null, 1));
