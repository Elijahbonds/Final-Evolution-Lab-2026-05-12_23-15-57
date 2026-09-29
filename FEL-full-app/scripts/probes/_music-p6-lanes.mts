// MUSIC-SUITE P6 (2026-09-25) — "PERFORM plays your song", checked in a real browser on the lane's dev server (/dev/music:
// the real StudioMode; __FEL_STUDIO__ publishes the scheduled steps on the engine clock, __FEL_PERFORM__ what PERFORM sees).
//   A. FREE PLAY on your beat (kick 0/4/8/12, snare 4/12, hats on every 16th): the lanes show a note only where each part
//      hits (hats on the 8ths — the cap); PLAY; the band starts as the kick alone; a player tapping every lane note on
//      time (H / J / K) brings the parts in; a Flip-lane key on a kick note reads WRONG LANE; Space pauses and resumes; a
//      stubbed gamepad's A button plays the SNARE lane; END SET → the recap (per lane, histogram, timing line) and the stats.
//   B. A STEADY TAPPER on one key (K, the hats lane) at the note rate for 8 bars: the set's accuracy and win.
//   C. THE ARENA (?arena=cm_probe_p6, the attempt endpoint stubbed in the page — the lane's DB is offline): the rules line
//      BEFORE the count-in, START posts {phase:'start'}, the house beat plays locked, the player taps its chart (every 7th
//      note skipped, every 11th in the wrong lane), the set ends itself, {phase:'finish', taps} is posted, and the score the
//      room handed its card equals judgeHouseSet(houseBeatFor(id), the posted taps) run HERE, in node — the server's rerun.
//      Then a second visit whose start is refused (409 ONE_ATTEMPT): the room says so and never counts in.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p6-lanes.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import * as houseNs from '../../lib/babylon/music/houseBeat.ts';
import * as stepNs from '../../lib/babylon/music/stepTime.ts';
import type { HouseTap } from '../../lib/babylon/music/houseBeat.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default (as scripts/probes/_body-seam-live.mts)
const house = ((houseNs as Any).default ?? houseNs) as typeof houseNs;
const { houseBeatFor, judgeHouseSet, HOUSE_LANES } = house;
const { songStepTime } = ((stepNs as Any).default ?? stepNs) as typeof stepNs;

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p6';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p6 +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), pageErrors: [] as string[] };

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16') && d.getAttribute('data-qa') !== 'perform-lane')`;
async function clickCell(p: Page, row: number, step: number): Promise<void> {
  await p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
}
/** Run an in-page function given as SOURCE TEXT with a JSON argument (a TS function would carry esbuild's __name helper). */
const inPage = (p: Page, fn: string, arg: unknown = null): Promise<Any> => p.evaluate(`(${fn})(${JSON.stringify(arg)})`);
const perf = (p: Page) => p.evaluate('window.__FEL_PERFORM__ ?? null');
const key = (p: Page, k: string) => inPage(p, `(kk) => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: kk, bubbles: true, cancelable: true }));
  document.body.dispatchEvent(new KeyboardEvent('keyup', { key: kk, bubbles: true, cancelable: true }));
}`, k);

// the in-page player: taps every note of the lanes on screen at its scheduled time (keydown of the lane's key)
const PLAY_LANES = `async ([sec, keys]) => {
  const P = window.__FEL_STUDIO__;
  const end = P.now() + sec; const done = new Set(); let taps = 0; const band = [];
  let lastBand = '';
  while (P.now() < end) {
    const now = P.now();
    const lanes = window.__FEL_PERFORM__?.lanes ?? [[], [], [], []];
    for (const s of P.steps) {
      const k = s.time.toFixed(5);
      if (done.has(k) || s.time > now) continue;
      done.add(k);
      if (now - s.time > 0.04) continue;
      for (let l = 0; l < 4; l++) if (lanes[l].includes(s.step) && keys[l]) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[l], bubbles: true, cancelable: true }));
        taps++;
      }
    }
    const b = JSON.stringify(window.__FEL_PERFORM__?.band ?? []);
    if (b !== lastBand) { band.push({ at: +(now).toFixed(2), band: JSON.parse(b) }); lastBand = b; }
    await new Promise((r) => setTimeout(r, 0));
  }
  return { taps, band };
}`;

async function freePlay(browser: Any): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(`(() => {
    try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}
    // a stubbed standard pad (the probe flips its buttons)
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    window.__pad = buttons;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [{ index: 0, connected: true, mapping: 'standard', id: 'probe pad', buttons, axes: [0, 0, 0, 0], timestamp: performance.now() }] });
  })()`);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(String(e)));
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(400);
  // a known grid: clear, 92 BPM, no swing
  const clear = p.locator('[data-qa="clear"]');
  if (await clear.isEnabled().catch(() => false)) { await clear.click(); await p.locator('[data-qa="clear-yes"]').click(); }
  await inPage(p, `() => {
    for (const [l, v] of [['BPM', 92], ['SWING', 0]]) {
      const inp = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').startsWith(l)).querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(v));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }`);
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  for (const s of [4, 12]) await clickCell(p, 1, s);
  for (let s = 0; s < 16; s++) await clickCell(p, 2, s);
  await p.waitForTimeout(300);
  const a0 = await perf(p);
  R.A = { lanesBeforePlay: a0?.lanes, bandBeforePlay: a0?.band, mode: a0?.mode };
  log('lanes', JSON.stringify(a0?.lanes), 'band', JSON.stringify(a0?.band));
  R.A.padsDrawn = await p.locator('[data-qa="perform-pad"]').count();
  R.A.hint = await p.locator('[data-qa="perform-hint"]').textContent();

  // PLAY and play the kick / snare / hats notes on time for ~3 bars
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  await p.waitForTimeout(250);
  R.A.play = await inPage(p, PLAY_LANES, [8, ['h', 'j', 'k', null]]);
  log('played', JSON.stringify(R.A.play));
  await p.screenshot({ path: `${OUT}/p6-lanes-desktop.png` });
  // WRONG LANE: the Flip-lane key right on a kick note
  R.A.wrongLane = await inPage(p, `async () => {
    const P = window.__FEL_STUDIO__;
    const kicks = window.__FEL_PERFORM__.lanes[0];
    for (let i = 0; i < 400; i++) {
      const s = P.steps.find((x) => kicks.includes(x.step) && x.time > P.now() && x.time - P.now() < 0.08);
      if (s) {
        while (P.now() < s.time) await new Promise((r) => setTimeout(r, 0));
        const seen = [];
        const el = document.querySelector('[data-qa="perform-status"]');
        const mo = new MutationObserver(() => seen.push(el.textContent));
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 450));
        mo.disconnect();
        return { seen };
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    return null;
  }`);
  log('wrong lane', JSON.stringify(R.A.wrongLane));
  // the PAD: A (button 0) = the SNARE lane, pressed on a snare note
  R.A.pad = await inPage(p, `async () => {
    const P = window.__FEL_STUDIO__;
    const pad = window.__pad;
    for (let i = 0; i < 600; i++) {
      const s = P.steps.find((x) => (x.step === 4 || x.step === 12) && x.time > P.now() && x.time - P.now() < 0.06);
      if (s) {
        while (P.now() < s.time - 0.008) await new Promise((r) => setTimeout(r, 0));
        const seen = [];
        const el = document.querySelector('[data-qa="perform-status"]');
        const mo = new MutationObserver(() => seen.push(el.textContent));
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        pad[0].pressed = true; pad[0].value = 1;
        await new Promise((r) => setTimeout(r, 120));
        const flashes = [...document.querySelectorAll('[data-qa="perform-pad"]')].map((b) => b.querySelector('[data-qa="perform-pad-flash"]')?.textContent ?? '');
        pad[0].pressed = false; pad[0].value = 0;
        await new Promise((r) => setTimeout(r, 200));
        mo.disconnect();
        return { seen, flashes };
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    return null;
  }`);
  log('pad', JSON.stringify(R.A.pad));
  // PAUSE and back
  await key(p, ' ');
  await p.waitForTimeout(300);
  R.A.pausedRunning = await p.evaluate(() => (window as Any).__FEL_STUDIO__.engine()?.running ?? null);
  await key(p, ' ');
  await p.waitForTimeout(300);
  R.A.resumedRunning = await p.evaluate(() => (window as Any).__FEL_STUDIO__.engine()?.running ?? null);
  log('pause', R.A.pausedRunning, '→ resume', R.A.resumedRunning);
  R.A.play2 = await inPage(p, PLAY_LANES, [10, ['h', 'j', 'k', null]]);
  await p.getByRole('button', { name: 'END SET' }).click();
  await p.waitForTimeout(600);
  R.A.ended = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.A.recap = (await perf(p))?.recap;
  R.A.recapTiming = await p.locator('[data-qa="recap-timing"]').textContent().catch(() => null);
  R.A.recapLanes = await p.evaluate(() => [...document.querySelectorAll('[data-qa="recap-lane"]')].map((e) => [e.getAttribute('data-lane'), e.getAttribute('data-acc')]));
  R.A.recapHistNonEmpty = await p.evaluate(() => [...document.querySelectorAll('[data-qa="recap-hist-bin"]')].filter((e) => Number(e.getAttribute('data-count')) > 0).map((e) => [e.getAttribute('data-from'), e.getAttribute('data-count')]));
  log('ended', JSON.stringify(R.A.ended?.stats), R.A.recapTiming);
  await p.locator('[data-qa="perform-recap"]').screenshot({ path: `${OUT}/p6-recap.png` }).catch(() => undefined);

  // B. the steady one-key tapper (K, hats) at 92 BPM's 16th rate for 8 bars, from a fresh set (the stand-in card's REPLAY:
  // PERFORM again, in place — the phone-replay lane's seam)
  await p.locator('[data-dev="replay"]').click();
  await p.waitForTimeout(500);
  const playing = await p.evaluate(() => (window as Any).__FEL_STUDIO__.engine()?.running ?? false);
  if (!playing) await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  R.B = await inPage(p, `async () => {
    const P = window.__FEL_STUDIO__;
    const end = P.now() + 8 * 16 * (60 / 92 / 4); let n = 0;
    while (P.now() < end) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
      n++;
      const next = P.now() + 1 / 6;
      while (P.now() < next) await new Promise((r) => setTimeout(r, 2));
    }
    return { taps: n };
  }`);
  await p.getByRole('button', { name: 'END SET' }).click();
  await p.waitForTimeout(600);
  const eb = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.B.result = { accuracy: eb?.stats?.accuracy, grade: eb?.stats?.grade, won: eb?.won, extras: eb?.stats?.extras, hatsAcc: eb?.stats?.hatsAcc, kickAcc: eb?.stats?.kickAcc };
  log('steady one-key tapper', JSON.stringify(R.B));

  // the phone layout: 375 wide
  await p.setViewportSize({ width: 375, height: 812 });
  await p.locator('[data-dev="replay"]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-qa="perform-lanes"]').screenshot({ path: `${OUT}/p6-lanes-phone.png` }).catch(() => undefined);
  R.A.phonePadBoxes = await p.evaluate(() => [...document.querySelectorAll('[data-qa="perform-pad"]')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  R.A.phoneScrollX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await ctx.close();
}

const STUB = (mode: 'ok' | 'used') => `(() => {
  try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch {}
  window.__attemptPosts = [];
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/arena/music-attempt')) {
      const body = JSON.parse(init.body);
      window.__attemptPosts.push(body);
      if (body.phase === 'start' && '${mode}' === 'used') return new Response(JSON.stringify({ error: 'ONE_ATTEMPT', detail: 'Your one attempt at this duel has been used. A set left after its count-in scores 0.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, phase: body.phase }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(input, init);
  };
})()`;

async function arena(browser: Any): Promise<void> {
  const MATCH = 'cm_probe_p6';
  const beat = houseBeatFor(MATCH);
  R.C = { match: MATCH, beat: { kit: beat.kit, bpm: beat.bpm, swing: beat.swing, notes: beat.notes.length } };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(STUB('ok'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(String(e)));
  await p.goto(`${BASE}/dev/music?arena=${MATCH}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.locator('[data-qa="arena-set"]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(800);
  R.C.rulesBefore = await p.locator('[data-qa="arena-rules"]').textContent().catch(() => null);
  R.C.beatLine = await p.locator('[data-qa="arena-beat"]').textContent().catch(() => null);
  R.C.studioHidden = await p.evaluate(() => !document.querySelector('[data-qa="transport"]'));
  R.C.lanesBar0 = (await perf(p))?.lanes;
  await p.locator('[data-qa="arena-set"]').screenshot({ path: `${OUT}/p6-arena-rules.png` }).catch(() => undefined);
  await p.locator('[data-qa="arena-start"]').click();
  // bar 0's downbeat: the first step 0 the engine schedules after START (the count-in is one bar of clicks, not steps)
  const plan = beat.notes.map((n, k) => ({ rel: songStepTime(n.bar, n.step, 16, beat.bpm, beat.swing), lane: HOUSE_LANES.indexOf(n.lane), skip: k % 7 === 3, wrong: k % 11 === 5 }));
  R.C.play = await inPage(p, `async (pl) => {
    const P = window.__FEL_STUDIO__;
    const keys = ['h', 'j', 'k', 'l'];
    const startAt = P.now();
    let t0 = null;
    for (let i = 0; i < 4000 && t0 === null; i++) {
      const s = P.steps.find((x) => x.step === 0 && x.time > startAt);
      if (s) t0 = s.time;
      await new Promise((r) => setTimeout(r, 5));
    }
    if (t0 === null) return { err: 'no downbeat' };
    let taps = 0;
    for (const n of pl) {
      if (n.skip) continue;
      while (P.now() < t0 + n.rel) await new Promise((r) => setTimeout(r, 0));
      const lane = n.wrong ? (n.lane + 2) % 4 : n.lane;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[lane], bubbles: true, cancelable: true }));
      taps++;
      if (taps === 20) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));   // Space mid-set: no pause
    }
    for (let i = 0; i < 8000; i++) {
      if (window.__FEL_STUDIO__.ended) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    return { taps, downbeat: t0, runningAfterSpace: null };
  }`, plan);
  R.C.posts = await p.evaluate(() => (window as Any).__attemptPosts);
  R.C.ended = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.C.recapArena = await p.locator('[data-qa="recap-arena"]').textContent().catch(() => null);
  const finish = (R.C.posts as Any[]).find((x) => x.phase === 'finish');
  const taps: HouseTap[] = finish?.taps ?? [];
  const rerun = judgeHouseSet(beat, taps);
  R.C.check = {
    starts: (R.C.posts as Any[]).filter((x) => x.phase === 'start').length, finishTaps: taps.length,
    roomScore: R.C.ended?.score ?? null, serverRerunScore: rerun.score, equal: (R.C.ended?.score ?? null) === rerun.score,
    rerunAccuracy: rerun.accuracy, rerunGrade: rerun.grade, rerunWon: rerun.won,
  };
  log('arena', JSON.stringify(R.C.check));
  await p.locator('[data-qa="arena-set"]').screenshot({ path: `${OUT}/p6-arena-recap.png` }).catch(() => undefined);
  await ctx.close();
}

async function refused(browser: Any): Promise<void> {
  const MATCH = 'cm_probe_p6';
  R.C = R.C ?? {};
  // a second visit: the start is refused (409 ONE_ATTEMPT) — the room says so and never counts in
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx2.addInitScript(STUB('used'));
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => R.pageErrors.push(String(e)));
  await q.goto(`${BASE}/dev/music?arena=${MATCH}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await q.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await q.getByRole('button', { name: 'TAP TO START' }).click({ timeout: 120000 });
  await q.locator('[data-qa="arena-start"]').waitFor({ timeout: 60000 });
  await q.waitForTimeout(500);
  await q.locator('[data-qa="arena-start"]').click();
  await q.waitForTimeout(1500);
  R.C.refused = {
    phase: await q.locator('[data-qa="arena-set"]').getAttribute('data-phase'),
    line: await q.locator('[data-qa="arena-line"]').textContent().catch(() => null),
    running: await q.evaluate(() => (window as Any).__FEL_STUDIO__.engine()?.running ?? null),
    startButton: await q.locator('[data-qa="arena-start"]').count(),
  };
  log('refused', JSON.stringify(R.C.refused));
  await ctx2.close();
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    const only = process.env.ONLY ?? '';
    if (!only || only === 'free') await freePlay(browser);
    if (!only || only === 'arena') await arena(browser);
    if (!only || only === 'refused' || only === 'arena') await refused(browser);
  } finally {
    await browser.close();
    const file = `${OUT}/p6-lanes-proof${process.env.ONLY ? `-${process.env.ONLY}` : ''}.json`;
    fs.writeFileSync(file, JSON.stringify(R, null, 2));
    log('wrote', file, 'pageErrors', R.pageErrors.length);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
