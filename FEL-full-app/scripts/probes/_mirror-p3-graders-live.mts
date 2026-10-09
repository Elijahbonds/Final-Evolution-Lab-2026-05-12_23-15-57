// MIRROR-COACH P3 (2026-09-26) — LIVE PROOF of the station graders on the lane's dev server (:3131).
//
// The same driver as P1/P2's live proofs (scripts/probes/_mirror-p2-closeout-live.mts): an init script finds MediaPipe's
// PoseLandmarker in the page's webpack module cache and replaces detectForVideo with a player that returns a landmark
// fixture's frame for the moment the camera frame arrives, chosen by the station the HUD shows. Everything after that
// is the served app, unmodified — the adapter, the compositor's PoseFrameGate, the ScreenRunner and its graders, the
// harness's HUD, the per-station card, the post, speechSynthesis. Chromium's fake camera (30 fps) supplies the frames.
//
// The station bodies are built HERE in node from lib/mirror/fixtures/stations.ts (3-D, filmed through the synth's
// virtual webcam, jittered) — synthetic, not a person:
//   heels       back to the camera, the HEEL points dimmed (visibility 0.2): the one station that cannot be read → its
//               ONE retest, then "not read after one retest", and the screen moves on (no loop)
//   frontStack  facing, the LEFT shoulder 5 cm high → shoulderLevel flagged (left); knees and hips pass
//   breath      facing, clean (a self-report station: no camera grade)
//   profile     side-on, clean → headFloat pass
//   wobbleL     one leg (left), steady → pass
//   wobbleR     one leg (right), the free foot down twice → flagged (right)
// The post to /api/mirror/screen goes to the real route (401 on this lane: no session, database offline) — the request
// body is captured and every posted grade is re-decided in node by the server's function (regradeFromSummary).
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p3-graders-live.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import * as stationsNs from '../../lib/mirror/fixtures/stations.ts';
import * as gradersNs from '../../lib/mirror/stationGraders.ts';
import * as landmarksNs from '../../lib/pose/landmarks.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const ST = unwrap(stationsNs), GR = unwrap(gradersNs), LM = unwrap(landmarksNs);

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/mirror-p3-live';
mkdirSync(OUT, { recursive: true });
type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), frames: {} };
const save = () => writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const log = (...a: unknown[]) => console.log(...a);

// ── the station bodies, in the page player's shape ─────────────────────────────────────────────────────────────
const forPage = (name: string, frames: Json[], truth: Json) => {
  const fr = frames.map((f) => ({ t: Math.round(f.timestampMs * 1000) / 1000, present: f.present, lm: f.present ? f.landmarks.map((l: Json) => [l.x, l.y, l.z, l.visibility]) : [] }));
  return { name, fps: 30, dur: fr[fr.length - 1].t + 1000 / 30, frames: fr, truth };
};
const dimHeels = (frames: Json[]) => frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l: Json, i: number) => (i === LM.LEFT_HEEL || i === LM.RIGHT_HEEL ? { ...l, visibility: 0.2 } : l)) }));
const PAGES = {
  heels_dim: forPage('heels_dim', dimHeels(ST.film(ST.standClip(ST.toBack(ST.standPose()), 20), ST.JITTER(11))), { view: 'back', heelsDimmed: true }),
  front_shoulder: forPage('front_shoulder', ST.film(ST.standClip(ST.standPose({ shoulderUp: { side: 'left', cm: 5 } }), 20), ST.JITTER(12)), { view: 'front', shoulderUpCm: { left: 5 } }),
  front_clean: forPage('front_clean', ST.film(ST.standClip(ST.standPose(), 14), ST.JITTER(13)), { view: 'front' }),
  side_clean: forPage('side_clean', ST.film(ST.standClip(ST.toSide(ST.standPose()), 16), ST.JITTER(14)), { view: 'side' }),
  leg_left: forPage('leg_left', ST.film(ST.singleLegClip({ stance: 'left', settleSec: 1, holdSec: 40 }), ST.JITTER(15)), { stance: 'left', steady: true }),
  leg_right_td: forPage('leg_right_td', ST.film(ST.singleLegClip({ stance: 'right', settleSec: 1, holdSec: 40, touchDownsAt: [9, 18] }), ST.JITTER(16)), { stance: 'right', touchDownsAt: [9, 18] }),
};
const STATIONS = ['heels_dim', 'front_shoulder', 'front_clean', 'side_clean', 'leg_left', 'leg_right_td'];
out.stationBodies = Object.fromEntries(Object.values(PAGES).map((p) => [p.name, { seconds: Math.round(p.dur / 100) / 10, truth: p.truth }]));

// ── the page-side player (P2's, trimmed) ───────────────────────────────────────────────────────────────────────
const INIT = `(() => {
  self.__name = self.__name || ((f) => f);
  const fx = window.__fx = { byName: {}, stations: null, stationIdx: 0, t0: null, lastName: null, calls: 0, served: 0, patched: false, said: [], req: null, errors: [] };
  try {
    const ss = window.speechSynthesis;
    if (ss && ss.speak) { const orig = ss.speak.bind(ss); ss.speak = (u) => { fx.said.push({ t: Math.round(performance.now()), text: u && u.text }); try { return orig(u); } catch (e) {} }; }
  } catch (e) {}
  self.webpackChunk_N_E = self.webpackChunk_N_E || [];
  self.webpackChunk_N_E.push([['fel-p3-probe-' + Math.random()], {}, (r) => { fx.req = r; }]);
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
    const liveChip = spans.find((t) => /^(Live|Ready|Camera|Loading)$/.test(t)) || null;
    const big = [...document.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).find((t) => /^(I couldn't read|Turn|Face|Stay|Now the|Good\\.|That is)/.test(t)) || null;
    const card = document.querySelector('section[aria-label="Station results"]');
    const rows = card ? [...card.querySelectorAll('li[data-check]')].map((li) => ({ check: li.getAttribute('data-check'), status: li.getAttribute('data-status'), text: (li.textContent || '').replace(/\\s+/g, ' ').trim() })) : [];
    const titles = card ? [...card.querySelectorAll('li[data-station] > p')].map((p) => (p.textContent || '').trim()) : [];
    const skip = [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Skip the retest');
    const v = document.querySelector('video');
    const tracks = v && v.srcObject ? v.srcObject.getTracks().map((t) => t.readyState) : [];
    return { hud, liveChip, big, rows, titles, skip, station: fx.stationIdx, served: fx.served, patched: fx.patched, tracks };
  };
})();`;

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const rec: Json = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 }, permissions: ['camera'] });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('request', (r) => { if (r.url().includes('/api/mirror/screen') && r.method() === 'POST') rec.postBody = JSON.parse(r.postData() ?? '{}'); });
  page.on('response', (r) => { if (r.url().includes('/api/mirror/screen') && r.request().method() === 'POST') rec.postStatus = r.status(); });

  await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  const tab = page.getByRole('tab', { name: 'Movement Screen' });
  await tab.waitFor({ timeout: 240_000 });
  for (let i = 0; i < 60 && (await tab.getAttribute('aria-selected')) !== 'true'; i++) { await tab.click(); await page.waitForTimeout(1_000); }
  await page.evaluate(({ pages, stations }) => { const fx = (window as any).__fx; Object.assign(fx.byName, pages); fx.stations = stations; }, { pages: PAGES, stations: STATIONS });
  await page.getByRole('button', { name: 'Start session' }).click();
  rec.live = await page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);

  const timeline: Json[] = [];
  const t0 = Date.now();
  let retestShot = false, cardShot = false;
  while (Date.now() - t0 < 360_000) {
    const r = await page.evaluate(() => (window as any).__read());
    const key = `${r.hud}|${r.big}|${r.rows.length}|${r.skip}|${r.liveChip}`;
    if (!timeline.length || timeline[timeline.length - 1].key !== key) timeline.push({ s: Math.round((Date.now() - t0) / 100) / 10, key, hud: r.hud, big: r.big, rows: r.rows.length, skip: r.skip, live: r.liveChip });
    if (!retestShot && r.skip && /couldn't read/.test(r.big ?? '')) {
      await page.screenshot({ path: join(OUT, 'retest-offer.png') });
      out.frames['retest-offer.png'] = { url: '/dev/mirror-truth', what: 'heels station ended unreadable (heel points dimmed): the retest line on the stage, "Skip the retest" beside End session' };
      rec.retestOffer = r; retestShot = true;
    }
    if (!cardShot && r.rows.length >= 4 && r.station >= 3) {
      await page.screenshot({ path: join(OUT, 'card-mid-screen.png'), fullPage: true });
      out.frames['card-mid-screen.png'] = { url: '/dev/mirror-truth', what: 'mid-screen: the station-by-station card under the stage' };
      cardShot = true;
    }
    if (r.liveChip === 'Ready' && timeline.some((x) => x.live === 'Live')) break;
    await page.waitForTimeout(400);
  }
  rec.secondsToComplete = Math.round((Date.now() - t0) / 1000);
  for (let i = 0; i < 30 && rec.postStatus === undefined; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1_000);
  const end = await page.evaluate(() => (window as any).__read());
  rec.timeline = timeline.map(({ key, ...x }) => x);
  rec.final = { titles: end.titles, rows: end.rows, liveChip: end.liveChip, tracks: end.tracks, served: end.served, patched: end.patched };
  rec.spoken = await page.evaluate(() => (window as any).__fx.said.map((s: any) => s.text));
  const panel = page.locator('section').filter({ hasText: 'What the screen found' }).first();
  rec.panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const card = page.locator('section[aria-label="Station results"]');
  await card.screenshot({ path: join(OUT, 'station-card-1180.png') }).catch(() => {});
  out.frames['station-card-1180.png'] = { url: '/dev/mirror-truth', what: 'the finished screen\'s station-by-station card, 1180 px' };
  await page.screenshot({ path: join(OUT, 'screen-complete-1180.png'), fullPage: true });
  out.frames['screen-complete-1180.png'] = { url: '/dev/mirror-truth', what: 'the finished screen: card, summary panel, answers card; camera stopped' };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  rec.phoneOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await card.screenshot({ path: join(OUT, 'station-card-390.png') }).catch(() => {});
  out.frames['station-card-390.png'] = { url: '/dev/mirror-truth', what: 'the same card at phone width (390 px)' };
  rec.pageErrors = errors.filter((e) => !/favicon|DevTools|net::ERR_|Failed to load resource|WebGL|GPU stall|webpack-hmr|XNNPACK|401|Unauthorized/i.test(e));

  // the server's side, in node: every posted grade re-decided from its summary numbers alone
  const posted: Json[] = rec.postBody?.grades ?? [];
  const regraded = posted.map((g) => ({ checkId: g.checkId, stationId: g.stationId, client: g.status, server: GR.regradeFromSummary(g)?.status ?? null, value: g.value, reason: g.reason ?? null, side: g.side ?? null, frames: g.frames, readableFrames: g.readableFrames }));
  rec.regrade = { posted: posted.length, agree: regraded.filter((x) => x.client === x.server).length, rows: regraded };
  rec.postedResults = rec.postBody?.results ?? null;
  await ctx.close();
} catch (e) {
  rec.error = String(e).slice(0, 600);
} finally {
  out.screen = rec;
  save();
  await browser.close();
  log(JSON.stringify({ secs: rec.secondsToComplete, post: rec.postStatus, regrade: rec.regrade && `${rec.regrade.agree}/${rec.regrade.posted}`, rows: rec.final?.rows?.map((r: Json) => `${r.check}:${r.status}`), overflow: rec.phoneOverflowX, errors: rec.pageErrors, error: rec.error }, null, 1));
  log(`wrote ${join(OUT, 'live-proof.json')}`);
}
