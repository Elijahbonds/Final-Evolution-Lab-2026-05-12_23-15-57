// MUSIC-SUITE P6 FIX PASS (2026-09-26) — the room's side of the review's findings, checked in a real browser on the lane's
// dev server (/dev/music: the real StudioMode; the attempt endpoint stubbed in the page — the lane's DB is offline).
//   A. THE ARENA ON A BAD CONNECTION: Space (not the button) begins the attempt; the first START post fails (network error)
//      and the room retries it with the SAME attemptId (a lost reply is not a lost attempt); the set plays; the FINISH post
//      fails (503 on every retry) → the room says UNSENT, calls no card, keeps the taps in sessionStorage and offers SEND
//      AGAIN; the network comes back, SEND AGAIN → the card, with the score the server's rerun makes of the posted taps.
//   B. A RELOAD AFTER START (409 ONE_ATTEMPT {finished: false}), nothing kept: the room hands its card a 0 NOW (#29) —
//      it used to sit on 'refused' with no card, the duel waiting for its deadline.
//   C. A RELOAD AFTER A SET WHOSE FINISH NEVER LANDED (409 ONE_ATTEMPT {finished: false}, the taps kept): the room posts
//      the kept taps, then hands its card their score.
//   D. FREE PLAY on a KICKLESS song (hats on the 8ths, snare on 2 and 4): the band starts on the song's own foundation (the
//      snare lane — the lowest with notes; it started in silence), PAUSE right after a hit costs no MISS and keeps the combo.
//   E. PAIR A PHONE is offered in the Arena panel and in PERFORM (no phone could pair in an Arena set).
// Usage: OUT=<dir> /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p6-fixpass.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import * as houseNs from '../../lib/babylon/music/houseBeat.ts';
import * as stepNs from '../../lib/babylon/music/stepTime.ts';
import type { HouseTap } from '../../lib/babylon/music/houseBeat.ts';
const house = ((houseNs as Any).default ?? houseNs) as typeof houseNs;
const { houseBeatFor, judgeHouseSet, HOUSE_LANES, houseTap } = house;
const { songStepTime } = ((stepNs as Any).default ?? stepNs) as typeof stepNs;

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p6/fixpass';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p6fix +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), pageErrors: [] as string[], checks: {} as Record<string, boolean> };
const check = (name: string, ok: boolean) => { R.checks[name] = ok; log(ok ? 'PASS' : 'FAIL', name); };
const inPage = (p: Page, fn: string, arg: unknown = null): Promise<Any> => p.evaluate(`(${fn})(${JSON.stringify(arg)})`);

/**
 * The stubbed endpoint. `plan`: per phase, the answers in order (the last repeats): 'throw' (a network error), a status
 * number with a body, or 'ok'. window.__finishOk flips the finish to 200 (the network is back).
 */
const STUB = (plan: Record<string, Any[]>, kept?: { match: string; taps: HouseTap[] }) => `(() => {
  try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch {}
  ${kept ? `try { sessionStorage.setItem('fel.arena.finish.${kept.match}', ${JSON.stringify(JSON.stringify(kept.taps))}); } catch {}` : ''}
  window.__attemptPosts = [];
  window.__finishOk = false;
  const plan = ${JSON.stringify(plan)};
  const seen = { start: 0, finish: 0 };
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/api/arena/music-attempt')) return orig(input, init);
    const body = JSON.parse(init.body);
    window.__attemptPosts.push(body);
    const list = plan[body.phase] || ['ok'];
    let a = list[Math.min(seen[body.phase]++, list.length - 1)];
    if (body.phase === 'finish' && window.__finishOk) a = 'ok';
    if (a === 'throw') throw new TypeError('Failed to fetch');
    if (a === 'ok') return new Response(JSON.stringify({ ok: true, phase: body.phase }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(a[1]), { status: a[0], headers: { 'Content-Type': 'application/json' } });
  };
})()`;

async function openArena(browser: Any, match: string, stub: string): Promise<{ ctx: Any; p: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(stub);
  const p = await ctx.newPage();
  p.on('pageerror', (e: Error) => R.pageErrors.push(String(e)));
  await p.goto(`${BASE}/dev/music?arena=${match}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.locator('[data-qa="arena-start"]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(600);
  return { ctx, p };
}
const phase = (p: Page) => p.locator('[data-qa="arena-set"]').getAttribute('data-phase');
const posts = (p: Page): Promise<Any[]> => p.evaluate(() => (window as Any).__attemptPosts);
const ended = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);

async function badConnection(browser: Any): Promise<void> {
  const MATCH = 'cm_probe_p6fix_a';
  const beat = houseBeatFor(MATCH);
  const { ctx, p } = await openArena(browser, MATCH, STUB({ start: ['throw', 'ok'], finish: [[503, { error: 'internal' }]] }));
  R.A = {};
  check('A: PAIR A PHONE is offered in the Arena panel before START', (await p.locator('[data-qa="arena-pair-phone"]').count()) === 1);
  // Space begins the attempt (it said "there is no pause")
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })));
  const plan = beat.notes.map((n, k) => ({ rel: songStepTime(n.bar, n.step, 16, beat.bpm, beat.swing), lane: HOUSE_LANES.indexOf(n.lane), skip: k % 7 === 3 }));
  R.A.play = await inPage(p, `async (pl) => {
    const P = window.__FEL_STUDIO__;
    const keys = ['h', 'j', 'k', 'l'];
    const startAt = P.now();
    let t0 = null;
    for (let i = 0; i < 6000 && t0 === null; i++) {
      const s = P.steps.find((x) => x.step === 0 && x.time > startAt);
      if (s) t0 = s.time;
      await new Promise((r) => setTimeout(r, 5));
    }
    if (t0 === null) return { err: 'no downbeat' };
    let taps = 0;
    for (const n of pl) {
      if (n.skip) continue;
      while (P.now() < t0 + n.rel) await new Promise((r) => setTimeout(r, 0));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[n.lane], bubbles: true, cancelable: true }));
      taps++;
    }
    for (let i = 0; i < 1500; i++) {
      const ph = document.querySelector('[data-qa="arena-set"]')?.getAttribute('data-phase');
      if (ph === 'unsent' || ph === 'done' || ph === 'refused') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    return { taps };
  }`, plan);
  const ps = await posts(p);
  const starts = ps.filter((x) => x.phase === 'start');
  R.A.starts = starts;
  check('A: the failed START was retried with the SAME attemptId (2 posts, 1 id)', starts.length === 2 && starts[0].attemptId && starts[0].attemptId === starts[1].attemptId);
  R.A.phaseAfterSet = await phase(p);
  R.A.line = await p.locator('[data-qa="arena-line"]').textContent().catch(() => null);
  R.A.endedBeforeSend = await ended(p);
  const kept = await p.evaluate((m) => sessionStorage.getItem(`fel.arena.finish.${m}`), MATCH);
  check('A: a finish that never landed → UNSENT, no card, the taps kept on the device, SEND AGAIN offered',
    R.A.phaseAfterSet === 'unsent' && R.A.endedBeforeSend === null && !!kept && (await p.locator('[data-qa="arena-send-again"]').count()) === 1);
  check('A: the finish was retried (3 tries of the same list)', ps.filter((x) => x.phase === 'finish').length === 3);
  await p.locator('[data-qa="arena-set"]').screenshot({ path: `${OUT}/p6fix-unsent.png` }).catch(() => undefined);
  await p.evaluate(() => { (window as Any).__finishOk = true; });
  await p.locator('[data-qa="arena-send-again"]').click();
  await p.waitForFunction(() => document.querySelector('[data-qa="arena-set"]')?.getAttribute('data-phase') === 'done', undefined, { timeout: 30000 }).catch(() => undefined);
  const all = await posts(p);
  const finish = all.filter((x) => x.phase === 'finish').at(-1);
  const rerun = judgeHouseSet(beat, finish?.taps ?? []);
  const e = await ended(p);
  R.A.after = { phase: await phase(p), score: e?.score ?? null, rerun: rerun.score, taps: finish?.taps?.length ?? 0 };
  check('A: SEND AGAIN → the card, with exactly the score the server reruns from the posted taps', R.A.after.phase === 'done' && e?.score === rerun.score && rerun.score > 0);
  check('A: the kept taps are cleared once sent', (await p.evaluate((m) => sessionStorage.getItem(`fel.arena.finish.${m}`), MATCH)) === null);
  await ctx.close();
}

async function reloadUsed(browser: Any): Promise<void> {
  const MATCH = 'cm_probe_p6fix_b';
  const { ctx, p } = await openArena(browser, MATCH, STUB({ start: [[409, { error: 'ONE_ATTEMPT', finished: false, score: 0, detail: 'used' }]] }));
  await p.locator('[data-qa="arena-start"]').click();
  await p.waitForFunction(() => (window as Any).__FEL_STUDIO__.ended !== null, undefined, { timeout: 20000 }).catch(() => undefined);
  const e = await ended(p);
  R.B = { phase: await phase(p), score: e?.score ?? null, headline: e?.headline ?? null, running: await p.evaluate(() => (window as Any).__FEL_STUDIO__.engine()?.running ?? null) };
  check('B: a reload after START hands the card a 0 NOW (#29) — it used to sit refused with no card', R.B.phase === 'done' && R.B.score === 0 && R.B.running === false);
  await ctx.close();
}

async function reloadKept(browser: Any): Promise<void> {
  const MATCH = 'cm_probe_p6fix_c';
  const beat = houseBeatFor(MATCH);
  const taps = beat.notes.filter((_, i) => i % 3 !== 0).map((n) => houseTap(n.lane, n.t + 0.01));
  const want = judgeHouseSet(beat, taps).score;
  const { ctx, p } = await openArena(browser, MATCH, STUB({ start: [[409, { error: 'ONE_ATTEMPT', finished: false, score: 0 }]], finish: ['ok'] }, { match: MATCH, taps }));
  await p.locator('[data-qa="arena-start"]').click();
  await p.waitForFunction(() => (window as Any).__FEL_STUDIO__.ended !== null, undefined, { timeout: 20000 }).catch(() => undefined);
  const e = await ended(p);
  const fin = (await posts(p)).find((x) => x.phase === 'finish');
  R.C = { phase: await phase(p), score: e?.score ?? null, want, postedKept: JSON.stringify(fin?.taps) === JSON.stringify(taps) };
  check('C: a set whose finish never landed is sent from the device on the next visit, and its score goes in', R.C.phase === 'done' && R.C.postedKept && R.C.score === want);
  await ctx.close();
}

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16') && d.getAttribute('data-qa') !== 'perform-lane')`;
async function freePlay(browser: Any): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(`(() => { try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {} })()`);
  const p = await ctx.newPage();
  p.on('pageerror', (e: Error) => R.pageErrors.push(String(e)));
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(400);
  const clear = p.locator('[data-qa="clear"]');
  if (await clear.isEnabled().catch(() => false)) { await clear.click(); await p.locator('[data-qa="clear-yes"]').click(); }
  await inPage(p, `() => {
    for (const [l, v] of [['BPM', 92], ['SWING', 0]]) {
      const inp = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').startsWith(l)).querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(v));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }`);
  // a KICKLESS song: snare on 2 and 4 (row 1), hats on the 8ths (row 2)
  const cell = (row: number, step: number) => p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
  for (const s of [4, 12]) await cell(1, s);
  for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) await cell(2, s);
  await p.waitForTimeout(300);
  // re-enter PERFORM so the set is built on this song (the splash put us in PERFORM on the empty grid)
  R.D = { hint: await p.locator('[data-qa="perform-hint"]').textContent().catch(() => null) };
  check('E: PAIR A PHONE is offered in PERFORM', (await p.locator('[data-qa="perform-pair-phone"]').count()) === 1);
  await p.locator('[data-qa="perform-play"]').click();
  await p.waitForTimeout(250);
  R.D.bandAtPlay = (await p.evaluate(() => (window as Any).__FEL_PERFORM__?.band ?? null));
  check('D: a kickless song starts on its own foundation at PLAY (the snare lane), not in silence on the kick', JSON.stringify(R.D.bandAtPlay) === '[1]');
  // play the hats and snares on time for ~2 bars, then PAUSE right after a hit
  R.D.play = await inPage(p, `async () => {
    const P = window.__FEL_STUDIO__;
    const end = P.now() + 2 * 16 * (60 / 92 / 4); const done = new Set(); let taps = 0;
    while (P.now() < end) {
      const now = P.now();
      const lanes = window.__FEL_PERFORM__?.lanes ?? [[], [], [], []];
      for (const s of P.steps) {
        const k = s.time.toFixed(5);
        if (done.has(k) || s.time > now) continue;
        done.add(k);
        if (now - s.time > 0.04) continue;
        for (const [l, key] of [[1, 'j'], [2, 'k']]) if (lanes[l].includes(s.step)) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); taps++; }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    // the next hat, hit, then PAUSE at once (the notes after it are already offered — they used to come back as MISSes)
    for (let i = 0; i < 400; i++) {
      const s = P.steps.find((x) => x.step % 2 === 0 && x.time > P.now() && x.time - P.now() < 0.06);
      if (s) {
        while (P.now() < s.time) await new Promise((r) => setTimeout(r, 0));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 30));
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    const before = document.querySelector('[data-qa="perform-status"]')?.textContent ?? '';
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1500));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    const after = document.querySelector('[data-qa="perform-status"]')?.textContent ?? '';
    return { taps, before, after };
  }`);
  const combo = (t: string) => Number(/combo x(\d+)/.exec(t ?? '')?.[1] ?? NaN);
  check('D: PAUSE right after a hit costs no MISS — the combo is the same on resume', combo(R.D.play.before) > 0 && combo(R.D.play.after) === combo(R.D.play.before) && !/MISS/.test(R.D.play.after));
  await ctx.close();
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    const only = process.env.ONLY ?? '';
    if (!only || only === 'free') await freePlay(browser);
    if (!only || only === 'used') await reloadUsed(browser);
    if (!only || only === 'kept') await reloadKept(browser);
    if (!only || only === 'arena') await badConnection(browser);
  } finally {
    await browser.close();
    const file = `${OUT}/p6fix-proof${process.env.ONLY ? `-${process.env.ONLY}` : ''}.json`;
    fs.writeFileSync(file, JSON.stringify(R, null, 2));
    const failed = Object.entries(R.checks).filter(([, v]) => !v).map(([k]) => k);
    log('wrote', file, 'pageErrors', R.pageErrors.length, 'failed', failed.length ? failed : 'none');
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
