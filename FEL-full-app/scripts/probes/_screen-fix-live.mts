// SCREEN-FIX live probe (2026-09-29): the Quick Screen in a real browser, portrait (390×844), on a `next start` build
// (SCREEN_BASE; :3171 for this lane), every run in a FRESH browser context, plain URLs. PHASE=before runs it against
// PARENT's screen (the bugs as they were); PHASE=after against the fix.
//
//   FLOW-<band>  a whole screen for one age band, driven by PR #20's synthetic athlete through window.__FEL_POSE_FEED__
//                (?agent=1, a production build on this machine only): the steps, the results' links and cards, the
//                free-game button and where it lands signed out, every request, and every line of text shown.
//   LOCK         after an answer: Start again, a reload and "Done, clear my results" never show the age question again.
//   BACK         the back arrow at every step: where it goes, and the cookie jar and localStorage before and after.
//   CAMERA       Chromium's fake camera, no feed: the camera card shows BEFORE the browser is asked for the camera
//                (getUserMedia counted), then the pose model and wasm load (the Cyber 4 request inventory).
//   GUARD        the browser's Back in the middle of the screen asks first (S-6); on the start card it just leaves.
//   PRIVACY      /screen/privacy renders, with nothing beyond the document and its static files.
//
// Run from FEL-full-app (Node 26), with the server up:
//   SCREEN_BASE=http://127.0.0.1:3171 PHASE=after node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-fix-live.mts
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import { BASE, ORIGIN, OUT, classify, portrait, save, sleep, storage, type Json, type Probe } from './_screen-squad-lib.mts';

const PHASE = process.env.PHASE === 'before' ? 'before' : 'after';
const RUNS = (process.env.RUNS ?? 'FLOW,LOCK,BACK,CAMERA,GUARD,PRIVACY').split(',');
const BANDS = (process.env.BANDS ?? (PHASE === 'before' ? '18+,under-18' : '18+,13-17,under-13')).split(',');

const R = await import('../../lib/assess/replay.ts');
const replay = ((R as unknown as { default?: typeof R }).default ?? R);
type Frame = { t: number; present: boolean; image: { x: number; y: number; z: number; v: number }[]; world?: unknown };
const strip = (fs: readonly Frame[]): Frame[] => fs.map((f) => ({ t: f.t, present: f.present, image: f.image, ...(f.world ? { world: f.world } : {}) }));
const STAND = { front: strip(replay.standFront(0.4).frames), left: strip(replay.standSide('left', 0.4).frames), right: strip(replay.standSide('right', 0.4).frames) };
const TAKES: Record<string, Frame[]> = {
  'T1-front': strip(replay.ohsFront({ kneeInL: 0.06 }).frames), 'T1-side': strip(replay.ohsSide().frames),
  'T2-left': strip(replay.kneeWall('left', { tibiaMax: 44 }).frames), 'T2-right': strip(replay.kneeWall('right', { tibiaMax: 36 }).frames),
  'T3-left': strip(replay.singleLegSquat('left').frames), 'T3-right': strip(replay.singleLegSquat('right').frames),
  T5: strip(replay.cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames),
};

/** Counts getUserMedia calls (the real one still runs: Chromium's fake camera answers it). */
const COUNT_GUM = `
  window.__gum = 0;
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) { const real = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gum++; return real(c); }; }
`;
/** Every line of text the page shows, kept as it changes (the double-colon hunt covers voice captions too). */
const COLLECT_TEXT = `
  window.__lines = new Set();
  setInterval(() => { try { for (const l of (document.body?.innerText ?? '').split('\\n')) { const t = l.trim(); if (t) window.__lines.add(t); } } catch {} }, 150);
`;

const report: Json = { phase: PHASE, base: BASE, date: new Date().toISOString(), runs: {} };
const allReqs: { run: string; url: string; method: string; type: string }[] = [];
const allLines = new Set<string>();

const browser = await chromium.launch({
  executablePath: chromiumExe(), headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

async function open(tag: string): Promise<Probe> {
  const p = await portrait(browser, `${PHASE}-${tag}`, { init: `${COUNT_GUM}\n${COLLECT_TEXT}` });
  return p;
}
async function close(tag: string, p: Probe): Promise<void> {
  for (const r of p.reqs) allReqs.push({ run: tag, url: r.url, method: r.method, type: r.type });
  try { for (const l of (await p.page.evaluate('Array.from(window.__lines ?? [])')) as string[]) allLines.add(l); } catch { /* page gone */ }
  await p.ctx.close();
}
const gum = (page: Page) => page.evaluate('window.__gum ?? 0') as Promise<number>;
const view = (page: Page) => page.evaluate('window.__FEL_ASSESS__ ? window.__FEL_ASSESS__.view() : null') as Promise<Json | null>;
const play = (page: Page, frames: Frame[]) => page.evaluate((fs) => (window as unknown as { __FEL_POSE_FEED__: { play(f: unknown): Promise<number> } }).__FEL_POSE_FEED__.play(fs), frames);
const stepOf = (page: Page) => page.evaluate(`(() => { const e = document.querySelector('section[data-step], [data-step="camera"]'); return e ? e.getAttribute('data-step') : null; })()`) as Promise<string | null>;
/** Storage and cookies, for the "nothing changed" checks. */
const jar = async (p: Probe) => { const s = await storage(p); return { local: s.local, session: s.session, cookies: s.cookies }; };
const hrefs = (page: Page, sel: string) => page.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(sel)} + ' a[href]')).map((a) => a.getAttribute('href'))`) as Promise<string[]>;

/** Start → age → (grown-up / consent) → pain "no" → (camera card) → the camera check. */
async function toCamera(p: Probe, band: string, out: Json, o: { feed: boolean }): Promise<void> {
  const { page } = p;
  if (o.feed) await page.evaluate('window.__FEL_POSE_FEED__ && window.__FEL_POSE_FEED__.begin()');
  out.shots.start = await p.shot('start');
  await page.click('[data-step="start"] [data-primary]');
  await page.waitForSelector('[data-step="age"], [data-step="grown-up"], [data-step="consent"], [data-step="pain"]');
  if (await page.locator('[data-step="age"]').count()) {
    out.ageStep = await page.evaluate(`(() => {
      const card = document.querySelector('[data-step="age"]');
      const opts = Array.from(card.querySelectorAll('[data-age]')).map((b) => ({ band: b.getAttribute('data-age'), label: b.textContent, primary: b.hasAttribute('data-primary'), cls: b.className }));
      return { text: card.innerText, options: opts, sameStyle: new Set(opts.map((o) => o.cls)).size === 1, anyPrimary: opts.some((o) => o.primary) };
    })()`);
    out.shots.age = await p.shot('age');
    await page.click(`[data-age="${band}"]`);
  } else out.ageStep = 'not shown (locked)';
  await page.waitForSelector('[data-step="grown-up"], [data-step="consent"], [data-step="pain"]');
  for (const [step, box] of [['grown-up', '[data-grown-up-box]'], ['consent', '[data-consent-box]']] as const) {
    if (await page.locator(`[data-step="${step}"]`).count()) {
      out.grownUp = { step, text: await page.locator(`[data-step="${step}"]`).innerText(), shot: await p.shot(step) };
      await page.check(box);
      await page.click(`[data-step="${step}"] [data-primary]`);
    }
  }
  await page.waitForSelector('[data-step="pain"]');
  out.shots.pain = await p.shot('pain');
  const gumBefore = await gum(page);
  await page.click('[data-pain="no"]');
  await page.waitForSelector('[data-step="camera-info"], [data-step="starting"], [data-step="camera"], [data-camera-card]');
  if (await page.locator('[data-step="camera-info"]').count()) {
    out.cameraInfo = { text: await page.locator('[data-step="camera-info"]').innerText(), gumAtCard: await gum(page), gumBefore, shot: await p.shot('camera-info') };
    await page.click('[data-step="camera-info"] [data-primary]');
  } else out.cameraInfo = { shown: false, gumRightAfterPainNo: await gum(page), gumBefore };
}

/** The checks, played by the synthetic athlete, to the results. */
async function runChecks(p: Probe, out: Json): Promise<void> {
  const { page } = p;
  for (let i = 0; i < 40; i++) {
    await play(page, STAND.front);
    if (await page.locator('[data-step="camera"] [data-primary]:not([disabled])').count()) break;
  }
  out.shots.deviceCheck = await p.shot('device-check');
  out.deviceCheckText = await page.locator('[data-step="camera"]').innerText().catch(() => null);
  await page.click('[data-step="camera"] [data-primary]');
  const fed = new Set<string>(), seen = new Set<string>();
  const t0 = Date.now();
  for (let loop = 0; loop < 6000 && Date.now() - t0 < 420_000; loop++) {
    const v = await view(page);
    if (!v) { await play(page, STAND.front); continue; }
    const key = `${v.step}:${v.part ?? v.test ?? ''}`;
    if (!seen.has(key)) { seen.add(key); if (['miniResult', 'partDone'].includes(v.step as string) && Object.keys(out.shots).length < 30) out.shots[key] = await p.shot(key.replace(/[^\w-]+/g, '_')); }
    if (v.step === 'done' || v.step === 'stopped') break;
    if (v.step === 'takeoff') { await page.getByRole('button', { name: 'Left', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'painCheck') { await page.getByRole('button', { name: 'No', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'active' && v.part && !fed.has(v.part as string)) {
      fed.add(v.part as string);
      const take = TAKES[v.part as string];
      for (let i = 0; i < take.length; i += 8) {
        await play(page, take.slice(i, i + 8));
        const vv = await view(page);
        if (!vv || vv.part !== v.part) break;
      }
      continue;
    }
    const side = v.part === 'T2-right' ? STAND.right : ((v.part as string | null)?.startsWith('T2') || v.part === 'T1-side' || v.step === 'calibrateSide') && v.step !== 'framing' ? STAND.left : STAND.front;
    await play(page, side.slice(0, 8));
  }
  out.checksMs = Date.now() - t0;
  await page.waitForURL(/\/play\/mirror\/assess\/results$/, { timeout: 30_000 });
  await page.waitForSelector('[data-screen-results]');
}

/** What the results screen shows and links to. */
async function results(p: Probe, out: Json): Promise<void> {
  const { page } = p;
  if (await page.locator('[data-see-all]').count() && !(await page.locator('[data-check-cards]').count())) await page.click('[data-see-all]');
  out.results = await page.evaluate(`(() => {
    const root = document.querySelector('[data-screen-results]');
    return {
      text: root.innerText.slice(0, 5000),
      ctas: Array.from(document.querySelectorAll('[data-cta]')).map((e) => ({ cta: e.getAttribute('data-cta'), tag: e.tagName, text: e.textContent, href: e.getAttribute('href') })),
      hrefs: Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')),
      back: document.querySelector('[data-back]') ? (document.querySelector('[data-back]').getAttribute('href') ?? 'button') : (document.querySelector('header a') ? document.querySelector('header a').getAttribute('href') : null),
      parentCard: !!document.querySelector('[data-parent-card]'),
      emailInputs: document.querySelectorAll('input[type="email"]').length,
      forms: document.querySelectorAll('form').length,
      cards: Array.from(document.querySelectorAll('[data-check-card]')).map((c) => c.getAttribute('data-check-card')),
      toggle: !!document.querySelector('[data-see-all]'),
      previewLabel: document.querySelector('[data-preview-label]') ? document.querySelector('[data-preview-label]').textContent : null,
      stopLine: !!document.querySelector('[data-stop-line]'),
    };
  })()`);
  out.shots.results = await p.shot('results');
  await page.screenshot({ path: join(OUT, `${PHASE}-${out.tag}-results-fullpage.png`), fullPage: true });
}

const FORBIDDEN = /^\/(login|signup|account|play\/brain-brawl)(\/|\?|$)|^\/try(\/|\?|$)|^\/screen\/program/;

try {
  // ── FLOW per band ──
  if (RUNS.includes('FLOW')) for (const band of BANDS) {
    const tag = `flow-${band.replace('+', 'plus')}`;
    const p = await open(tag);
    const out: Json = { tag, band, shots: {} };
    const { page } = p;
    await page.goto(`${BASE}/screen?src=qr&agent=1`);
    await page.waitForSelector('[data-step="start"]');
    await toCamera(p, band, out, { feed: true });
    await runChecks(p, out);
    await results(p, out);
    out.storageAtResults = await jar(p);
    out.forbiddenHrefs = (out.results.hrefs as string[]).filter((h) => FORBIDDEN.test(h));
    // the program page, from the link, or typed in (under 13)
    const program = (out.results.ctas as Json[]).find((c) => c.cta === 'program' && c.href);
    await page.goto(`${BASE}${program?.href ?? '/screen/program/dunking'}`);
    await page.waitForSelector('[data-lane-page], [data-parent-card], [data-not-saved], [data-step="no-pick"]');
    out.program = {
      url: page.url(), shot: await p.shot('program'),
      text: (await page.locator('main, body').first().innerText()).slice(0, 2500),
      hrefs: await hrefs(page, 'body'),
      parentCard: await page.locator('[data-parent-card]').count(), lane: await page.locator('[data-lane-page]').count(),
      emailInputs: await page.locator('input[type="email"]').count(), signup: await page.locator('[data-signup-placeholder]').count(),
      stopLine: await page.locator('[data-stop-line]').count(),
    };
    out.program.forbiddenHrefs = (out.program.hrefs as string[]).filter((h) => FORBIDDEN.test(h));
    // the free game, signed out
    await page.goto(`${BASE}/play/mirror/assess/results`);
    await page.waitForSelector('[data-screen-results]');
    const game = page.locator('[data-cta="game"]');
    if (await game.count()) {
      const before = await jar(p);
      p.phase.v = 'left-screen';
      await game.click();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await sleep(2500);
      out.game = {
        href: await page.evaluate('location.pathname'), url: page.url(), urls: p.urls.slice(-4),
        login: /\/login/.test(page.url()) || p.urls.some((u) => /\/login/.test(u)),
        passwordInputs: await page.locator('input[type="password"]').count(),
        canvases: await page.locator('canvas').count(), cookiesBefore: before.cookies, cookiesAfter: (await jar(p)).cookies,
        shot: await p.shot('game'),
      };
    } else out.game = 'no game link';
    out.urls = p.urls; out.errors = p.errors; out.consoleErrors = p.consoleErrors.slice(0, 20);
    report.runs[tag] = out;
    save(`${PHASE}-report`, report);
    await close(tag, p);
  }

  // ── LOCK: the age answer holds for the tab ──
  if (RUNS.includes('LOCK') && PHASE === 'after') {
    const p = await open('lock');
    const { page } = p;
    const out: Json = { shots: {} };
    await page.goto(`${BASE}/screen`);
    await page.waitForSelector('[data-step="start"]');
    await page.click('[data-step="start"] [data-primary]');
    await page.click('[data-age="under-13"]');
    await page.waitForSelector('[data-step="grown-up"]');
    out.afterAnswer = { session: (await jar(p)).session };
    const again = async (label: string) => {
      await page.waitForSelector('[data-step="start"]');
      await page.click('[data-step="start"] [data-primary]');
      await page.waitForSelector('section[data-step]');
      out[label] = { step: await stepOf(page), shot: await p.shot(`lock-${label}`) };
    };
    await page.click('[data-back]');                       // grown-up → the start card
    await again('startAgain');
    await page.reload();
    await again('afterReload');
    await page.goto(`${BASE}/screen/privacy`);
    await page.waitForSelector('[data-done-clear]');
    await page.click('[data-done-clear]');
    out.afterClear = { session: (await jar(p)).session };
    await page.goto(`${BASE}/screen`);
    await again('afterClear');
    out.program = { parentCard: await (async () => { await page.goto(`${BASE}/screen/program/posture`); await page.waitForSelector('[data-parent-card], [data-not-saved], [data-lane-page]'); return page.locator('[data-parent-card]').count(); })(), shot: await p.shot('lock-program') };
    out.errors = p.errors;
    report.runs.lock = out;
    save(`${PHASE}-report`, report);
    await close('lock', p);
  }

  // ── BACK: the arrow at every step; the cookie jar and localStorage unchanged ──
  if (RUNS.includes('BACK')) {
    const p = await open('back');
    const { page } = p;
    const out: Json = { hops: [] as Json[] };
    await page.goto(`${BASE}/screen`);
    await page.waitForSelector('[data-step="start"]');
    const j0 = await jar(p);
    out.at0 = j0;
    const arrow = async (from: string) => {
      const el = page.locator('header a, header button').first();
      const href = await el.getAttribute('href');
      const label = await el.getAttribute('aria-label');
      await el.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await sleep(800);
      out.hops.push({ from, href, label, landed: page.url().replace(ORIGIN, ''), step: await stepOf(page).catch(() => null), eyebrow: await page.locator('header p').first().textContent().catch(() => null) });
    };
    if (PHASE === 'before') {
      await page.click('[data-step="start"] [data-primary]');
      await page.waitForSelector('[data-step="age"]');
      await arrow('age');
      out.shot = await p.shot('back-landed');
    } else {
      await page.click('[data-step="start"] [data-primary]');
      await page.waitForSelector('[data-step="age"]');
      await arrow('age');                                   // → the start card
      await page.click('[data-step="start"] [data-primary]');
      await page.click('[data-age="13-17"]');
      await page.waitForSelector('[data-step="grown-up"]');
      await page.check('[data-grown-up-box]');
      await page.click('[data-step="grown-up"] [data-primary]');
      await page.waitForSelector('[data-step="pain"]');
      await arrow('pain');                                  // → the grown-up step
      await page.check('[data-grown-up-box]');
      await page.click('[data-step="grown-up"] [data-primary]');
      await page.click('[data-pain="no"]');
      await page.waitForSelector('[data-step="camera-info"]');
      await arrow('camera-info');                           // → pain
      await page.click('[data-pain="no"]');
      await page.waitForSelector('[data-step="camera-info"]');
      await page.click('[data-step="camera-info"] [data-primary]');
      await page.waitForSelector('[data-step="camera"], [data-step="starting"], [data-camera-card]');
      await sleep(1500);
      if (await page.locator('header a, header button').count()) await arrow('camera');   // → the camera card, camera off
      await page.goto(`${BASE}/play/mirror/assess`);
      await page.waitForSelector('[data-step="start"]');
      await arrow('start');                                 // → /screen → the start
      await page.goto(`${BASE}/play/mirror/assess/results`);
      await page.waitForSelector('[data-not-saved], [data-screen-results]');
      await arrow('results');
      await page.goto(`${BASE}/screen/program/dunking`);
      await page.waitForSelector('[data-parent-card], [data-not-saved], [data-lane-page]');
      await arrow('program');
      await page.goto(`${BASE}/screen/privacy`);
      await page.waitForSelector('[data-step="privacy"]');
      await arrow('privacy');
      out.shot = await p.shot('back-last');
    }
    const j1 = await jar(p);
    out.at1 = j1;
    out.localUnchanged = JSON.stringify(j0.local) === JSON.stringify(j1.local);
    out.cookiesUnchanged = JSON.stringify(j0.cookies) === JSON.stringify(j1.cookies);
    out.urls = p.urls;
    out.reachedLogin = p.urls.some((u) => /\/login/.test(u));
    out.reachedMirror = p.urls.some((u) => /\/play\/mirror(\?|$)/.test(u.replace(ORIGIN, '')));
    out.apiCalls = p.reqs.filter((r) => classify(r) === 'api').map((r) => r.url.replace(ORIGIN, ''));
    out.errors = p.errors;
    report.runs.back = out;
    save(`${PHASE}-report`, report);
    await close('back', p);
  }

  // ── CAMERA: the card before the browser asks; then the real (fake) camera and the pose model ──
  if (RUNS.includes('CAMERA')) {
    const p = await open('camera');
    const { page } = p;
    const out: Json = { shots: {} };
    await page.goto(`${BASE}/screen`);
    await page.waitForSelector('[data-step="start"]');
    await toCamera(p, '18+', out, { feed: false });
    out.gumAfterCardButton = await gum(page);
    await page.waitForSelector('[data-step="camera"] [data-primary]:not([disabled]), [data-camera-card]', { timeout: 120_000 }).catch(() => null);
    await sleep(1500);
    out.deviceCheckText = await page.locator('[data-step="camera"]').innerText().catch(() => null);
    out.shots.deviceCheck = await p.shot('device-check-real');
    out.poseRequests = p.reqs.filter((r) => /\/pose\/|mediapipe|jsdelivr|googleapis/.test(r.url)).map((r) => ({ url: r.url, method: r.method }));
    out.errors = p.errors;
    report.runs.camera = out;
    save(`${PHASE}-report`, report);
    await close('camera', p);
  }

  // ── GUARD: the browser's Back mid-screen ──
  if (RUNS.includes('GUARD')) {
    const p = await open('guard');
    const { page } = p;
    const out: Json = {};
    await page.goto(`${BASE}/play/mirror/assess/results`);           // somewhere to go back to
    await page.waitForSelector('[data-not-saved], [data-screen-results]');
    await page.goto(`${BASE}/screen`);
    await page.waitForSelector('[data-step="start"]');
    await page.click('[data-step="start"] [data-primary]');
    await page.waitForSelector('[data-step="age"]');
    await page.evaluate('history.back()');
    await sleep(1500);
    out.firstBack = { url: page.url().replace(ORIGIN, ''), dialog: await page.locator('[data-leave-dialog]').count(), step: await stepOf(page).catch(() => null) };
    if (out.firstBack.dialog) {
      out.dialogText = await page.locator('[data-leave-dialog]').innerText();
      out.shot = await p.shot('leave-dialog');
      await page.click('[data-leave-stay]');
      await sleep(500);
      out.afterStay = { url: page.url().replace(ORIGIN, ''), dialog: await page.locator('[data-leave-dialog]').count(), step: await stepOf(page) };
      await page.evaluate('history.back()');
      await page.waitForSelector('[data-leave-dialog]');
      await page.click('[data-leave-go]');
      await page.waitForURL(/\/results$/, { timeout: 15_000 }).catch(() => null);
      out.afterLeave = { url: page.url().replace(ORIGIN, '') };
    }
    // on the start card, Back just leaves
    await page.goto(`${BASE}/screen`);
    await page.waitForSelector('[data-step="start"]');
    await page.evaluate('history.back()');
    await sleep(1500);
    out.fromStart = { url: page.url().replace(ORIGIN, ''), dialog: await page.locator('[data-leave-dialog]').count() };
    out.errors = p.errors;
    report.runs.guard = out;
    save(`${PHASE}-report`, report);
    await close('guard', p);
  }

  // ── PRIVACY ──
  if (RUNS.includes('PRIVACY')) {
    const p = await open('privacy');
    const { page } = p;
    const res = await page.goto(`${BASE}/screen/privacy`);
    await sleep(1500);
    const out: Json = {
      status: res?.status(), text: (await page.locator('body').innerText()).slice(0, 2500), shot: await p.shot('privacy'),
      hrefs: await hrefs(page, 'body'), forms: await page.locator('form').count(), inputs: await page.locator('input').count(),
      requests: p.reqs.map((r) => ({ url: r.url.replace(ORIGIN, ''), method: r.method, kind: classify(r) })).filter((r) => !['document', 'static'].includes(r.kind)),
      storage: await jar(p),
    };
    out.errors = p.errors;
    report.runs.privacy = out;
    save(`${PHASE}-report`, report);
    await close('privacy', p);
  }
} finally {
  await browser.close();
}

// ── the request inventory (Cyber 4a) and the double-colon hunt ──
const hosts: Json = {};
for (const r of allReqs) { const h = new URL(r.url).host; hosts[h] = (hosts[h] ?? 0) + 1; }
report.inventory = {
  hosts, thirdParty: allReqs.filter((r) => new URL(r.url).origin !== ORIGIN && !r.url.startsWith('data:')).map((r) => `${r.run} ${r.method} ${r.url}`),
  pose: [...new Set(allReqs.filter((r) => /\/pose\//.test(r.url)).map((r) => r.url.replace(ORIGIN, '')))],
  api: [...new Set(allReqs.filter((r) => new URL(r.url).pathname.startsWith('/api/')).map((r) => `${r.run} ${r.method} ${new URL(r.url).pathname}`))],
};
report.colons = [...allLines].filter((l) => /::|:[^:]*:/.test(l));
save(`${PHASE}-report`, report);
console.log(JSON.stringify({ inventory: { hosts, thirdParty: report.inventory.thirdParty.length, api: report.inventory.api }, colons: report.colons }, null, 1));
