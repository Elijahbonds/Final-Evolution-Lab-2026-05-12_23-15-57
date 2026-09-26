// MIRROR-COACH P1 (2026-09-25) — LIVE PROOF on the lane's dev server (:3131): the phase's fixes, in the real pages.
//
// The Mirror is driven by the landmark FIXTURES, live: an init script finds MediaPipe's PoseLandmarker in the page's
// webpack module cache and replaces detectForVideo with a player that returns the fixture's frame for the moment the
// camera frame arrives (looped on its own clock). Everything after that is the served app, unmodified: the adapter,
// SquatAudit, stepSquatSession, the CueEngine, the ScreenRunner, the harness's panels, speechSynthesis. Chromium's fake
// camera supplies the video frames (the pixels are ignored). Nothing in the app is changed to allow it.
//
//   1. squat fixtures (7) through the guided squat → the review's per-leg knee read, the cue log and every spoken line
//   2. the served CueEngine module: production engine fed kneeValgus for 30 s says nothing; no "band" line anywhere
//   3. the Movement Screen, picker on Full, station fixtures switched by the HUD's station number → the POST body, the
//      real route's answer (401: no session on this lane) and the route's pipeline answer (/dev/mirror-coach-p1),
//      which the harness renders; the panel frame
//   4. the coach's Clients tab (/dev/mirror-shots) served the real routes' fixture-database answers
//      (p1/review-fix/coach-routes.json), with prescribe answered for the row stored in 3
//   5. /dev/workout-plans, the live purchase POST, spend() for both SKUs, a stored plan read three times
//   6. copy: rendered text on every page above; /train (auth-gated) from the dev server's compiled server bundle
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p1-live-proof.mts <outDir> [--only squat,screen,coach,workout]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/mirror-p1-live';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const want = (s: string) => !ONLY || ONLY.includes(s);
// --dedupe: SIMULATE the proposed fix for repeated render frames (see the squat section); never the default
const DEDUPE = process.argv.includes('--dedupe');
const COACH_ROUTES = process.env.COACH_ROUTES ?? '/Users/elijahbonds/Claude/outbox/finish-release/painfree/p1/review-fix/coach-routes.json';
mkdirSync(OUT, { recursive: true });
const ROOT = process.cwd();
if (!existsSync(join(ROOT, 'lib/mirror/fixtures'))) throw new Error('run from FEL-full-app');

type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), squat: {}, frames: {} };
const log = (...a: unknown[]) => console.log(...a);
const save = () => writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures', `${name}.json`), 'utf8'));
const forPage = (name: string) => {
  const f = fixture(name);
  return { name, fps: f.fps, dur: f.frames[f.frames.length - 1].t + 1000 / f.fps, frames: f.frames, truth: f.truth };
};

// ── the page-side player ─────────────────────────────────────────────────────────────────────────────────────────
const INIT = `(() => {
  // tsx/esbuild names the probe's own evaluate() arrows with a __name helper the page does not have
  self.__name = self.__name || ((f) => f);
  const fx = window.__fx = { byName: {}, mode: null, name: null, stations: null, stationIdx: 0, t0: null, lastName: null,
    calls: 0, served: 0, loop: -1, patched: false, said: [], req: null, errors: [] };
  try {
    const ss = window.speechSynthesis;
    if (ss && ss.speak) { const orig = ss.speak.bind(ss); ss.speak = (u) => { fx.said.push({ t: Math.round(performance.now()), text: u && u.text }); try { return orig(u); } catch (e) {} }; }
  } catch (e) {}
  self.webpackChunk_N_E = self.webpackChunk_N_E || [];
  self.webpackChunk_N_E.push([['fel-p1-probe-' + Math.random()], {}, (r) => { fx.req = r; }]);
  fx.mod = (re) => {
    const r = fx.req; if (!r) return null;
    const id = Object.keys(r.m || {}).find((k) => re.test(k));
    return id ? r(id) : null;
  };
  const station = () => {
    for (const s of document.querySelectorAll('span')) {
      const m = /· station (\\d+)$/.exec((s.textContent || '').trim());
      if (m) return Number(m[1]) - 1;
    }
    return null;
  };
  setInterval(() => { if (fx.mode === 'screen') { const i = station(); if (i != null) fx.stationIdx = i; } }, 100);
  const current = () => fx.mode === 'squat' ? fx.name : fx.mode === 'screen' && fx.stations ? fx.stations[Math.min(fx.stationIdx, fx.stations.length - 1)] : null;
  const patch = (P) => {
    const orig = P.prototype.detectForVideo;
    P.prototype.detectForVideo = function (video, ts) {
      fx.calls++;
      const name = current();
      const f = name && fx.byName[name];
      if (!f) return orig.call(this, video, ts);
      if (fx.t0 == null || fx.lastName !== name) { fx.t0 = ts; fx.lastName = name; }
      const el = ts - fx.t0;
      const loop = Math.floor(el / f.dur);
      const local = el - loop * f.dur;
      let i = f.frames.length - 1;
      while (i > 0 && f.frames[i].t > local) i--;
      const fr = f.frames[i];
      fx.loop = loop; fx.served++;
      return { landmarks: fr.present ? [fr.lm.map((l) => ({ x: l[0], y: l[1], z: l[2], visibility: l[3] }))] : [], worldLandmarks: [] };
    };
    fx.patched = true;
  };
  const tryPatch = () => {
    if (fx.patched) return;
    try {
      const ex = fx.mod(/@mediapipe[\\/]tasks-vision[\\/]vision_bundle/);
      if (ex && ex.PoseLandmarker && ex.PoseLandmarker.prototype.detectForVideo) patch(ex.PoseLandmarker);
    } catch (e) { fx.errors.push(String(e)); }
    if (!fx.patched) setTimeout(tryPatch, 100);
  };
  tryPatch();
  // Instrument (never change) SquatAudit.evaluate: how often it is handed a frame it has already seen (same timestamp —
  // the render loop runs faster than the camera), and on which kind of frame a non-standing phase returns to standing
  // (what stepSquatSession counts as a rep).
  fx.audit = { calls: 0, repeats: 0, toStandingFresh: 0, toStandingRepeat: 0, lastTs: null, lastPhase: 'standing', patched: false };
  const tryAudit = () => {
    if (fx.audit.patched) return;
    try {
      const m = fx.mod(/neuro-mirror[\\/]rules[\\/]squat-audit/);
      if (m && m.SquatAudit) {
        const orig = m.SquatAudit.prototype.evaluate;
        m.SquatAudit.prototype.evaluate = function (frame) {
          const a = fx.audit;
          const same = frame.timestampMs === a.lastTs;
          // SIMULATION ONLY (probe --dedupe): what a one-line "a frame already evaluated returns its result" guard would do
          if (fx.dedupe && same && a.lastResult) { a.calls++; a.repeats++; return a.lastResult; }
          const r = orig.call(this, frame);
          a.calls++; a.lastResult = r;
          if (same) a.repeats++;
          if (r.present && a.lastPhase !== 'standing' && r.phase === 'standing') { if (same) a.toStandingRepeat++; else a.toStandingFresh++; }
          a.lastPhase = r.phase; a.lastTs = frame.timestampMs;
          return r;
        };
        fx.audit.patched = true;
      }
    } catch (e) { fx.errors.push(String(e)); }
    if (!fx.audit.patched) setTimeout(tryAudit, 100);
  };
  tryAudit();
  // what the page shows, read from the DOM (textContent: the stage chip is CSS-uppercased)
  window.__read = () => {
    const spans = [...document.querySelectorAll('span')];
    const stage = spans.map((s) => (s.textContent || '').trim()).find((t) => /^(breathe|check|work|review)$/.test(t)) || null;
    const repsLabel = [...document.querySelectorAll('p')].find((p) => (p.textContent || '').trim() === 'Reps');
    const reps = repsLabel && repsLabel.previousElementSibling ? Number((repsLabel.previousElementSibling.textContent || '').trim()) : null;
    const rows = [...document.querySelectorAll('ul li')].map((li) => (li.textContent || '').trim())
      .filter((t) => /Knees track over toes|Heels stay down|Shoulders stay centred|Weight stays centred/.test(t));
    return { stage, reps, rows, loop: fx.loop, served: fx.served, patched: fx.patched, said: fx.said.length, station: fx.stationIdx };
  };
})();`;

async function newPage(browser: Browser, viewport = { width: 1180, height: 1400 }) {
  const ctx = await browser.newContext({ viewport, permissions: ['camera'] });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  return { ctx, page, errors };
}
const realErrors = (errors: string[]) => errors.filter((e) => !/favicon|DevTools|React DevTools|net::ERR_|Failed to load resource|WebGL|GPU stall|webpack-hmr|candidate\.glb|XNNPACK|401|Unauthorized/i.test(e));

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name });
  await tab.waitFor({ timeout: 240_000 });
  for (let i = 0; i < 60; i++) {
    await tab.click();
    if ((await tab.getAttribute('aria-selected')) === 'true') return true;
    await page.waitForTimeout(1_000);
  }
  return false;
}
async function waitLive(page: Page) {
  return page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);
}

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

try {
  // ── 1 + 2. the guided squat on each fixture ────────────────────────────────────────────────────────────────────
  if (want('squat')) {
    const names = process.env.SQUAT_ONLY ? process.env.SQUAT_ONLY.split(',')
      : ['squat_knee_in_left', 'squat_knee_in_right', 'squat_knees_in_both', 'squat_knee_out_left', 'squat_knee_out_right', 'squat_knees_out_both', 'squat_clean'];
    for (const name of names) {
      const { ctx, page, errors } = await newPage(browser);
      const rec: Json = { truth: fixture(name).truth };
      try {
        await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
        rec.tabTook = await selectTab(page, 'Corrective Squat');
        await page.evaluate(({ f, dedupe }) => { const fx = (window as any).__fx; fx.byName[f.name] = f; fx.mode = 'squat'; fx.name = f.name; fx.dedupe = dedupe; }, { f: forPage(name), dedupe: DEDUPE });
        rec.dedupeSimulation = DEDUPE;
        await page.getByRole('button', { name: 'Start session' }).click();
        rec.live = await waitLive(page);
        const samples: Json[] = [];
        const t0 = Date.now();
        let workShot = false;
        while (Date.now() - t0 < 170_000) {
          const r = await page.evaluate(() => (window as any).__read());
          samples.push({ ms: Date.now() - t0, ...r });
          if (!workShot && name === 'squat_knee_in_left' && (DEDUPE ? r.stage === 'work' && r.reps >= 3 : r.stage === 'check' || r.stage === 'work')) {
            // mid work set, knee caving on the left: the knee row, the overlay, no knee cue
            await page.screenshot({ path: join(OUT, `squat-knee-in-left-live${DEDUPE ? '-dedupe-sim' : ''}.png`) });
            rec.liveShotAt = r;
            rec.workRows = r.rows; workShot = true;
          }
          if (r.stage === 'review') break;
          await page.waitForTimeout(250);
        }
        const fx = await page.evaluate(() => { const f = (window as any).__fx; const { lastTs, lastPhase, lastResult, ...audit } = f.audit; return { patched: f.patched, served: f.served, calls: f.calls, said: f.said, errors: f.errors, audit }; });
        rec.player = { patched: fx.patched, framesServed: fx.served, detectCalls: fx.calls, errors: fx.errors };
        rec.squatAuditCalls = fx.audit;
        rec.spoken = fx.said.map((s: Json) => s.text);
        // rep bookkeeping: every change of the Reps figure, with the fixture loop it happened on
        const changes: Json[] = [];
        let prev: Json | null = null;
        for (const s of samples) {
          if (!prev || s.reps !== prev.reps || s.stage !== prev.stage) changes.push({ ms: s.ms, stage: s.stage, reps: s.reps, loop: s.loop });
          prev = s;
        }
        rec.repChanges = changes;
        rec.maxRepStep = Math.max(0, ...changes.slice(1).map((c, i) => (c.stage === changes[i].stage ? c.reps - changes[i].reps : 0)));
        const enter = (st: string) => changes.find((c) => c.stage === st);
        const chk = enter('check'), wrk = enter('work'), rev = enter('review');
        rec.loopsPerStage = {
          check: chk && wrk ? wrk.loop - chk.loop : null, checkRepsNeeded: 3,
          work: wrk && rev ? rev.loop - wrk.loop : null, workRepsNeeded: 8,
        };
        rec.finalStage = samples[samples.length - 1]?.stage;
        // the review, as rendered
        const review = page.locator('section').filter({ hasText: 'What the camera measured' }).first();
        rec.reviewText = (await review.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const knee = /L (-?\d+\.\d+) · R (-?\d+\.\d+)\s*· flagged frames (\d+)/.exec(rec.reviewText);
        rec.knee = knee ? { worstInwardL: Number(knee[1]), worstInwardR: Number(knee[2]), flaggedFrames: Number(knee[3]) } : null;
        rec.anyKneeCue = rec.spoken.some((t: string) => /knee|floor apart/i.test(t)) || /floor apart|second toes/i.test(rec.reviewText);
        rec.bandLine = rec.spoken.some((t: string) => /band/i.test(t)) || /band/i.test(rec.reviewText);
        if (['squat_knee_in_left', 'squat_knees_out_both'].includes(name)) {
          const file = `squat-review-${name.replace(/_/g, '-')}${DEDUPE ? '-dedupe-sim' : ''}.png`;
          await review.screenshot({ path: join(OUT, file) }).catch(() => {});
          out.frames[file] = { url: '/dev/mirror-truth', what: `${name}: the guided squat's review after 3 check + 8 work reps` };
        }
        if (name === 'squat_knee_in_left') {
          // 2. the served CueEngine module, in this page
          rec.cueModule = await page.evaluate(() => {
            const fx = (window as any).__fx;
            const m = fx.mod(/neuro-mirror[\\/]rules[\\/]cue-engine/);
            if (!m) return { found: false };
            const run = (eng: any, faults: string[]) => { const said: any[] = []; for (let t = 0; t <= 30_000; t += 100) { const e = eng.decide(t, faults); if (e) said.push({ t, level: e.level, text: e.text }); } return said; };
            const prod = run(new m.CueEngine(), ['kneeValgus']);
            const verified = run(new m.CueEngine({ valgusVerified: true }), ['kneeValgus']);
            const trunk = run(new m.CueEngine(), ['trunkOffset']);
            const arm = run(new m.CueEngine(), ['armFall']);
            return { found: true, VALGUS_CUE_VERIFIED: m.VALGUS_CUE_VERIFIED, productionKneeCues: prod, verifiedKneeCues: verified, trunkOffsetCues: trunk, armFallCues: arm };
          });
        }
      } catch (e) {
        rec.error = String(e).slice(0, 400);
      } finally {
        rec.pageErrors = realErrors(errors);
        out.squat[name] = rec;
        save();
        log(`squat ${name}: stage ${rec.finalStage} knee ${JSON.stringify(rec.knee)} spoken ${rec.spoken?.length} maxRepStep ${rec.maxRepStep} loops ${JSON.stringify(rec.loopsPerStage)} ${rec.error ?? ''}`);
        await ctx.close();
      }
    }
  }

  // ── 3. the Movement Screen on Full ─────────────────────────────────────────────────────────────────────────────
  if (want('screen')) {
    const { ctx, page, errors } = await newPage(browser);
    const rec: Json = {};
    try {
      const stations = ['stand_back', 'stand_front', 'stand_front', 'stand_side', 'stand_side', 'seated_rotation_front', 'single_leg_left', 'single_leg_right'];
      rec.stationFixtures = stations;
      rec.posts = [];
      await page.route('**/api/mirror/screen', async (route) => {
        const body = route.request().postData() ?? '';
        const real = await route.fetch().then(async (r) => ({ status: r.status(), body: (await r.text()).slice(0, 200) })).catch((e) => ({ status: -1, body: String(e) }));
        const dev = await page.request.post(`${BASE}/dev/mirror-coach-p1`, { data: JSON.parse(body || '{}') });
        const j = await dev.json();
        rec.posts.push({ body: JSON.parse(body || '{}'), realRoute: real, pipeline: j });
        await route.fulfill({ json: j.response });
      });
      await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
      rec.tabTook = await selectTab(page, 'Movement Screen');
      const full = page.getByRole('button', { name: /Full screen/ });
      await full.click();
      rec.fullPressed = (await full.getAttribute('aria-pressed')) === 'true';
      rec.modifiedPressed = (await page.getByRole('button', { name: /Modified screen/ }).getAttribute('aria-pressed')) === 'true';
      const pages = Object.fromEntries([...new Set(stations)].map((n) => [n, forPage(n)]));
      await page.evaluate(({ pages, stations }) => { const fx = (window as any).__fx; Object.assign(fx.byName, pages); fx.stations = stations; fx.mode = 'screen'; }, { pages, stations });
      await page.getByRole('button', { name: 'Start session' }).click();
      rec.live = await waitLive(page);
      const seen = new Set<number>();
      const says: string[] = [];
      const t0 = Date.now();
      let done = false;
      while (Date.now() - t0 < 420_000) {
        const r = await page.evaluate(() => {
          const read = (window as any).__read();
          const say = [...document.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).find((t) => t.length > 12 && /camera|Turn|Face|Stay|Sit|Now the|leg|Step|Move/.test(t) && t.length < 200) ?? '';
          const found = !!document.querySelector('h2') && [...document.querySelectorAll('h2')].some((h) => h.textContent === 'What the screen found');
          return { ...read, say, found };
        });
        const idx = await page.evaluate(() => {
          for (const s of document.querySelectorAll('span')) { const m = /· station (\d+)$/.exec((s.textContent || '').trim()); if (m) return Number(m[1]); }
          return null;
        });
        if (idx != null) seen.add(idx);
        if (r.say && says[says.length - 1] !== r.say) says.push(r.say);
        if (r.found && rec.posts.length) { done = true; break; }
        await page.waitForTimeout(400);
      }
      rec.completed = done;
      rec.secondsToComplete = Math.round((Date.now() - t0) / 1000);
      rec.stationsShown = [...seen].sort((a, b) => a - b);
      rec.hudLines = says.slice(0, 30);
      await page.waitForTimeout(1_500);
      const panel = page.locator('section').filter({ hasText: 'What the screen found' }).first();
      rec.panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      rec.panelHasScore = /\bScore\b/.test(rec.panelText);
      rec.panelHasRetry = /Step back and run it again|Not enough of that was in frame/i.test(rec.panelText);
      const bodyText = await page.locator('body').innerText();
      rec.redFlagsAnywhere = /Red flags/.test(bodyText);
      rec.spoken = (await page.evaluate(() => (window as any).__fx.said)).map((s: Json) => s.text);
      await page.screenshot({ path: join(OUT, 'screen-full-result.png'), fullPage: true });
      out.frames['screen-full-result.png'] = { url: '/dev/mirror-truth', what: 'Movement Screen, Full, run to completion on the station fixtures: the result panel' };
    } catch (e) {
      rec.error = String(e).slice(0, 400);
    } finally {
      rec.pageErrors = realErrors(errors);
      out.screen = rec; save();
      log(`screen: completed ${rec.completed} stations ${JSON.stringify(rec.stationsShown)} posts ${rec.posts?.length} panel "${rec.panelText?.slice(0, 160)}" ${rec.error ?? ''}`);
      await ctx.close();
    }
  }

  // ── 4. the coach's panel for that stored row ───────────────────────────────────────────────────────────────────
  if (want('coach')) {
    const routes = JSON.parse(readFileSync(COACH_ROUTES, 'utf8')).coach as Record<string, unknown>;
    const stored = out.screen?.posts?.[0]?.pipeline?.dev;
    const reason = stored?.coachReason ?? 'ungraded_screen';
    routes['/api/coach/prescribe?clientId=client-1'] = { screenAt: new Date().toISOString(), prescriptions: [], reason };
    const { ctx, page, errors } = await newPage(browser, { width: 900, height: 1500 });
    const rec: Json = { prescribeAnswer: routes['/api/coach/prescribe?clientId=client-1'], fromLiveScreen: !!stored };
    try {
      await page.route('**/api/**', (route) => {
        const u = new URL(route.request().url());
        const body = routes[u.pathname + u.search] ?? routes[u.pathname];
        if (body !== undefined) return route.fulfill({ json: body });
        if (u.pathname === '/api/coach/messages') return route.fulfill({ json: { messages: [] } });
        return route.fulfill({ status: 404, json: { error: 'not in the fixture' } });
      });
      await page.goto(`${BASE}/dev/mirror-shots`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      const tab = page.getByRole('button', { name: 'Clients' });
      await tab.waitFor({ timeout: 300_000 });
      for (let i = 0; i < 60; i++) { await tab.click(); if (await page.getByText('Roster').count()) break; await page.waitForTimeout(1000); }
      await page.getByText('Sam Fixture').first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(2_000);
      const text = await page.locator('main').innerText().catch(async () => page.locator('body').innerText());
      rec.panelLine = (text.split('\n').find((l) => /last screen|movement screen on file|Nothing to draft/i.test(l)) ?? '').trim();
      rec.saysClear = /came back clear/i.test(text);
      rec.rosterLine = (text.split('\n').find((l) => /Sam Fixture ·/.test(l)) ?? '').trim();
      const line = page.getByText(rec.panelLine || 'Their last screen', { exact: false }).first();
      await line.scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: join(OUT, 'coach-panel-ungraded.png'), fullPage: true });
      out.frames['coach-panel-ungraded.png'] = { url: '/dev/mirror-shots', what: "the coach's Clients tab; the screen panel for the row stored by the live Full screen" };
    } catch (e) {
      rec.error = String(e).slice(0, 400);
    } finally {
      rec.pageErrors = realErrors(errors);
      out.coach = rec; save();
      log(`coach: "${rec.panelLine}" clear=${rec.saysClear} roster "${rec.rosterLine}" ${rec.error ?? ''}`);
      await ctx.close();
    }
  }

  // ── 5 + 6. /workout ───────────────────────────────────────────────────────────────────────────────────────────
  if (want('workout')) {
    const rec: Json = {};
    const { ctx, page, errors } = await newPage(browser, { width: 900, height: 1500 });
    try {
      const planReads: Json[] = [];
      page.on('response', (r) => { if (r.url().includes('/api/v1/workout/plan')) planReads.push({ method: r.request().method(), status: r.status() }); });
      await page.goto(`${BASE}/dev/workout-plans`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.getByText('The training plan is being rebuilt').first().waitFor({ timeout: 300_000 });
      rec.savedPlanShown = await page.waitForFunction(() => {
        const note = document.querySelector('[role=note]');
        return !!note?.parentElement && getComputedStyle(note.parentElement).opacity === '1';
      }, undefined, { timeout: 120_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1_000);
      const text = await page.locator('body').innerText();
      rec.pageApiCalls = planReads;
      rec.notes = await page.getByRole('note').allInnerTexts();
      rec.buyButtons = await page.getByRole('button').filter({ hasText: /Unlock|Buy|◆|periodized/i }).count();
      rec.copy = {
        salePaused: text.includes('The training plan is being rebuilt; it will be back with real programs.'),
        demoConsent: text.includes('I understand the scan on this page is a demo: it uses no camera and no video, it shows sample numbers rather than mine, and nothing is sent or saved.'),
        oldConsent: text.includes('I consent to on-device movement analysis'),
        periodized: /periodized/i.test(text),
        scored: /\bScored\b/.test(text),
        uploadVideo: /Upload a video of yourself/.test(text),
        personalizedWorkoutTitle: /Personalized Workout/.test(text),
        heldLine: text.includes('Held: wait until the depth-drop protocol opens for you.'),
        plansErrorLine: text.includes('Your saved plans could not be loaded just now'),
      };
      await page.screenshot({ path: join(OUT, 'workout-pulled-and-revised.png'), fullPage: true });
      out.frames['workout-pulled-and-revised.png'] = { url: '/dev/workout-plans', what: '/workout with the sale pulled, and a plan bought before today as its buyer now reads it' };
    } catch (e) {
      rec.error = String(e).slice(0, 400);
    } finally {
      rec.pageErrors = realErrors(errors);
      await ctx.close();
    }
    // the purchase, live: the real route (no session on this lane) and spend() for both SKUs
    const post = await fetch(`${BASE}/api/v1/workout/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'program_12w', idempotency_key: 'p1-live-proof' }) });
    rec.realPurchasePost = { status: post.status, body: await post.text() };
    rec.spend = await (await fetch(`${BASE}/dev/mirror-coach-p1?check=purchase`)).json();
    rec.planReadsAdult = await (await fetch(`${BASE}/dev/mirror-coach-p1?check=plans&audience=adult`)).json();
    rec.planReadsYouth = await (await fetch(`${BASE}/dev/mirror-coach-p1?check=plans&audience=youth`)).json();
    // /train is auth-gated and the lane has no session: its line is read from the dev server's compiled server bundle
    const dist = join(ROOT, '.next-mirror/server/app/train');
    const trainJs = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, f), 'utf8')).join('\n') : '';
    rec.trainBundle = {
      found: trainJs.length > 0,
      newLine: trainJs.includes('A squat coach and a movement screen on your own camera. It cues what it can see, and every number it shows is an estimate.'),
      oldLine: trainJs.includes('A movement screen from your own camera.'),
    };
    out.workout = rec; save();
    log(`workout: ${JSON.stringify(rec.copy)} notes ${JSON.stringify(rec.notes)} post ${rec.realPurchasePost.status} ${rec.error ?? ''}`);
  }
} finally {
  await browser.close();
  save();
  log(`\nwrote ${join(OUT, 'live-proof.json')}`);
}
