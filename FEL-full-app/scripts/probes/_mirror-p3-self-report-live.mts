// MIRROR-COACH P3 (2026-09-25) — LIVE PROOF, the self-report + server lane, on the lane's dev server (:3131).
//
// The Full Movement Screen runs in the served harness (/dev/mirror-truth: the real MirrorHarness without the sign-in
// gate) on the landmark FIXTURES — the same page-side player as scripts/probes/_mirror-p1-live-proof.mts: MediaPipe's
// PoseLandmarker.detectForVideo is swapped for the fixture frame of the station the HUD shows. Everything after that is
// the served app: the runner, lane 1's graders, the harness's POST body, the result panel, the answers card.
//
// The harness's POST and PATCH to /api/mirror/screen are sent to the real route first (401 here: no session, database
// offline) and then to /dev/mirror-coach-p3-screen, which runs the route's own library pipeline (decideScreenPost;
// selfReportAnswersFor + withSelfReport) over an in-memory table; the harness renders that answer.
//
//   1. a Full screen to completion: the POST body (grades, no client grades trusted), the server's answer, the stored row
//   2. the answers card: the questions, the taps, the PATCHes, the stored row before/after (results + summary untouched)
//   3. the same harness body replayed with one status flipped (→ 422), cut to two checks (→ provisional, not paid), with
//      answers added (→ same summary, not paid), and in the pre-P3 shape (bare grades → not graded)
//   4. the card at 390 px (no horizontal overflow)
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p3-self-report-live.mts <outDir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/mirror-p3-self-report';
const DEV = `${BASE}/dev/mirror-coach-p3-screen`;
mkdirSync(OUT, { recursive: true });
const ROOT = process.cwd();
if (!existsSync(join(ROOT, 'lib/mirror/fixtures'))) throw new Error('run from FEL-full-app');

type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), frames: {} };
const save = () => writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const log = (...a: unknown[]) => console.log(...a);
const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures', `${name}.json`), 'utf8'));
const forPage = (name: string) => {
  const f = fixture(name);
  return { name, fps: f.fps, dur: f.frames[f.frames.length - 1].t + 1000 / f.fps, frames: f.frames };
};

const INIT = `(() => {
  self.__name = self.__name || ((f) => f);
  const fx = window.__fx = { byName: {}, mode: null, stations: null, stationIdx: 0, t0: null, lastName: null, served: 0, patched: false, said: [], req: null, errors: [] };
  try {
    const ss = window.speechSynthesis;
    if (ss && ss.speak) { const orig = ss.speak.bind(ss); ss.speak = (u) => { fx.said.push(u && u.text); try { return orig(u); } catch (e) {} }; }
  } catch (e) {}
  self.webpackChunk_N_E = self.webpackChunk_N_E || [];
  self.webpackChunk_N_E.push([['fel-p3-probe-' + Math.random()], {}, (r) => { fx.req = r; }]);
  fx.mod = (re) => { const r = fx.req; if (!r) return null; const id = Object.keys(r.m || {}).find((k) => re.test(k)); return id ? r(id) : null; };
  const station = () => {
    for (const s of document.querySelectorAll('span')) { const m = /· station (\\d+)$/.exec((s.textContent || '').trim()); if (m) return Number(m[1]) - 1; }
    return null;
  };
  setInterval(() => { if (fx.mode === 'screen') { const i = station(); if (i != null) fx.stationIdx = i; } }, 100);
  const current = () => fx.mode === 'screen' && fx.stations ? fx.stations[Math.min(fx.stationIdx, fx.stations.length - 1)] : null;
  const patch = (P) => {
    const orig = P.prototype.detectForVideo;
    P.prototype.detectForVideo = function (video, ts) {
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
    try { const ex = fx.mod(/@mediapipe[\\/]tasks-vision[\\/]vision_bundle/); if (ex && ex.PoseLandmarker && ex.PoseLandmarker.prototype.detectForVideo) patch(ex.PoseLandmarker); }
    catch (e) { fx.errors.push(String(e)); }
    if (!fx.patched) setTimeout(tryPatch, 100);
  };
  tryPatch();
})();`;

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

const devPost = async (body: unknown) => (await fetch(DEV, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<Json>;
const devGet = async (screenId: string) => (await (await fetch(`${DEV}?screenId=${encodeURIComponent(screenId)}`)).json() as Json).stored;

try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 }, permissions: ['camera'] });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const rec: Json = { posts: [], patches: [] };
  out.run = rec;

  await page.route('**/api/mirror/screen', async (route) => {
    const req = route.request();
    const method = req.method();
    const body = JSON.parse(req.postData() || '{}');
    const real = await route.fetch().then(async (r) => ({ status: r.status(), body: (await r.text()).slice(0, 120) })).catch((e) => ({ status: -1, body: String(e) }));
    if (method === 'POST') {
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

  // ── 1. a Full screen, run to completion ──────────────────────────────────────────────────────────────────────────
  const stations = ['stand_back', 'stand_front', 'stand_front', 'stand_side', 'stand_side', 'seated_rotation_front', 'single_leg_left', 'single_leg_right'];
  await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  const tab = page.getByRole('tab', { name: 'Movement Screen' });
  await tab.waitFor({ timeout: 240_000 });
  for (let i = 0; i < 60 && (await tab.getAttribute('aria-selected')) !== 'true'; i++) { await tab.click(); await page.waitForTimeout(1_000); }
  await page.getByRole('button', { name: /Full screen/ }).click();
  const pages = Object.fromEntries([...new Set(stations)].map((n) => [n, forPage(n)]));
  await page.evaluate(({ pages, stations }) => { const fx = (window as any).__fx; Object.assign(fx.byName, pages); fx.stations = stations; fx.mode = 'screen'; }, { pages, stations });
  // before the screen ends there is no answers card (it is asked after, when the athlete is back at the phone)
  rec.cardBeforeStart = await page.getByText(/your answers/).count();
  await page.getByRole('button', { name: 'Start session' }).click();
  rec.live = await page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);
  const t0 = Date.now();
  const hud: string[] = [];
  const trace: { s: number; label: string }[] = [];
  rec.hudTrace = trace;
  let navigations = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
  let cardDuringScreen = 0;
  while (Date.now() - t0 < 480_000) {
    const r = await page.evaluate(() => {
      const found = [...document.querySelectorAll('h2')].some((h) => h.textContent === 'What the screen found');
      const say = [...document.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).find((t) => /Hands on the sides of your lower ribs/.test(t)) ?? '';
      const card = [...document.querySelectorAll('h2')].some((h) => /your answers/.test(h.textContent || ''));
      return { found, say, card };
    });
    if (r.say && !hud.includes(r.say)) hud.push(r.say);
    // the HUD's station label, traced on change (a dev-server rebuild mid-run shows up here as the station count resetting)
    const label = await page.evaluate(() => [...document.querySelectorAll('span')].map((s) => (s.textContent || '').trim()).find((t) => /· station \d+$/.test(t)) ?? '');
    if (label && trace[trace.length - 1]?.label !== label) trace.push({ s: Math.round((Date.now() - t0) / 1000), label });
    if (!r.found && r.card) cardDuringScreen++;
    if (r.found && rec.posts.length) break;
    await page.waitForTimeout(500);
  }
  rec.secondsToComplete = Math.round((Date.now() - t0) / 1000);
  rec.navigationsDuringScreen = navigations;
  rec.breathCueShown = hud;
  rec.cardDuringScreen = cardDuringScreen;
  rec.completed = rec.posts.length > 0;
  await page.waitForTimeout(1_500);
  const post = rec.posts[0];
  if (post) {
    rec.postBodyKeys = Object.keys(post.body);
    rec.postGrades = (post.body.grades ?? []).map((g: Json) => ({ checkId: g.checkId, stationId: g.stationId, status: g.status, value: g.value, readableFrames: g.readableFrames, frames: g.frames }));
    rec.serverAnswer = post.pipeline.response;
    rec.storedAfterPost = post.pipeline.dev?.stored;
    rec.coachReason = post.pipeline.dev?.coachReason;
  }
  const panel = page.locator('section').filter({ hasText: 'What the screen found' }).first();
  rec.panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const card = page.locator('section[aria-labelledby="screen-self-report-heading"]');
  rec.cardText = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  rec.cardButtons = await card.getByRole('button').count();
  rec.cardNotSure = await card.getByRole('button', { name: 'Not sure', exact: true }).count();
  rec.cardCoachLines = (rec.cardText.match(/Your coach checks this\. Not graded, not scored\./g) ?? []).length;
  await page.screenshot({ path: join(OUT, 'screen-full-with-answers-card.png'), fullPage: true });
  out.frames['screen-full-with-answers-card.png'] = { url: '/dev/mirror-truth', what: 'Full screen run to completion on the station fixtures: results, then the breath answers card and the coach checks' };
  save();

  // ── 2. answer by tap ─────────────────────────────────────────────────────────────────────────────────────────────
  const screenId = rec.serverAnswer?.screenId as string | undefined;
  rec.screenId = screenId;
  if (screenId) {
    const before = await devGet(screenId);
    const groups = card.getByRole('group');
    await groups.nth(0).getByRole('button', { name: 'Not sure', exact: true }).click();
    await page.getByText('Saved with this screen.').waitFor({ timeout: 20_000 }).catch(() => {});
    await groups.nth(1).getByRole('button', { name: 'Yes', exact: true }).click();
    await page.waitForTimeout(600);
    await groups.nth(1).getByRole('button', { name: 'No', exact: true }).click();          // changed their mind: the last tap wins
    await page.getByText('Saved with this screen.').waitFor({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    rec.pressed = await card.locator('button[aria-pressed="true"]').allInnerTexts();
    rec.saveLine = (await card.locator('p[aria-live="polite"]').innerText().catch(() => '')).trim();
    const after = await devGet(screenId);
    rec.storedSelfReport = after?.selfReport ?? null;
    const strip = (m: Json | null) => { if (!m) return m; const { selfReport: _s, ...rest } = m; void _s; return rest; };
    rec.scoredPartUnchanged = JSON.stringify(strip(before)) === JSON.stringify(strip(after));
    rec.summaryBefore = before?.summary ? { score: before.summary.score, movementFlags: before.summary.movementFlags, triage: before.summary.triage } : null;
    rec.summaryAfter = after?.summary ? { score: after.summary.score, movementFlags: after.summary.movementFlags, triage: after.summary.triage } : null;
    rec.patchStatuses = rec.patches.map((p: Json) => [p.realRoute.status, p.status]);
    await card.screenshot({ path: join(OUT, 'answers-card-answered.png') });
    out.frames['answers-card-answered.png'] = { url: '/dev/mirror-truth', what: 'the answers card after two taps (Not sure; Yes then No) and the saved line' };
  }
  save();

  // ── 3. the same harness body, tampered, cut, answered, and in the pre-P3 shape ───────────────────────────────────
  if (post) {
    const body = post.body as Json;
    const grades = body.grades as Json[];
    const readable = grades.filter((g) => g.status !== 'unreadable');
    const tamperIdx = grades.findIndex((g) => g.checkId === 'hipLevel');
    const flipped = grades.map((g, i) => (i === tamperIdx ? { ...g, status: g.status === 'pass' ? 'flag' : 'pass' } : g));
    const valueLie = grades.map((g, i) => (i === tamperIdx ? { ...g, value: 0.3 } : g));                      // value over the line, still 'pass'
    const thin = grades.map((g, i) => (i === tamperIdx ? { ...g, readableFrames: 10 } : g));
    const tries: Record<string, Json> = {
      asPosted: { ...body, screenId: 'replay-asis' },
      statusFlipped: { ...body, screenId: 'replay-flip', grades: flipped },
      valueOverLineStillPass: { ...body, screenId: 'replay-value', grades: valueLie },
      passOnTenFrames: { ...body, screenId: 'replay-thin', grades: thin },
      twoReadable: { ...body, screenId: 'replay-two', grades: readable.filter((g) => g.checkId === 'hipLevel' || g.checkId === 'shoulderLevel') },
      twoReadablePlusAnswers: { ...body, screenId: 'replay-two-ans', grades: readable.filter((g) => g.checkId === 'hipLevel' || g.checkId === 'shoulderLevel'), answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }, { questionId: 'neckShouldersLift', answer: 'no' }] },
      duplicatedAndForeign: { ...body, screenId: 'replay-dup', grades: [...grades, grades[tamperIdx], { ...grades[tamperIdx], checkId: 'pelvicTilt' }, { ...grades[tamperIdx], checkId: 'ribAngle' }] },
      preP3BareGrades: { screenId: 'replay-bare', screen: 'full', results: body.results },
    };
    rec.replays = {};
    for (const [k, b] of Object.entries(tries)) {
      const j = await devPost(b);
      const r = j.response ?? {};
      rec.replays[k] = j.status === 422
        ? { status: 422, error: r.error, refused: r.refused }
        : { status: j.status, graded: r.graded, provisional: r.provisional, readableCameraChecks: r.readableCameraChecks, dropped: r.dropped, paid: r.paid, score: r.summary?.score ?? null, movementFlags: r.summary?.movementFlags, triage: r.summary?.triage, message: r.message };
    }
    // the real routes on this lane: guarded
    rec.realPatchNoSession = (await fetch(`${BASE}/api/mirror/screen`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ screenId: 'x', answers: [] }) })).status;
  }
  save();

  // ── 4. the card at phone width ───────────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.waitForTimeout(800);
  rec.overflowAt390 = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  const cardBox = await card.boundingBox().catch(() => null);
  rec.cardWidthAt390 = cardBox ? Math.round(cardBox.width) : null;
  rec.smallestTapAt390 = await card.getByRole('button').evaluateAll((els) => Math.min(...els.map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))));
  await card.screenshot({ path: join(OUT, 'answers-card-390.png') });
  out.frames['answers-card-390.png'] = { url: '/dev/mirror-truth', what: 'the answers card at 390 px' };
  rec.spokenAtEnd = (await page.evaluate(() => (window as any).__fx.said)).slice(-3);
  rec.pageErrors = errors.filter((e) => !/favicon|DevTools|net::ERR_|Failed to load resource|WebGL|GPU stall|webpack-hmr|XNNPACK|401|Unauthorized/i.test(e));
  await ctx.close();
} catch (e) {
  out.error = String(e).slice(0, 600);
} finally {
  save();
  await browser.close();
  const r = out.run ?? {};
  log(JSON.stringify({ completed: r.completed, secs: r.secondsToComplete, card: r.cardText?.slice(0, 120), buttons: r.cardButtons, selfReport: r.storedSelfReport, unchanged: r.scoredPartUnchanged, replays: r.replays && Object.fromEntries(Object.entries(r.replays).map(([k, v]: [string, any]) => [k, v.status === 422 ? '422' : `${v.paid ? 'paid' : 'unpaid'} readable ${v.readableCameraChecks}`])), overflow: r.overflowAt390, error: out.error }, null, 1));
}
