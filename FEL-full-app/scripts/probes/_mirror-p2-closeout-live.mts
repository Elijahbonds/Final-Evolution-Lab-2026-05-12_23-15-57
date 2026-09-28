// MIRROR-COACH P2 (2026-09-26) — LIVE PROOF of the P1 close-out on the lane's dev server (:3131).
//
// The same driver as P1's live proof (scripts/probes/_mirror-p1-live-proof.mts): an init script finds MediaPipe's
// PoseLandmarker in the page's webpack module cache and replaces detectForVideo with a player that returns a landmark
// fixture's frame for the moment the camera frame arrives (looped on its own clock). Everything after that is the served
// app, unmodified — the adapter, the compositor's PoseFrameGate, SquatAudit, stepSquatSession, the CueEngine, the
// ScreenRunner, the harness's panels, speechSynthesis. Chromium's fake camera (30 fps) supplies the frames; the render
// loop runs at the display's rate, which is the condition that counted 11 reps in one squat.
//
//   1. squat: P1's rows "one squat = one rep" — three noise-free fixtures (knee in left, knees out both, clean), each
//      fixture loop ONE squat: the check must take 3 loops and the work set 8; SquatAudit.evaluate is instrumented
//      (never changed) to count repeated frames it is handed. Plus the knee cue, now on: spoken for a caving knee, never
//      for knees pushed out or a clean squat.
//   2. square: two JITTERED synth squats built here (lib/pose/synth.ts via the audit's own fixture): straight 8° off
//      square — no knee cue, the knee row "Not square · not read", the square-up line said exactly once — and knees
//      caving 6 cm square-on, which must be cued.
//   3. screen: the Modified Movement Screen on its station fixtures — the top-left chip on every station (never
//      BREATHE), and after it completes: the LIVE chip off and the camera's tracks ended.
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p2-closeout-live.mts <outDir> [--only squat,square,screen]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import * as synthSquatNs from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const SS = unwrap(synthSquatNs);

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/mirror-p2-live';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const want = (s: string) => !ONLY || ONLY.includes(s);
mkdirSync(OUT, { recursive: true });
const ROOT = process.cwd();
if (!existsSync(join(ROOT, 'lib/mirror/fixtures'))) throw new Error('run from FEL-full-app');

type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), squat: {}, square: {}, frames: {} };
const log = (...a: unknown[]) => console.log(...a);
const save = () => writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures', `${name}.json`), 'utf8'));
const forPage = (name: string) => {
  const f = fixture(name);
  return { name, fps: f.fps, dur: f.frames[f.frames.length - 1].t + 1000 / f.fps, frames: f.frames, truth: f.truth };
};
/** A jittered synth squat (one squat, 3.2 s) in the page player's shape. */
const synthForPage = (name: string, shape: Json, seed: number) => {
  const frames = SS.filmSquat(shape, { seed }).map((f: Json) => ({
    t: Math.round(f.timestampMs * 1000) / 1000, present: f.present,
    lm: f.present ? f.landmarks.map((l: Json) => [l.x, l.y, l.z, l.visibility]) : [],
  }));
  return { name, fps: 30, dur: frames[frames.length - 1].t + 1000 / 30, frames, truth: { ...shape, seed, jittered: true } };
};

// ── the page-side player (P1's, plus the chip and the knee row) ─────────────────────────────────────────────────
const INIT = `(() => {
  self.__name = self.__name || ((f) => f);
  const fx = window.__fx = { byName: {}, mode: null, name: null, stations: null, stationIdx: 0, t0: null, lastName: null,
    calls: 0, served: 0, loop: -1, patched: false, said: [], req: null, errors: [] };
  try {
    const ss = window.speechSynthesis;
    if (ss && ss.speak) { const orig = ss.speak.bind(ss); ss.speak = (u) => { fx.said.push({ t: Math.round(performance.now()), loop: fx.loop, text: u && u.text }); try { return orig(u); } catch (e) {} }; }
  } catch (e) {}
  self.webpackChunk_N_E = self.webpackChunk_N_E || [];
  self.webpackChunk_N_E.push([['fel-p2-probe-' + Math.random()], {}, (r) => { fx.req = r; }]);
  fx.mod = (re) => { const r = fx.req; if (!r) return null; const id = Object.keys(r.m || {}).find((k) => re.test(k)); return id ? r(id) : null; };
  const station = () => {
    for (const s of document.querySelectorAll('span')) { const m = /· station (\\d+)$/.exec((s.textContent || '').trim()); if (m) return Number(m[1]) - 1; }
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
    try { const ex = fx.mod(/@mediapipe[\\\\/]tasks-vision[\\\\/]vision_bundle/); if (ex && ex.PoseLandmarker && ex.PoseLandmarker.prototype.detectForVideo) patch(ex.PoseLandmarker); } catch (e) { fx.errors.push(String(e)); }
    if (!fx.patched) setTimeout(tryPatch, 100);
  };
  tryPatch();
  // Instrument (never change) SquatAudit.evaluate: how many frames it is handed that it has already seen (same
  // timestamp), and on which kind of frame a non-standing phase returns to standing.
  fx.audit = { calls: 0, repeats: 0, toStandingFresh: 0, toStandingRepeat: 0, lastTs: null, lastPhase: 'standing', patched: false, notSquare: 0, square: 0 };
  const tryAudit = () => {
    if (fx.audit.patched) return;
    try {
      const m = fx.mod(/neuro-mirror[\\\\/]rules[\\\\/]squat-audit/);
      if (m && m.SquatAudit) {
        const orig = m.SquatAudit.prototype.evaluate;
        m.SquatAudit.prototype.evaluate = function (frame) {
          const a = fx.audit;
          const same = frame.timestampMs === a.lastTs;
          const r = orig.call(this, frame);
          a.calls++;
          if (same) a.repeats++;
          if (r.present && r.phase !== 'standing' && r.square === false) a.notSquare++;
          if (r.present && r.phase !== 'standing' && r.square === true) a.square++;
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
  window.__read = () => {
    const spans = [...document.querySelectorAll('span')].map((s) => (s.textContent || '').trim());
    const stage = spans.find((t) => /^(breathe|check|work|review)$/.test(t)) || null;
    const chip = spans.find((t) => /^(Station \\d+ of \\d+.*|Get set|Screen complete|breathe|check|work|review)$/.test(t)) || null;
    const liveChip = spans.find((t) => /^(Live|Ready|Camera|Loading)$/.test(t)) || null;
    const repsLabel = [...document.querySelectorAll('p')].find((p) => (p.textContent || '').trim() === 'Reps');
    const reps = repsLabel && repsLabel.previousElementSibling ? Number((repsLabel.previousElementSibling.textContent || '').trim()) : null;
    const rows = [...document.querySelectorAll('ul li')].map((li) => (li.textContent || '').trim())
      .filter((t) => /Knees track over toes|Heels stay down|Shoulders stay centred|Weight stays centred/.test(t));
    const v = document.querySelector('video');
    const tracks = v && v.srcObject ? v.srcObject.getTracks().map((t) => t.readyState) : [];
    return { stage, chip, liveChip, reps, rows, loop: fx.loop, served: fx.served, patched: fx.patched, said: fx.said.length, station: fx.stationIdx, tracks };
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
const waitLive = (page: Page) => page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);

/** One guided squat on a page-player fixture, start to review; what the page counted, said and showed. */
async function guidedSquat(browser: Browser, f: Json, shotName: string | null): Promise<Json> {
  const { ctx, page, errors } = await newPage(browser);
  const rec: Json = { truth: f.truth };
  try {
    await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    rec.tabTook = await selectTab(page, 'Corrective Squat');
    await page.evaluate((fx) => { const w = (window as any).__fx; w.byName[fx.name] = fx; w.mode = 'squat'; w.name = fx.name; }, f);
    await page.getByRole('button', { name: 'Start session' }).click();
    rec.live = await waitLive(page);
    const samples: Json[] = [];
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < 180_000) {
      const r = await page.evaluate(() => (window as any).__read());
      samples.push({ ms: Date.now() - t0, ...r });
      if (shotName && !shot && r.stage === 'work' && r.reps >= 2) {
        await page.screenshot({ path: join(OUT, `${shotName}-work.png`) });
        out.frames[`${shotName}-work.png`] = { url: '/dev/mirror-truth', what: `${f.name}: mid work set, live` };
        rec.workRows = r.rows; shot = true;
      }
      // the knee correction as painted: the moment the knee row reads a fault, the skeleton canvas carries the arrows
      if (shotName && !rec.faultShot && r.stage === 'work' && r.rows.some((t: string) => /Knees track over toes\s*Estimated fault/i.test(t))) {
        await page.screenshot({ path: join(OUT, `${shotName}-knee-fault.png`) });
        out.frames[`${shotName}-knee-fault.png`] = { url: '/dev/mirror-truth', what: `${f.name}: a work-set frame the knee row reads as a fault — the arrows on the skeleton` };
        rec.faultShot = r;
      }
      if (r.stage === 'review') break;
      await page.waitForTimeout(rec.faultShot ? 250 : 60);
    }
    const fx = await page.evaluate(() => { const w = (window as any).__fx; const { lastTs, lastPhase, ...audit } = w.audit; return { patched: w.patched, served: w.served, calls: w.calls, said: w.said, errors: w.errors, audit }; });
    rec.player = { patched: fx.patched, framesServed: fx.served, detectCalls: fx.calls, errors: fx.errors };
    rec.squatAuditCalls = fx.audit;
    rec.spoken = fx.said.map((s: Json) => s.text);
    rec.spokenAt = fx.said;
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
    rec.loopsPerStage = { check: chk && wrk ? wrk.loop - chk.loop : null, checkRepsNeeded: 3, work: wrk && rev ? rev.loop - wrk.loop : null, workRepsNeeded: 8 };
    rec.finalStage = samples[samples.length - 1]?.stage;
    rec.kneeRowsSeen = [...new Set(samples.flatMap((s) => s.rows.filter((t: string) => /Knees track/.test(t))))];
    const review = page.locator('section').filter({ hasText: 'What the camera measured' }).first();
    rec.reviewText = (await review.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const knee = /L (-?\d+\.\d+) · R (-?\d+\.\d+)\s*· flagged frames (\d+) · square frames (\d+) · not square (\d+)/.exec(rec.reviewText);
    rec.knee = knee ? { worstInwardL: Number(knee[1]), worstInwardR: Number(knee[2]), flaggedFrames: Number(knee[3]), squareFrames: Number(knee[4]), notSquareFrames: Number(knee[5]) } : null;
    rec.kneeCues = rec.spoken.filter((t: string) => /knees out|floor apart|second toes|spread the floor/i.test(t));
    rec.squareUpSaid = rec.spoken.filter((t: string) => /^Square up to the camera/.test(t)).length;
    rec.bandLine = rec.spoken.some((t: string) => /\bband\b/i.test(t)) || /\bband\b/i.test(rec.reviewText);
    if (shotName) {
      await review.screenshot({ path: join(OUT, `${shotName}-review.png`) }).catch(() => {});
      out.frames[`${shotName}-review.png`] = { url: '/dev/mirror-truth', what: `${f.name}: the guided squat's review` };
    }
  } catch (e) {
    rec.error = String(e).slice(0, 400);
  } finally {
    rec.pageErrors = realErrors(errors);
    await ctx.close();
  }
  return rec;
}

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const line = (name: string, r: Json) => log(`${name}: stage ${r.finalStage} loops ${JSON.stringify(r.loopsPerStage)} maxRepStep ${r.maxRepStep} audit ${JSON.stringify(r.squatAuditCalls)} kneeCues ${r.kneeCues?.length} squareUp ${r.squareUpSaid} knee ${JSON.stringify(r.knee)} rows ${JSON.stringify(r.kneeRowsSeen)} ${r.error ?? ''}`);

try {
  if (want('squat')) {
    for (const name of (process.env.SQUAT_ONLY?.split(',') ?? ['squat_knee_in_left', 'squat_knees_out_both', 'squat_clean'])) {
      const r = await guidedSquat(browser, forPage(name), name === 'squat_knee_in_left' ? 'squat-knee-in-left' : null);
      out.squat[name] = r; save(); line(name, r);
    }
  }
  if (want('square')) {
    for (const [name, shape, shot] of [
      ['synth_straight_8deg_off_square_seed3', { turnDeg: 8 }, 'square-8deg-straight'],
      ['synth_knees_in_6cm_square_seed3', { shiftL: -0.06, shiftR: -0.06 }, 'square-knees-in'],
    ] as [string, Json, string][]) {
      const r = await guidedSquat(browser, synthForPage(name, shape, 3), shot);
      out.square[name] = r; save(); line(name, r);
    }
  }
  if (want('screen')) {
    // SCREEN_VIEWPORT=390x844 runs it at phone width (the chip has to fit beside the corner figure there)
    const vp = process.env.SCREEN_VIEWPORT?.split('x').map(Number);
    const { ctx, page, errors } = await newPage(browser, vp ? { width: vp[0], height: vp[1] } : undefined);
    const rec: Json = {};
    try {
      const stations = ['stand_back', 'stand_front', 'stand_front', 'stand_side', 'single_leg_left', 'single_leg_right'];
      rec.stationFixtures = stations;
      rec.posts = 0;
      // the real route answers 401 on this lane (no session, database offline): the post is answered by P1's dev copy
      // of the route's pipeline, as in P1's proof; a post still in flight when the page closes is not an error here
      await page.route('**/api/mirror/screen', async (route) => {
        try {
          const body = route.request().postData() ?? '';
          const dev = await page.request.post(`${BASE}/dev/mirror-coach-p1`, { data: JSON.parse(body || '{}') });
          const j = await dev.json();
          rec.posts++;
          await route.fulfill({ json: j.response });
        } catch (e) { rec.postError = String(e).slice(0, 200); }
      });
      await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
      rec.tabTook = await selectTab(page, 'Movement Screen');
      const pages = Object.fromEntries([...new Set(stations)].map((n) => [n, forPage(n)]));
      await page.evaluate(({ pages, stations }) => { const fx = (window as any).__fx; Object.assign(fx.byName, pages); fx.stations = stations; fx.mode = 'screen'; }, { pages, stations });
      await page.getByRole('button', { name: 'Start session' }).click();
      rec.live = await waitLive(page);
      const chips: Json[] = [];
      const t0 = Date.now();
      let shot = false;
      while (Date.now() - t0 < 300_000) {
        const r = await page.evaluate(() => (window as any).__read());
        if (!chips.length || chips[chips.length - 1].chip !== r.chip || chips[chips.length - 1].liveChip !== r.liveChip) chips.push({ ms: Date.now() - t0, chip: r.chip, liveChip: r.liveChip, station: r.station, tracks: r.tracks });
        if (!shot && /^Station 2 of/.test(r.chip ?? '')) { await page.screenshot({ path: join(OUT, 'screen-chip-station.png') }); out.frames['screen-chip-station.png'] = { url: '/dev/mirror-truth', what: 'Movement Screen mid-run: the top-left chip names the station' }; shot = true; }
        if (r.liveChip === 'Ready' && chips.some((c) => c.liveChip === 'Live')) break;
        await page.waitForTimeout(300);
      }
      rec.secondsToComplete = Math.round((Date.now() - t0) / 1000);
      rec.chips = chips;
      rec.chipEverBreathe = chips.some((c) => /^breathe$/i.test(c.chip ?? ''));
      for (let i = 0; i < 120 && !rec.posts; i++) await page.waitForTimeout(500);   // the screen's own post, answered
      await page.waitForTimeout(1_000);
      const after = await page.evaluate(() => (window as any).__read());
      rec.after = after;
      rec.cameraStopped = after.tracks.length > 0 && after.tracks.every((t: string) => t === 'ended');
      rec.liveAfter = after.liveChip;
      const panel = page.locator('section').filter({ hasText: 'What the screen found' }).first();
      rec.panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      await page.screenshot({ path: join(OUT, 'screen-complete-camera-off.png'), fullPage: true });
      out.frames['screen-complete-camera-off.png'] = { url: '/dev/mirror-truth', what: 'Movement Screen after it completed: the result panel, the chip back to Ready, the camera stopped' };
    } catch (e) {
      rec.error = String(e).slice(0, 400);
    } finally {
      rec.pageErrors = realErrors(errors);
      await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
      out.screen = rec; save();
      log(`screen: ${rec.secondsToComplete}s chips ${JSON.stringify(rec.chips?.map((c: Json) => `${c.chip}|${c.liveChip}`))} breathe ${rec.chipEverBreathe} cameraStopped ${rec.cameraStopped} live after ${rec.liveAfter} panel "${rec.panelText?.slice(0, 120)}" ${rec.error ?? ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  save();
  log(`\nwrote ${join(OUT, 'live-proof.json')}`);
}
