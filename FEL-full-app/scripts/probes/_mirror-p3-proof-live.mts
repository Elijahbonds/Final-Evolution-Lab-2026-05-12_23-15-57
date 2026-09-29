// MIRROR-COACH P3 (2026-09-26) — THE PHASE'S LIVE PROOF on the lane's dev server (:3131), one Modified screen end to end.
//
// THE FEED. The camera cannot run headless with a person in it (Chromium's fake device is a test pattern), so this uses
// the EXISTING TEST SEAM of the P1/P2/P3 live proofs, not a new fixture route: an init script finds MediaPipe's
// PoseLandmarker in the page's webpack module cache and replaces detectForVideo with a player that returns a landmark
// fixture's frame for the moment the camera frame arrives, chosen by the station the HUD shows. Everything after that is
// the served app, unmodified — the adapter, the compositor's PoseFrameGate, the ScreenRunner and its graders, the HUD,
// the station card, the post, the answers card, speechSynthesis.
//
// THE BODIES are P1's landmark-fixture harness as P3 grew it (lib/mirror/fixtures/stations.ts: joints built in 3-D,
// filmed through the synth's virtual webcam, jittered) — synthetic, not a person:
//   heels       back to the camera, clean                         → heel line reads (pass expected)
//   frontStack  facing, the LEFT knee 6 cm inside its hip–ankle line, shoulders and hips level
//                                                                 → shoulder + hip level pass, knee window flagged (left)
//   breath      facing, clean (a self-report station: no camera grade — answered by tap after the screen)
//   profile     THE WRONG VIEW: the same facing body at the side-on station, for STALL_SEC; then side-on with the face
//               and the feet not seen (nose, heels and toes at visibility 0.3 — a hood up, dark shoes on a dark floor):
//               the head float grader cannot tell which way the body faces → unreadable, reason wrongView
//   wobbleL/R   one leg each, steady                              → pass
// The harness's POST and PATCH to /api/mirror/screen go to the real route first (401 on this lane: no session, database
// offline) and then to /dev/mirror-coach-p3-screen, which runs the route's own pipeline (decideScreenPost → storedScreen;
// selfReportAnswersFor → withSelfReport) over an in-memory table — the harness renders that answer. The coach panel is
// /dev/coach-prescribe?case=live&screenId=<this screen>: coachDraft over the row that pipeline stored, and the one-tap add
// through the builder's own builderAction into a Prep section.
//
// Run from FEL-full-app (Node 26):
//   /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p3-proof-live.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import * as stationsNs from '../../lib/mirror/fixtures/stations.ts';
import * as landmarksNs from '../../lib/pose/landmarks.ts';
import * as gradersNs from '../../lib/mirror/stationGraders.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const ST = unwrap(stationsNs), LM = unwrap(landmarksNs), GR = unwrap(gradersNs);

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const DEV = `${BASE}/dev/mirror-coach-p3-screen`;
const OUT = process.argv[2] ?? '/tmp/mirror-p3-proof-live';
/** How long the wrong-view body stands at the side-on station before it turns. */
const STALL_SEC = Number(process.env.STALL_SEC ?? 45);
mkdirSync(OUT, { recursive: true });
type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), feed: 'test seam: PoseLandmarker.detectForVideo swapped in the page (init script), fixtures from lib/mirror/fixtures/stations.ts', frames: {} };
const save = () => writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const log = (...a: unknown[]) => console.log(...a);

// ── the station bodies, built in node, in the page player's shape ────────────────────────────────────────────────
const FACING_POINTS = [LM.NOSE, LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX];
const faceAndFeetUnseen = (frames: Json[]) => frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l: Json, i: number) => (FACING_POINTS.includes(i) ? { ...l, visibility: 0.3 } : l)) }));
const forPage = (name: string, frames: Json[], truth: Json) => {
  const fr = frames.map((f) => ({ t: Math.round(f.timestampMs * 1000) / 1000, present: f.present, lm: f.present ? f.landmarks.map((l: Json) => [l.x, l.y, l.z, l.visibility]) : [] }));
  return { name, fps: 30, dur: fr[fr.length - 1].t + 1000 / 30, frames: fr, truth };
};
const PAGES = {
  heels: forPage('heels', ST.film(ST.standClip(ST.toBack(ST.standPose()), 20), ST.JITTER(31)), { view: 'back' }),
  frontStack: forPage('frontStack', ST.film(ST.standClip(ST.standPose({ kneeIn: { left: 6 } }), 20), ST.JITTER(32)), { view: 'front', kneeInCm: { left: 6 }, shoulderUpCm: 0, hipDropCm: 0 }),
  breath: forPage('breath', ST.film(ST.standClip(ST.standPose(), 14), ST.JITTER(33)), { view: 'front' }),
  profileFront: forPage('profileFront', ST.film(ST.standClip(ST.standPose(), 16), ST.JITTER(34)), { view: 'front', atStation: 'profile (side)', wrongView: true }),
  profileUnseen: forPage('profileUnseen', faceAndFeetUnseen(ST.film(ST.standClip(ST.toSide(ST.standPose()), 16), ST.JITTER(35))), { view: 'side', noseHeelsToesVisibility: 0.3 }),
  wobbleL: forPage('wobbleL', ST.film(ST.singleLegClip({ stance: 'left', settleSec: 1, holdSec: 40 }), ST.JITTER(36)), { stance: 'left', steady: true }),
  wobbleR: forPage('wobbleR', ST.film(ST.singleLegClip({ stance: 'right', settleSec: 1, holdSec: 40 }), ST.JITTER(37)), { stance: 'right', steady: true }),
};
const STATIONS = ['heels', 'frontStack', 'breath', 'profileFront', 'wobbleL', 'wobbleR'];
out.stationBodies = Object.fromEntries(Object.values(PAGES).map((p) => [p.name, { seconds: Math.round(p.dur / 100) / 10, truth: p.truth }]));

// ── the page-side player (the P3 graders-live probe's) ─────────────────────────────────────────────────────────────
const INIT = `(() => {
  self.__name = self.__name || ((f) => f);
  const fx = window.__fx = { byName: {}, stations: null, stationIdx: 0, t0: null, lastName: null, calls: 0, served: 0, patched: false, said: [], req: null, errors: [] };
  try {
    const ss = window.speechSynthesis;
    if (ss && ss.speak) { const orig = ss.speak.bind(ss); ss.speak = (u) => { fx.said.push({ t: Math.round(performance.now()), text: u && u.text }); try { return orig(u); } catch (e) {} }; }
  } catch (e) {}
  self.webpackChunk_N_E = self.webpackChunk_N_E || [];
  self.webpackChunk_N_E.push([['fel-p3-proof-' + Math.random()], {}, (r) => { fx.req = r; }]);
  fx.mod = (re) => { const r = fx.req; if (!r) return null; const id = Object.keys(r.m || {}).find((k) => re.test(k)); return id ? r(id) : null; };
  const station = () => {
    for (const s of document.querySelectorAll('span')) { const m = /· station (\\d+)$/.exec((s.textContent || '').trim()); if (m) return Number(m[1]) - 1; }
    return null;
  };
  setInterval(() => { const i = station(); if (i != null) fx.stationIdx = i; }, 100);
  const current = () => fx.stations ? fx.stations[Math.min(fx.stationIdx, fx.stations.length - 1)] : null;
  const patch = (P) => {
    const orig = P.prototype.detectForVideo;
    P.prototype.detectForVideo = function (video, ts) {
      fx.calls++;
      const name = current();
      const f = name && fx.byName[name];
      if (!f) return orig.call(this, video, ts);
      if (fx.t0 == null || fx.lastName !== name) { fx.t0 = ts; fx.lastName = name; }
      const el = ts - fx.t0;
      const local = el - Math.floor(el / f.dur) * f.dur;
      let i = f.frames.length - 1;
      while (i > 0 && f.frames[i].t > local) i--;
      const fr = f.frames[i];
      fx.served++;
      return { landmarks: fr.present ? [fr.lm.map((l) => ({ x: l[0], y: l[1], z: l[2], visibility: l[3] }))] : [], worldLandmarks: [] };
    };
    fx.patched = true;
  };
  const tryPatch = () => {
    if (fx.patched) return;
    try { const ex = fx.mod(/@mediapipe[\\\\/]tasks-vision[\\\\/]vision_bundle/); if (ex && ex.PoseLandmarker && ex.PoseLandmarker.prototype.detectForVideo) patch(ex.PoseLandmarker); } catch (e) { fx.errors.push(String(e)); }
    if (!fx.patched) setTimeout(tryPatch, 100);
  };
  tryPatch();
  window.__read = () => {
    const spans = [...document.querySelectorAll('span')].map((s) => (s.textContent || '').trim());
    const hud = spans.find((t) => /· station \\d+$/.test(t)) || null;
    const clockEl = [...document.querySelectorAll('span.tabular-nums')].find((s) => /^\\d+$/.test((s.textContent || '').trim()));
    const clock = clockEl ? Number(clockEl.textContent.trim()) : null;
    const liveChip = spans.find((t) => /^(Live|Ready|Camera|Loading)$/.test(t)) || null;
    const big = [...document.querySelectorAll('p')].find((p) => /text-\\[22px\\]/.test(p.className));
    const card = document.querySelector('section[aria-label="Station results"]');
    const rows = card ? [...card.querySelectorAll('li[data-check]')].map((li) => ({ check: li.getAttribute('data-check'), status: li.getAttribute('data-status'), text: (li.textContent || '').replace(/\\s+/g, ' ').trim() })) : [];
    const titles = card ? [...card.querySelectorAll('li[data-station] > p')].map((p) => (p.textContent || '').trim()) : [];
    const skip = [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Skip the retest');
    const found = [...document.querySelectorAll('h2')].some((h) => h.textContent === 'What the screen found');
    return { hud, clock, liveChip, big: big ? (big.textContent || '').trim() : null, rows, titles, skip, found, station: fx.stationIdx, served: fx.served, patched: fx.patched, feeding: fx.lastName };
  };
})();`;

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const devPost = async (body: unknown) => (await fetch(DEV, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<Json>;
const devGet = async (screenId: string) => (await (await fetch(`${DEV}?screenId=${encodeURIComponent(screenId)}`)).json() as Json).stored;
const shot = async (page: Page, file: string, what: string, url: string, sel?: string, fullPage = false) => {
  if (sel) await page.locator(sel).first().screenshot({ path: join(OUT, file) });
  else await page.screenshot({ path: join(OUT, file), fullPage });
  out.frames[file] = { url, what };
};
const errorsOf = (errors: string[]) => errors.filter((e) => !/favicon|DevTools|net::ERR_|Failed to load resource|WebGL|GPU stall|webpack-hmr|XNNPACK|401|Unauthorized/i.test(e));

const rec: Json = { posts: [], patches: [] };
out.screen = rec;
try {
  // ── 1. the Modified screen, run to completion ────────────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 }, permissions: ['camera'] });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.route('**/api/mirror/screen', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    const real = await route.fetch().then(async (r) => ({ status: r.status(), body: (await r.text()).slice(0, 120) })).catch((e) => ({ status: -1, body: String(e) }));
    if (req.method() === 'POST') {
      const dev = await devPost(body);
      rec.posts.push({ body, realRoute: real, pipeline: dev });
      await route.fulfill({ status: dev.status, json: dev.response });
    } else {
      const r = await fetch(DEV, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      rec.patches.push({ body, realRoute: real, status: r.status, answer: j });
      await route.fulfill({ status: r.status, json: j });
    }
  });

  await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  const tab = page.getByRole('tab', { name: 'Movement Screen' });
  await tab.waitFor({ timeout: 240_000 });
  for (let i = 0; i < 60 && (await tab.getAttribute('aria-selected')) !== 'true'; i++) { await tab.click(); await page.waitForTimeout(1_000); }
  const modified = page.getByRole('button', { name: /Modified screen/ });
  await modified.click();
  rec.modifiedPressed = await modified.getAttribute('aria-pressed');
  await page.evaluate(({ pages, stations }) => { const fx = (window as any).__fx; Object.assign(fx.byName, pages); fx.stations = stations; }, { pages: PAGES, stations: STATIONS });
  await page.getByRole('button', { name: 'Start session' }).click();
  rec.live = await page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);

  const timeline: Json[] = [];
  const stall: Json = { station: 4, feed: 'profileFront (facing the camera)', samples: [] as Json[] };
  rec.wrongViewStall = stall;
  const t0 = Date.now();
  let stallStart: number | null = null, turned = false, retestShot = false, stallShot = false;
  while (Date.now() - t0 < 600_000) {
    const r = await page.evaluate(() => (window as any).__read());
    const s = Math.round((Date.now() - t0) / 100) / 10;
    const key = `${r.hud}|${r.big}|${r.rows.length}|${r.skip}|${r.liveChip}|${r.feeding}`;
    if (!timeline.length || timeline[timeline.length - 1].key !== key) timeline.push({ s, key, hud: r.hud, clock: r.clock, big: r.big, rows: r.rows.length, skip: r.skip, live: r.liveChip, feeding: r.feeding });
    // THE WRONG VIEW at the side-on station: watched for STALL_SEC before the body turns
    if (r.station === 3 && !turned) {
      stallStart ??= Date.now();
      stall.samples.push({ s: Math.round((Date.now() - stallStart) / 100) / 10, hud: r.hud, clock: r.clock, say: r.big, feeding: r.feeding, rows: r.rows.length });
      if (!stallShot && Date.now() - stallStart > 20_000) {
        await shot(page, 'profile-wrong-view-stall.png', 'station 4 (side-on) fed the FACING body: the clock never starts ("Get set", 10), the turn cue on the stage', '/dev/mirror-truth');
        stallShot = true;
      }
      if (Date.now() - stallStart >= STALL_SEC * 1000) {
        await page.evaluate(() => { (window as any).__fx.stations[3] = 'profileUnseen'; });
        stall.turnedAtSec = Math.round((Date.now() - stallStart) / 100) / 10;
        turned = true;
      }
    }
    if (!retestShot && r.skip && r.station === 3 && r.rows.some((x: Json) => x.check === 'headFloat')) {
      await shot(page, 'station-card-head-retest.png', 'head float Not read after the first hold: the card\'s retest line; "Skip the retest" beside End session', '/dev/mirror-truth', 'section[aria-label="Station results"]');
      rec.retestOffer = { hud: r.hud, say: r.big, rows: r.rows.filter((x: Json) => x.check === 'headFloat') };
      retestShot = true;
    }
    if (r.found && rec.posts.length) break;
    await page.waitForTimeout(400);
  }
  rec.secondsToComplete = Math.round((Date.now() - t0) / 1000);
  stall.clockValues = [...new Set(stall.samples.filter((x: Json) => x.feeding === 'profileFront').map((x: Json) => x.clock))];
  stall.hudValues = [...new Set(stall.samples.filter((x: Json) => x.feeding === 'profileFront').map((x: Json) => x.hud))];
  stall.sayValues = [...new Set(stall.samples.filter((x: Json) => x.feeding === 'profileFront').map((x: Json) => x.say))];
  stall.sampleCount = stall.samples.length;
  stall.samples = stall.samples.filter((_: Json, i: number) => i % 10 === 0);   // kept thin
  await page.waitForTimeout(2_000);

  // the finished screen: the station card, the summary panel, the next steps
  const end = await page.evaluate(() => (window as any).__read());
  rec.timeline = timeline.map(({ key, ...x }) => x);
  rec.card = { titles: end.titles, rows: end.rows };
  rec.spoken = (await page.evaluate(() => (window as any).__fx.said)).map((x: Json) => x.text);
  const panel = page.locator('section').filter({ has: page.locator('h2', { hasText: 'What the screen found' }) }).first();
  rec.panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  rec.nextStepsText = (await page.locator('[data-next-steps]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  await shot(page, 'station-result-card.png', 'the finished Modified screen\'s station-by-station card: value + unit + status, the FIX line under the knee flag, head float "Not read after one retest"', '/dev/mirror-truth', 'section[aria-label="Station results"]');
  await shot(page, 'screen-complete.png', 'the whole finished screen: stage, station card, "What the screen found" (the server\'s summary), What to work on, the answers card', '/dev/mirror-truth', undefined, true);

  const post = rec.posts[0];
  if (post) {
    rec.postBody = post.body;
    rec.realRouteAnswer = post.realRoute;
    rec.serverAnswer = post.pipeline.response;
    rec.stored = post.pipeline.dev?.stored;
    rec.coachReason = post.pipeline.dev?.coachReason;
    writeFileSync(join(OUT, 'post-body.json'), `${JSON.stringify(post.body, null, 2)}\n`);
    // every posted grade re-decided in node by the server's own function, from its summary numbers alone
    rec.regrade = (post.body.grades as Json[]).map((g) => ({ checkId: g.checkId, stationId: g.stationId, side: g.side ?? null, client: g.status, server: GR.regradeFromSummary(g)?.status ?? null, value: g.value, unit: g.unit, reason: g.reason ?? null, frames: g.frames, readableFrames: g.readableFrames }));
  }

  // ── 2. the breath station's answers, by tap ─────────────────────────────────────────────────────────────────────
  const screenId: string | undefined = rec.serverAnswer?.screenId;
  rec.screenId = screenId;
  const answers = page.locator('section[aria-labelledby="screen-self-report-heading"]');
  rec.answersCardBefore = (await answers.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (screenId) {
    const before = await devGet(screenId);
    const groups = answers.getByRole('group');
    rec.questions = await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    await groups.nth(0).getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByText('Saved with this screen.').waitFor({ timeout: 20_000 }).catch(() => {});
    await groups.nth(1).getByRole('button', { name: 'Not sure', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText('Saved with this screen.').waitFor({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    rec.pressed = await answers.locator('button[aria-pressed="true"]').allInnerTexts();
    rec.saveLine = (await answers.locator('p[aria-live="polite"]').innerText().catch(() => '')).trim();
    const after = await devGet(screenId);
    const strip = (m: Json | null) => { if (!m) return m; const { selfReport: _s, ...rest } = m; void _s; return rest; };
    rec.selfReportStored = after?.selfReport ?? null;
    rec.scoredPartUnchangedByAnswers = JSON.stringify(strip(before)) === JSON.stringify(strip(after));
    rec.patchStatuses = rec.patches.map((p: Json) => ({ realRoute: p.realRoute.status, pipeline: p.status }));
    await shot(page, 'self-report-answered.png', 'the breath station\'s answers card after two taps (Yes; Not sure) and the saved line — not graded, not scored', '/dev/mirror-truth', 'section[aria-labelledby="screen-self-report-heading"]');
  }

  // ── 3. the same body through the server's pipeline: as posted, cut to two readable checks, and to three ─────────
  if (post) {
    const g = post.body.grades as Json[];
    const only = (ids: string[]) => g.filter((x) => ids.includes(x.checkId));
    const tries: Record<string, Json> = {
      asPosted: { ...post.body, screenId: 'replay-as-posted' },
      twoReadable_heel_knee: { ...post.body, screenId: 'replay-two', grades: only(['heelLine', 'kneeWindow']) },
      threeReadable_heel_knee_hip: { ...post.body, screenId: 'replay-three', grades: only(['heelLine', 'kneeWindow', 'hipLevel']) },
      threeReadable_oneStation: { ...post.body, screenId: 'replay-three-one-station', grades: only(['kneeWindow', 'hipLevel', 'shoulderLevel']) },
      kneeFlagPostedAsPass: { ...post.body, screenId: 'replay-knee-pass', grades: g.map((x) => (x.checkId === 'kneeWindow' ? { ...x, status: 'pass' } : x)) },
    };
    rec.replays = {};
    for (const [k, b] of Object.entries(tries)) {
      const j = await devPost(b);
      const r = j.response ?? {};
      rec.replays[k] = j.status === 422
        ? { status: 422, error: r.error, refused: r.refused }
        : { status: j.status, graded: r.graded, provisional: r.provisional, readableCameraChecks: r.readableCameraChecks, paid: r.paid, score: r.summary?.score ?? null, movementFlags: r.summary?.movementFlags, triage: r.summary?.triage, message: r.message };
    }
  }

  // ── 4. 390 px ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(800);
  rec.overflowAt390 = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  await shot(page, 'station-result-card-390.png', 'the station card at phone width (390 px)', '/dev/mirror-truth', 'section[aria-label="Station results"]');
  rec.pageErrors = errorsOf(errors);
  save();
  await ctx.close();

  // ── 5. the coach's panel, drafted from the row this screen stored ──────────────────────────────────────────────
  if (screenId) {
    const coach: Json = {};
    out.coach = coach;
    const cctx = await browser.newContext({ viewport: { width: 1180, height: 1700 } });
    const cp = await cctx.newPage();
    const cerr: string[] = [];
    cp.on('pageerror', (e) => cerr.push(`pageerror: ${e.message}`));
    const url = `${BASE}/dev/coach-prescribe?case=live&screenId=${encodeURIComponent(screenId)}&reset=1`;
    await cp.goto(url, { waitUntil: 'networkidle', timeout: 240_000 });
    await cp.waitForSelector('[data-screen-review]', { timeout: 120_000 });
    coach.groups = await cp.$$eval('[data-group]', (els) => els.map((e) => `${e.getAttribute('data-group')}: ${(e.textContent ?? '').trim()}`));
    coach.cameraRows = await cp.$$eval('[data-screen-review] [data-check]', (els) => els.map((e) => ({ check: e.getAttribute('data-check'), status: e.getAttribute('data-status'), text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
    coach.reviewText = await cp.$eval('[data-screen-review]', (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    coach.prescriptions = await cp.$$eval('[data-prescription]', (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    coach.prepBefore = await cp.$$eval('[data-prep-exercise]', (els) => els.map((e) => (e.textContent ?? '').trim()));
    await shot(cp, 'coach-panel.png', 'coach panel from THIS screen\'s stored row: the camera group (knee flag + FIX + block, head float to run again), their answers (withheld), hands-on checks; the Prep draft', url, undefined, true);
    const block = cp.locator('[data-add-block]').first();
    coach.oneTapLabel = (await block.textContent().catch(() => null))?.trim() ?? null;
    if (await block.count()) {
      await block.click();
      await cp.waitForFunction(() => document.querySelectorAll('[data-prep-exercise]').length > 0, undefined, { timeout: 60_000 }).catch(() => {});
      await cp.waitForTimeout(800);
    }
    coach.prepAfter = await cp.$$eval('[data-prep-exercise]', (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    coach.inPrepMarks = await cp.$$eval('[data-prescription]', (els) => els.map((e) => (e.textContent ?? '').includes('In Prep')));
    // a fresh load of the program, as the builder returns it
    const loaded = await (await fetch(`${BASE}/dev/coach-prescribe/api?case=live&screenId=${encodeURIComponent(screenId)}&op=load`)).json() as Json;
    coach.freshLoadPrep = (loaded.tree?.blocks ?? []).flatMap((b: Json) => b.sessions.flatMap((s: Json) => s.exercises.filter((e: Json) => e.section === 'prep')
      .map((e: Json) => ({ where: `${b.label} · ${s.label}`, name: e.name, section: e.section, sets: e.sets, reps: e.reps, load: e.load, tempo: e.tempo, rest: e.restSeconds, note: e.coachNote }))));
    coach.athleteSide = await cp.$eval('[data-next-steps]', (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).catch(() => null);
    await shot(cp, 'coach-panel-after-add.png', 'after the one tap: the knee corrective in Week 1 · Day 1 Prep (fresh load), "In Prep" on the draft row', url, undefined, true);
    await cp.setViewportSize({ width: 390, height: 1700 });
    await cp.waitForTimeout(600);
    coach.overflowAt390 = await cp.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    coach.pageErrors = errorsOf(cerr);
    // the real coach route on this lane: guarded
    coach.realPrescribeNoSession = (await fetch(`${BASE}/api/coach/prescribe?clientId=x`)).status;
    await cctx.close();
  }
} catch (e) {
  out.error = String(e).slice(0, 800);
} finally {
  save();
  await browser.close();
  const r = out.screen ?? {};
  log(JSON.stringify({
    secs: r.secondsToComplete, stallClock: r.wrongViewStall?.clockValues, stallHud: r.wrongViewStall?.hudValues,
    rows: r.card?.rows?.map((x: Json) => `${x.check}:${x.status}`), server: r.serverAnswer && { score: r.serverAnswer.summary?.score, flags: r.serverAnswer.summary?.movementFlags, triage: r.serverAnswer.summary?.triage, provisional: r.serverAnswer.provisional, readable: r.serverAnswer.readableCameraChecks, paid: r.serverAnswer.paid },
    selfReport: r.selfReportStored, replays: r.replays && Object.fromEntries(Object.entries(r.replays).map(([k, v]: [string, any]) => [k, v.status === 422 ? '422' : `${v.provisional ? 'provisional' : 'screen'} ${v.paid ? 'paid' : 'unpaid'} readable ${v.readableCameraChecks}`])),
    coach: out.coach && { groups: out.coach.groups?.length, prepAfter: out.coach.prepAfter }, errors: r.pageErrors, error: out.error,
  }, null, 1));
  log(`wrote ${join(OUT, 'live-proof.json')}`);
}
