// SCREEN-SHIP Squad probe: the whole Quick Screen in a real browser, portrait, against the production build on :3141
// (Squad gates 1, 2, 3, 5 (request log), 6; A2-5, A3-6, A4-8).
//
// THE ATHLETE is PR #20's synthetic one (lib/assess/replay.ts), generated here in Node and played into the page through
// window.__FEL_POSE_FEED__ (a production build on this machine opened with ?agent=1: lib/pose/feed.ts's gate). No
// camera is granted. Three runs:
//   A  a guest adult, flagged (a caving left knee, a tight right ankle) — then every A4-8 check on its result:
//      "Back to my results", browser Back, refresh with and without data, a new tab, "Done, clear my results", a new
//      screen wiping the old one, every visited URL, and the game button;
//   B  a guest under 18 with a parent's consent, a clean screen — the win card and the dunking lane;
//   C  a signed-in adult (a throwaway account in the throwaway database) — the same request log.
//
// Run from FEL-full-app (Node 26), with the server up:
//   node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-squad-flow.mts
import type { Page } from 'playwright-core';
import { readFileSync } from 'node:fs';
import {
  BASE, OUT, classify, inViewport, launch, platformFonts, portrait, save, screenKeys, sleep, storage, type Json, type Probe,
} from './_screen-squad-lib.mts';

const R = await import('../../lib/assess/replay.ts');
const replay = ((R as unknown as { default?: typeof R }).default ?? R);

type Frame = { t: number; present: boolean; image: { x: number; y: number; z: number; v: number }[]; world?: unknown };
const strip = (fs: readonly Frame[]): Frame[] => fs.map((f) => ({ t: f.t, present: f.present, image: f.image, ...(f.world ? { world: f.world } : {}) }));
const STAND = { front: strip(replay.standFront(0.4).frames), left: strip(replay.standSide('left', 0.4).frames), right: strip(replay.standSide('right', 0.4).frames) };
const TAKES = {
  flagged: {
    'T1-front': strip(replay.ohsFront({ kneeInL: 0.06 }).frames), 'T1-side': strip(replay.ohsSide().frames),
    'T2-left': strip(replay.kneeWall('left', { tibiaMax: 44 }).frames), 'T2-right': strip(replay.kneeWall('right', { tibiaMax: 36 }).frames),
    'T3-left': strip(replay.singleLegSquat('left').frames), 'T3-right': strip(replay.singleLegSquat('right').frames),
    T5: strip(replay.cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames),
  },
  clean: {
    'T1-front': strip(replay.ohsFront({}).frames), 'T1-side': strip(replay.ohsSide().frames),
    'T2-left': strip(replay.kneeWall('left', { tibiaMax: 44 }).frames), 'T2-right': strip(replay.kneeWall('right', { tibiaMax: 44 }).frames),
    'T3-left': strip(replay.singleLegSquat('left').frames), 'T3-right': strip(replay.singleLegSquat('right').frames),
    T5: strip(replay.cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames),
  },
} as const;

/** SCREEN_RUNS=C,G6 re-runs only those, into the saved report. */
const RUNS = (process.env.SCREEN_RUNS ?? 'A,A2,B,C,G6').split(',');
const report: Json = process.env.SCREEN_RUNS
  ? JSON.parse((await import('node:fs')).readFileSync(`${OUT}/flow-report.json`, 'utf8'))
  : { base: BASE, date: new Date().toISOString(), runs: {} };

async function play(page: Page, frames: Frame[]): Promise<void> {
  await page.evaluate((fs) => window.__FEL_POSE_FEED__!.play(fs as never), frames);
}
const view = (page: Page) => page.evaluate(() => window.__FEL_ASSESS__?.view() ?? null);

/** Gate 1 at one step: its action inside the first screen, and the platform font of its heading and action. */
async function step1(p: Probe, name: string, heading: string, action: string, out: Json) {
  const shot = await p.shot(name);
  const act = await inViewport(p.page, action);
  const fonts = { heading: await platformFonts(p.page, heading), action: await platformFonts(p.page, action) };
  const courier = [...fonts.heading, ...fonts.action].some((f) => /courier/i.test(f));
  out.gate1 ??= [];
  out.gate1.push({ step: name, primaryInViewport: act.inView, box: act.box, fonts, systemFace: !courier && fonts.heading.length > 0 && fonts.action.length > 0, shot });
}

async function runScreen(p: Probe, o: { age: '18+' | 'under-18' | 'unknown'; takes: keyof typeof TAKES; loss?: boolean }): Promise<Json> {
  const out: Json = { age: o.age, takes: o.takes, beats: [] as string[], shots: {} as Json };
  const { page } = p;
  p.phase.v = 'before-age';
  await page.goto(`${BASE}/screen?src=qr&agent=1`);
  await page.waitForSelector('[data-step="start"]');
  out.landedAt = page.url();
  await step1(p, 'start', '[data-step="start"] h2', '[data-step="start"] [data-primary]', out);
  await page.evaluate(() => window.__FEL_POSE_FEED__!.begin());
  await page.click('[data-step="start"] [data-primary]');
  await page.waitForSelector('[data-step="age"]');
  out.storageAtAge = await storage(p);
  await step1(p, 'age', '[data-step="age"] h2', '[data-step="age"] [data-primary]', out);
  await page.click(`[data-age="${o.age}"]`);
  p.phase.v = 'after-age';
  if (o.age !== '18+') {
    await page.waitForSelector('[data-step="consent"]');
    out.storageBeforeConsent = await storage(p);
    await step1(p, 'consent', '[data-step="consent"] h2', '[data-step="consent"] [data-primary]', out);
    await page.check('[data-consent-box]');
    await page.click('[data-step="consent"] [data-primary]');
    p.phase.v = 'after-consent';
  }
  await page.waitForSelector('[data-step="pain"]');
  out.storageAtPain = await storage(p);
  await step1(p, 'pain', '[data-step="pain"] h2', '[data-step="pain"] [data-primary]', out);
  await page.click('[data-pain="no"]');
  // the camera check: frames flowing, then Continue
  for (let i = 0; i < 40; i++) {
    await play(page, STAND.front);
    if (await page.locator('[data-step="camera"] [data-primary]:not([disabled])').count()) break;
  }
  await step1(p, 'camera', '[data-step="camera"] p', '[data-step="camera"] [data-primary]', out);
  await page.click('[data-step="camera"] [data-primary]');

  const fed = new Set<string>();
  const seen = new Set<string>();
  let lossShot = false;
  const t0 = Date.now();
  for (let loop = 0; loop < 6000 && Date.now() - t0 < 360_000; loop++) {
    const v = await view(page);
    if (!v) { await play(page, STAND.front); continue; }
    const key = `${v.step}:${v.part ?? v.test ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.beats.push(key);
      console.log(`[${o.takes}/${o.age}] ${Math.round((Date.now() - t0) / 1000)}s ${key}`);
      if (['framing', 'position', 'countdown', 'active', 'partDone', 'miniResult', 'paused', 'calibrate'].includes(v.step) && Object.keys(out.shots).length < 40) {
        out.shots[key] = await p.shot(key.replace(/[^\w-]+/g, '_'));
        if (v.step === 'active' || v.step === 'position' || v.step === 'calibrate') {
          const STOP = '[data-stop]';                                  // "Something hurts: stop"
          const stop = await inViewport(page, STOP);
          out.gate1.push({ step: key, primaryInViewport: stop.inView, action: await page.locator(STOP).first().textContent(), fonts: await platformFonts(page, STOP) });
        }
      }
    }
    if (v.step === 'countdown') { const k = `countdown-${(await page.locator('.text-\\[140px\\]').first().textContent().catch(() => ''))}`; if (!seen.has(`${k}:${v.part}`)) { seen.add(`${k}:${v.part}`); out.beats.push(`${k}:${v.part}`); if (v.part === 'T1-front') out.shots[`${k}`] = await p.shot(k); } }
    if (v.step === 'done' || v.step === 'stopped') break;
    // a tap, then frames: the QA view only refreshes on the next pose frame
    if (v.step === 'takeoff') { await page.getByRole('button', { name: 'Left', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'painCheck') { await page.getByRole('button', { name: 'No', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'active' && v.part && !fed.has(v.part)) {
      fed.add(v.part);
      const take = [...(TAKES[o.takes] as Record<string, Frame[]>)[v.part]];
      // a tracking loss in the middle of the first part: 1 s with no body
      const lossAt = o.loss && v.part === 'T1-front' ? Math.floor(take.length / 2) : -1;
      for (let i = 0; i < take.length; i += 8) {
        if (lossAt >= 0 && i <= lossAt && lossAt < i + 8) {
          const gap: Frame[] = Array.from({ length: 30 }, (_, k) => ({ t: take[i].t + k * 33, present: false, image: [] }));
          await play(page, gap);
          const vv = await view(page);
          if (vv?.step === 'paused' && !lossShot) { lossShot = true; out.shots['paused-loss'] = await p.shot('tracking-loss'); out.lossOverlay = await page.locator('[data-tracking-loss]').textContent(); out.beats.push('paused:loss'); }
        }
        await play(page, take.slice(i, i + 8));
        const vv = await view(page);
        if (vv && vv.part === v.part && vv.step === 'active' && !seen.has(`dots:${v.part}:${vv.reps}`)) {
          seen.add(`dots:${v.part}:${vv.reps}`);
          out.dots ??= {};
          out.dots[`${v.part}:${vv.reps}`] = await page.locator('[data-rep-dots] [data-dot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dot')));
        }
        if (!vv || vv.part !== v.part) break;           // the part ended: the athlete stops (three reps, A2-2)
      }
      continue;
    }
    const side = v.part === 'T2-right' ? STAND.right : (v.part?.startsWith('T2') || v.part === 'T1-side' || v.step === 'calibrateSide') && v.step !== 'framing' ? STAND.left : STAND.front;
    await play(page, side.slice(0, 8));
  }
  out.ms = Date.now() - t0;
  await page.waitForURL(/\/play\/mirror\/assess\/results$/, { timeout: 30_000 });
  await page.waitForSelector('[data-screen-results]');
  p.phase.v = 'results';
  out.resultsUrl = page.url();
  out.storageAtResults = await storage(p);
  return out;
}

/** The result cards, as the athlete sees them: the priorities, then every check with its band. */
async function cards(page: Page): Promise<Json> {
  if (!(await page.locator('[data-check-cards]').count())) await page.click('[data-see-all]');
  return page.evaluate(() => ({
    priorities: Array.from(document.querySelectorAll('[data-priority]')).map((e) => e.getAttribute('data-priority')),
    checks: Array.from(document.querySelectorAll('[data-check-card]')).map((e) => `${e.getAttribute('data-check-card')}=${e.querySelector('[data-band]')?.getAttribute('data-band')}`),
    win: !!document.querySelector('[data-win-card]'),
    lane: (document.querySelector('[data-cta="program"]') as HTMLAnchorElement | null)?.getAttribute('href') ?? null,
    pb: document.querySelector('[data-personal-best]')?.textContent ?? null,
  }));
}

async function resultsChecks(p: Probe, out: Json, tag: string) {
  const { page } = p;
  const disclaimer = await inViewport(page, '[data-disclaimer]');
  const program = await inViewport(page, '[data-cta="program"]');
  out.results = {
    disclaimerInViewport: disclaimer.inView, disclaimerBox: disclaimer.box, disclaimerText: await page.locator('[data-disclaimer]').textContent(),
    previewLabel: await page.locator('[data-preview-label]').first().textContent(),
    programInViewport: program.inView, programBox: program.box,
    fonts: { disclaimer: await platformFonts(page, '[data-disclaimer]'), program: await platformFonts(page, '[data-cta="program"]') },
    shot: await p.shot(`${tag}-results`),
  };
  out.results.ctas = await page.evaluate(() => Array.from(document.querySelectorAll('[data-cta]')).map((e) => ({ cta: e.getAttribute('data-cta'), variant: e.getAttribute('data-variant'), tag: e.tagName, text: e.textContent, href: e.getAttribute('href'), bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopWidth })));
  out.results.afterCtas = await page.evaluate(() => {
    const game = document.querySelector('[data-cta="game"]')!;
    const all = Array.from(document.querySelectorAll('[data-screen-results] *'));
    const i = all.indexOf(game);
    return all.slice(i + 1).filter((e) => e.matches('a,button,[data-screenshot-line]')).map((e) => e.getAttribute('data-screenshot-line') !== null ? 'screenshot-line' : e.getAttribute('data-done-clear') !== null ? 'done-clear' : `${e.tagName}:${e.textContent}`);
  });
  out.results.cards = await cards(page);
  out.results.shotAll = await p.shot(`${tag}-results-all`);
  await page.screenshot({ path: `${OUT}/${tag}-results-fullpage.png`, fullPage: true });
  out.results.gate3 = await page.evaluate(() => Array.from(document.querySelectorAll('[data-check-card]')).map((c) => ({
    id: c.getAttribute('data-check-card'), icon: !!c.querySelector('svg[data-band-icon]'), word: c.querySelector('[data-band-word]')?.textContent ?? null,
    colour: c.querySelector('[data-band]')?.getAttribute('data-colour') ?? null, aria: c.getAttribute('aria-label'),
  })));
  out.results.text = (await page.locator('[data-screen-results]').innerText()).slice(0, 4000);
}

const browser = await launch();
try {
  // ── A: a guest adult, flagged, with every A4-8 check ──
  if (RUNS.includes('A')) {
    const p = await portrait(browser, 'A-guest-adult');
    const out = await runScreen(p, { age: '18+', takes: 'flagged', loss: true });
    await resultsChecks(p, out, 'A');
    const { page } = p;
    const sig = JSON.stringify(out.results.cards);
    const a48: Json = {};
    // the program button → the lane page
    const laneHref = out.results.cards.lane;
    p.phase.v = 'program';
    await page.click('[data-cta="program"]');
    await page.waitForSelector('[data-lane-page], [data-not-saved]');
    a48.lanePage = { url: page.url(), shot: await p.shot('A-lane'), order: await page.evaluate(() => ['data-lane-header', 'data-top-flag', 'data-sample-drill', 'data-coming-soon', 'data-back-to-results'].map((a) => { const e = document.querySelector(`[${a}]`); return e ? Array.from(document.querySelectorAll('*')).indexOf(e) : -1; })),
      text: (await page.locator('[data-lane-page]').innerText()).slice(0, 1500), inputs: await page.locator('input, form, [type="email"]').count(), signin: await page.locator('text=/sign in|log in/i').count() };
    // "Back to my results"
    await page.click('[data-back-to-results]');
    await page.waitForSelector('[data-screen-results]');
    a48.backButton = { url: page.url(), same: JSON.stringify(await cards(page)) === sig };
    // browser Back from the lane page
    await page.click('[data-cta="program"]');
    await page.waitForSelector('[data-lane-page]');
    await page.goBack();
    await page.waitForSelector('[data-screen-results]');
    a48.browserBack = { url: page.url(), same: JSON.stringify(await cards(page)) === sig };
    // refresh WITH data: the results, then the lane page
    await page.reload();
    await page.waitForSelector('[data-screen-results]');
    a48.refreshResults = { same: JSON.stringify(await cards(page)) === sig };
    await page.goto(`${BASE}${laneHref}`);
    await page.waitForSelector('[data-lane-page]');
    await page.reload();
    await page.waitForSelector('[data-lane-page]');
    a48.refreshLane = { lane: await page.getAttribute('[data-lane-page]', 'data-lane-page') };
    // a new tab: no session
    const tab = await p.ctx.newPage();
    await tab.goto(`${BASE}/play/mirror/assess/results`);
    await tab.waitForSelector('[data-not-saved], [data-screen-results]');
    a48.newTabResults = { notSaved: await tab.locator('[data-not-saved]').count() === 1, restart: await tab.locator('[data-restart]').count() === 1, lane: await tab.locator('[data-lane-page]').count() };
    await tab.screenshot({ path: `${OUT}/A-newtab-results.png` });
    await tab.goto(`${BASE}/screen/program/correctives`);
    await tab.waitForSelector('[data-not-saved], [data-lane-page]');
    a48.newTabLane = { notSaved: await tab.locator('[data-not-saved]').count() === 1, lane: await tab.locator('[data-lane-page]').count() };
    await tab.screenshot({ path: `${OUT}/A-newtab-lane.png` });
    await tab.close();
    // the game button (a guest)
    await page.goto(`${BASE}/play/mirror/assess/results`);
    await page.waitForSelector('[data-screen-results]');
    // "Done, clear my results"
    a48.storageBeforeClear = await storage(p);
    await page.click('[data-done-clear]');
    await page.waitForURL(/\/play\/mirror\/assess$/);
    await page.waitForSelector('[data-step="start"]');
    a48.afterClear = { url: page.url(), storage: await storage(p) };
    await page.goto(`${BASE}/play/mirror/assess/results`);
    await page.waitForSelector('[data-not-saved], [data-screen-results]');
    a48.refreshAfterClear = { notSaved: await page.locator('[data-not-saved]').count() === 1, shot: await p.shot('A-after-clear') };
    await page.goto(`${BASE}/screen/program/correctives`);
    await page.waitForSelector('[data-not-saved], [data-lane-page]');
    a48.laneAfterClear = { notSaved: await page.locator('[data-not-saved]').count() === 1 };
    out.a48 = a48;
    p.phase.v = 'done';
    out.urls = p.urls; out.reqs = p.reqs; out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report.runs.A = out;
    save('flow-report', report);
    await p.ctx.close();
  }

  // ── A′: a new screen wipes the old one first ──
  if (RUNS.includes('A2')) {
    const p = await portrait(browser, 'A2-wipe');
    const out = await runScreen(p, { age: '18+', takes: 'flagged' });
    out.before = screenKeys((await storage(p)).session);
    await p.page.goto(`${BASE}/play/mirror/assess`);
    await p.page.waitForSelector('[data-step="start"]');
    out.beforeStart = screenKeys((await storage(p)).session);
    await p.page.click('[data-step="start"] [data-primary]');
    await p.page.waitForSelector('[data-step="age"]');
    out.afterStart = screenKeys((await storage(p)).session);
    delete out.beats; delete out.shots;
    out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report.runs.A2 = out;
    save('flow-report', report);
    await p.ctx.close();
  }

  // ── B: a guest under 18 with a parent's consent, a clean screen ──
  if (RUNS.includes('B')) {
    const p = await portrait(browser, 'B-minor-consent');
    const out = await runScreen(p, { age: 'under-18', takes: 'clean' });
    await resultsChecks(p, out, 'B');
    p.phase.v = 'program';
    await p.page.click('[data-cta="program"]');
    await p.page.waitForSelector('[data-lane-page]');
    out.lane = { url: p.page.url(), text: (await p.page.locator('[data-lane-page]').innerText()).slice(0, 800), shot: await p.shot('B-lane') };
    out.urls = p.urls; out.reqs = p.reqs; out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report.runs.B = out;
    save('flow-report', report);
    await p.ctx.close();
  }

  // ── C: a signed-in adult ──
  if (RUNS.includes('C')) {
    const p = await portrait(browser, 'C-signed-in');
    const pw = readFileSync(process.env.SCREEN_PW_FILE!, 'utf8').trim();
    const csrf = await (await p.ctx.request.get(`${BASE}/api/auth/csrf`)).json();
    const r = await p.ctx.request.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf.csrfToken, email: 'screen-ship-adult@throwaway.test', password: pw, json: 'true' }, maxRedirects: 0 });
    const session = await (await p.ctx.request.get(`${BASE}/api/auth/session`)).json();
    p.reqs.length = 0;                                   // the sign-in itself is not the screen
    const out = await runScreen(p, { age: '18+', takes: 'flagged' });
    out.signIn = { status: r.status(), signedIn: !!session?.user, cookies: (await p.ctx.cookies()).map((c) => c.name) };
    await resultsChecks(p, out, 'C');
    // gate 6 for a signed-in athlete: the game button lands on Brain Brawl, no wall, no sign-up dialog
    p.phase.v = 'left-screen';
    await p.page.click('[data-cta="game"]');
    await p.page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1500);
    out.game = { url: p.page.url(), dialog: await p.page.locator('[role="dialog"]').count(), signup: await p.page.getByText(/create an account|sign up/i).count(), loginForm: await p.page.locator('input[type="password"]').count(), shot: await p.shot('C-brain-brawl') };
    out.urls = p.urls; out.reqs = p.reqs; out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report.runs.C = out;
    save('flow-report', report);
    await p.ctx.close();
  }

  // ── gate 6 for a guest: the game button ──
  if (RUNS.includes('G6')) {
    const p = await portrait(browser, 'G6-guest');
    await runScreen(p, { age: '18+', takes: 'flagged' });
    p.phase.v = 'left-screen';
    await p.page.click('[data-cta="game"]');
    await p.page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1500);
    report.runs.G6 = { url: p.page.url(), urls: p.urls, loginForm: await p.page.locator('input[type="password"]').count(), shot: await p.shot('G6-guest-game'), errors: p.errors };
    save('flow-report', report);
    await p.ctx.close();
  }
} finally {
  await browser.close();
}

// ── the verdicts ──
const V: Json = {};
const privacy = (run: Json) => {
  const onScreen = (run.reqs as Json[]).filter((r) => r.phase !== 'left-screen');
  const bad = onScreen.map((r) => ({ ...r, kind: classify(r as never) })).filter((r) => !['document', 'static', 'rsc'].includes(r.kind));
  const beforeAge = onScreen.filter((r) => r.phase === 'before-age').map((r) => ({ url: r.url, kind: classify(r as never) }));
  return { total: onScreen.length, bad, beforeAge: beforeAge.filter((r) => !['document', 'static'].includes(r.kind)), writes: onScreen.filter((r) => r.method !== 'GET' && r.method !== 'HEAD'), bodies: onScreen.filter((r) => r.body > 0) };
};
for (const k of ['A', 'B', 'C'] as const) if (report.runs[k]) V[k] = privacy(report.runs[k]);
report.verdicts = V;
save('flow-report', report);
console.log(JSON.stringify({ verdicts: V, A48: report.runs.A?.a48, dotsA: report.runs.A?.dots, lossOverlay: report.runs.A?.lossOverlay }, null, 1).slice(0, 6000));
