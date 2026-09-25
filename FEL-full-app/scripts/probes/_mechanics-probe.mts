// MECHANICS PROBE (MECHANICS PASS, 2026-09-15) — does what happens make sense?
//
// Owner decisions: the felt symptom is UNCLEAR CAUSE → EFFECT; the bar is ARCADE-READABLE (every press a named,
// perceivable action; AI by your rules); the method is MASHER vs INTENT vs IDLE per mode.
//
// Per mode, three fresh sessions on real time (no qaSpeed — timing windows are wall-clock in several modes):
//   IDLE        hands off. What the game does on its own: score it awards, whether it ends, what it says.
//   DELIBERATE  one live verb at a time (from modeVerbs, the same table the touch rig draws), ~1 press a second,
//               holds held. Grades CAUSE → EFFECT: the share of presses answered by something a player perceives
//               inside 450 ms (window.__FEL_QA__, lib/babylon/core/QaTrace.ts), per button, and unexplained scores.
//   MASHER      8 random presses a second with random sticks. Its score vs DELIBERATE's is the mash check.
// INTENT drivers are per-family and live beside this (INTENT=1 runs the ones that exist); this pass grades the two
// generic ones first, which is what finds a silent button or a score from nowhere in all 31 modes.
//
//   BASE=http://127.0.0.1:3096 MODES=all SEC=30 npx tsx scripts/probes/_mechanics-probe.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import { INTENT_DRIVERS, MASHER_DRIVERS } from './_intent-drivers.mts';
import { devPath, withQuery } from './_scorecard-routes.mts';
import { isDomRoom, startDomRoom, domPress, AUDIO_CLOCK_INIT, DOM_ROOMS } from './_dom-room.mts';
import type { ModeVerbConfig } from '../../lib/babylon/ui/modeVerbs';
// tsx loads the .ts table as CJS from an .mts probe, so named exports arrive on `default`
const MV: any = await import('../../lib/babylon/ui/modeVerbs');
const { MODE_VERBS, BOOST_MODES } = (MV.MODE_VERBS ? MV : MV.default) as { MODE_VERBS: Record<string, ModeVerbConfig>; BOOST_MODES: ReadonlySet<string> };

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/finish-release/mechanics`;
const SEC = Number(process.env.SEC ?? 30);
const IDLE_SEC = Number(process.env.IDLE_SEC ?? 15);
fs.mkdirSync(OUT, { recursive: true });

type Spec = { slug: string; path: string };
const ROUTES: Spec[] = [
  { slug: 'dunk', path: '/play/dunk' }, { slug: 'karate', path: '/play/karate' }, { slug: 'football', path: '/play/football' },
  { slug: 'skateboard', path: '/play/skateboard' }, { slug: 'snowboard_slalom', path: '/play/snowboard' }, { slug: 'surf', path: '/play/surf' },
  { slug: 'tennis', path: '/play/tennis' }, { slug: 'derby', path: '/play/baseball' }, { slug: 'penalty', path: '/play/soccer' },
  { slug: 'golf', path: '/play/golf' }, { slug: 'onevone', path: '/play/onevone' }, { slug: 'threevthree', path: '/play/threevthree' },
  { slug: 'carnival', path: '/play/carnival' }, { slug: 'karate_vs', path: '/play/karate-vs' }, { slug: 'mixedcombat', path: '/play/mixedcombat' },
  { slug: 'sprint', path: '/play/sprint' }, { slug: 'showdown', path: '/play/showdown' }, { slug: 'duel', path: '/play/duel' },
  { slug: 'volleyball', path: '/play/volleyball' }, { slug: 'dance', path: '/play/dance' }, { slug: 'who_scene_it', path: '/play/who-scene-it' },
  { slug: 'freerun', path: '/play/freerun' }, { slug: 'threepoint', path: '/play/threepoint' }, { slug: 'bigair', path: '/play/big-air' },
  { slug: 'aeroaces', path: '/play/aero-aces' }, { slug: 'velocitykart', path: '/play/velocity-kart' }, { slug: 'brainbrawl', path: '/play/brain-brawl' },
  // MUSIC-SUITE P1 (2026-09-25): the Groove Academy's PERFORM — a DOM room (_dom-room.mts), not a Babylon mode
  { slug: 'music', path: '/play/music?stage=perform' },
];
const pick = (process.env.MODES ?? 'all').split(',');
// DEV=1 (net/precision pass, 2026-09-22): the /play routes redirect to /login for a fresh browser now, so the probe can run on
// the dev harness route instead — the same mode, the same #fel-ready and __FEL_QA__ (the route key is the registry key; the
// derby's is `derby`, the shootout's `penalty`)
const DEV = process.env.DEV === '1';
const MODES0 = pick[0] === 'all' ? ROUTES : ROUTES.filter((r) => pick.includes(r.slug));
// MUSIC-SUITE P1: the Academy's dev twin is /dev/music, not /dev/mode/<key> (_scorecard-routes DEV_PATHS)
const MODES = DEV ? MODES0.map((r) => ({ ...r, path: devPath(r.slug) })) : MODES0;
// HEADLESS=1 (MUSIC-SUITE P1): a lane session on a shared Mac runs the probe headless, with the angle/metal GL the Babylon
// modes need there. Unset keeps the headed window every earlier rc was measured in.
const HEADLESS = process.env.HEADLESS === '1';
// GENERIC_MASH=1: the twelve-button random masher even where the mode has its own verb masher (MASHER_DRIVERS)
const GENERIC_MASH = process.env.GENERIC_MASH === '1';

// standard-mapping pad indices
const IDX: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, LT: 6, RT: 7, LS: 10, RS: 11, DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15 };
type Verb = { label: string; idx: number; holdMs: number };
function verbsFor(slug: string): Verb[] {
  const cfg = MODE_VERBS[slug] ?? MODE_VERBS.default;
  const out: Verb[] = [];
  for (const b of cfg.buttons) {
    const e = b.emit; if (!e || !b.label) continue;
    if (e.t === 'button') out.push({ label: b.label, idx: IDX[e.btn] ?? 0, holdMs: b.hold ? 700 : 90 });
    else if (e.t === 'trigger') out.push({ label: b.label, idx: e.side === 'R' ? IDX.RT : IDX.LT, holdMs: 700 });
  }
  if (slug === 'bigair' || slug === 'sprint') { out.push({ label: 'STRIDE L', idx: IDX.DPAD_LEFT, holdMs: 90 }, { label: 'STRIDE R', idx: IDX.DPAD_RIGHT, holdMs: 90 }); }
  if (BOOST_MODES.has(slug)) out.push({ label: 'BOOST', idx: IDX.R1, holdMs: 800 });
  return out;
}

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: HEADLESS, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required', ...(HEADLESS ? ['--use-gl=angle', '--enable-webgl'] : []), '--use-angle=metal', '--ignore-gpu-blocklist'] });
const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await bctx.addInitScript('globalThis.__name = (f) => f;')
// THE PROBE DECLARES ITSELF. `?agent=1` is remembered in sessionStorage, which is per TAB — and every route here opens
// its own tab, so a route that strips the query (/try lands clean, the carnival rewrites to ?carnival=1) mounted
// uninstrumented and scored 'no presses at all'. Setting the same flag the URL would set makes every tab a QA session.
await bctx.addInitScript("try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}");;
// PAGE_VARS='{"__PERFORM_TAP":"hits"}' (MUSIC-SUITE P1): the page switches the drivers already read (window.__LANE,
// __START, __PLAIN, __TOW, __PERFORM_TAP, __DANCE_OFF_MS …), set before the page's code runs
if (process.env.PAGE_VARS) await bctx.addInitScript(`Object.assign(window, ${JSON.stringify(JSON.parse(process.env.PAGE_VARS))});`);
await bctx.addInitScript(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  (window as any).__PAD = pad;
  (navigator as any).getGamepads = () => [pad, null, null, null];
});
// DEV=1 routes need no session (and a lane's dev server has its database offline, so the login would only wait 30 s to
// fail); LOGIN=1 forces it
if (!DEV || process.env.LOGIN === '1') {
  const p = await bctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await p.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await p.click('button[type="submit"]');
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && /\/login/.test(p.url())) await p.waitForTimeout(300);
  }
  await p.close();
}

const pad = (p: Page, js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = Date.now(); })()`).catch(() => {});
const press = async (p: Page, idx: number, ms: number) => {
  await pad(p, `p.buttons[${idx}].pressed = true; p.buttons[${idx}].value = 1`);
  await p.waitForTimeout(ms);
  await pad(p, `p.buttons[${idx}].pressed = false; p.buttons[${idx}].value = 0`);
};
const qa = (p: Page, js: string) => p.evaluate(`(() => { const q = window.__FEL_QA__; if (!q) return null; return ${js}; })()`).catch(() => null);
const scoreOf = (hud: Record<string, string> | null): number | null => {
  if (!hud) return null;
  for (const k of ['score', 'points', 'pts', 'banked']) if (hud[k] != null && hud[k] !== '' && Number.isFinite(Number(hud[k]))) return Number(hud[k]);
  return null;
};

async function session(m: Spec, driver: 'idle' | 'deliberate' | 'masher' | 'intent') {
  const p = await bctx.newPage();
  const errors: string[] = [];
  p.on('console', (msg) => { if (msg.type() === 'error' && !/status of 40[14]|favicon/.test(msg.text())) errors.push(msg.text().slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + String(e.message).slice(0, 160)));
  const row: Record<string, unknown> = { slug: m.slug, driver };
  const dom = isDomRoom(m.slug);
  // DEV=1: the /dev/mode runner logs the run's full result (outcome, score AND the mode's stats — the dance's
  // PERFECT/GREAT/GOOD/MISS counts) as '[dev] result', where __FEL_QA__.result() keeps only outcome and score
  p.on('console', (msg) => { if (msg.text().startsWith('[dev] result')) void msg.args()[1]?.jsonValue().then((v) => { row.devResult = v; }).catch(() => {}); });
  try {
    // a DOM room's drivers read its audio clock (_dom-room AUDIO_CLOCK_INIT); a Babylon page never gets the wrapper
    if (dom) await p.addInitScript({ content: AUDIO_CLOCK_INIT });
    await p.goto(`${BASE}${withQuery(m.path, 'agent=1')}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (dom) {
      // MUSIC-SUITE P1 (2026-09-25): no #fel-ready in a React room — its start ritual instead (READY, then PLAY), and the
      // __FEL_QA__ shim the rest of this session reads exactly as it reads the harness's
      const r = await startDomRoom(p, m.slug, 120000);
      row.loadMs = r.loadMs;
      if (!r.ok) { row.note = `not ready (${r.note})`; return row; }
    } else {
      { const lobby = p.getByRole('button', { name: /START THE NIGHT|START NIGHT|LET'S GO/i }); await p.waitForTimeout(1500); if (await lobby.count()) await lobby.first().click().catch(() => {}); }
      const t0 = Date.now(); let st = '';
      while (Date.now() - t0 < 120000) { st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded' || st === 'failed') break; await p.waitForTimeout(300); }
      if (st !== 'loaded') { row.note = `not ready (${st})`; return row; }
      await p.waitForTimeout(600);
      const start = p.getByRole('button', { name: /^(TAP TO START|START|READY|PLAY)$/i });
      if (await start.count()) await start.first().click().catch(() => {});
    }
    await p.waitForTimeout(400);
    const from = (await qa(p, 'q.now()')) as number ?? 0;
    const tPlay = Date.now();
    const dur = driver === 'idle' ? IDLE_SEC : SEC;
    const verbs = verbsFor(m.slug);
    let k = 0;
    while ((Date.now() - tPlay) / 1000 < dur) {
      const state = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '');
      if (state === 'ended') break;
      if (driver === 'idle') { await p.waitForTimeout(500); continue; }
      if (driver === 'intent') { if (k++ === 0) await p.evaluate(INTENT_DRIVERS[m.slug]); await p.waitForTimeout(500); continue; }
      // the mode's own verb masher (MASHER_DRIVERS), installed once in the page like an intent driver
      if (driver === 'masher' && MASHER_DRIVERS[m.slug] && !GENERIC_MASH) { if (k++ === 0) await p.evaluate(MASHER_DRIVERS[m.slug]); await p.waitForTimeout(500); continue; }
      if (dom) {
        // a DOM room's deliberate driver: one verb a second, in turn; its generic masher has no pad to press, so it
        // clicks the verbs at random ~8 a second (a DOM room with a MASHER_DRIVERS entry never gets here)
        const verbs = DOM_ROOMS[m.slug].verbs;
        if (driver === 'deliberate') { await domPress(p, verbs[k++ % verbs.length]); await p.waitForTimeout(1000); }
        else { await domPress(p, verbs[Math.floor(Math.random() * verbs.length)]); await p.waitForTimeout(80); }
        continue;
      }
      if (driver === 'deliberate') {
        // move with purpose while acting: forward on the left stick with a slow weave, so a movement mode is being
        // PLAYED (a deliberate driver standing still would lose to a masher's random stick for the wrong reason)
        await pad(p, `p.axes[0] = ${(0.45 * Math.sin(k * 0.7)).toFixed(2)}; p.axes[1] = -0.75`);
        const v = verbs[k++ % Math.max(1, verbs.length)];
        if (v) await press(p, v.idx, v.holdMs);
        await p.waitForTimeout(1000);
      } else {
        const idx = [0, 1, 2, 3, 0, 1, 7, 5, 14, 15, 10, 11][Math.floor(Math.random() * 12)];   // racing pass: the stick clicks are buttons too
        await pad(p, `p.axes[0] = ${(Math.random() * 2 - 1).toFixed(2)}; p.axes[1] = ${(Math.random() * 2 - 1).toFixed(2)}`);
        await press(p, idx, 40);
        await p.waitForTimeout(80);
      }
    }
    await p.waitForTimeout(700);
    const sum = await qa(p, `q.summary(450, ${from})`) as any;
    const hud = await qa(p, 'q.hud()') as Record<string, string> | null;
    const result = await qa(p, 'q.result()');
    row.sec = Math.round((Date.now() - tPlay) / 1000);
    row.ended = (await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '')) === 'ended' || !!result;
    row.result = result; row.score = (result as any)?.score ?? scoreOf(hud);
    row.banner = hud?.banner ?? null;
    // MUSIC-SUITE P1: what the page drivers did (a driver that silently pressed nothing would read as an honest 0)
    const drv = await p.evaluate(() => { const w = window as any; return { variant: w.__INTENT_VARIANT ?? null, planned: w.__DANCE_PLANNED ?? null, taps: w.__MUSIC_TAPS ?? null, mashPresses: w.__MASH_PRESSES ?? null, tally: w.__FEL_QA__?.tally?.() ?? null }; }).catch(() => null);
    if (drv && Object.values(drv).some((v) => v != null)) row.driverStats = drv;
    if (dom) row.domRoom = true;
    if (driver === 'masher') row.masher = MASHER_DRIVERS[m.slug] && !GENERIC_MASH ? 'verb' : 'generic';
    if (sum) {
      row.presses = sum.presses; row.silentPct = sum.silentPct; row.scores = sum.scores; row.unexplainedScores = sum.unexplainedScores; row.responses = sum.responses;
      row.byBtn = Object.fromEntries(Object.entries(sum.byBtn as Record<string, any>).map(([b, r]) => [b, { presses: r.presses, silent: r.presses - r.answered, top: Object.entries(r.answers).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2).map(([t, n]) => `${t}×${n}`) }]));
    } else row.note = 'no __FEL_QA__ (build without QaTrace?)';
    if (driver === 'deliberate') await p.screenshot({ path: `${OUT}/${m.slug}-deliberate.png` });
  } catch (e) { row.note = 'exception ' + String((e as Error).message).slice(0, 160); }
  finally { row.errors = [...new Set(errors)].slice(0, 4); await p.close(); }
  return row;
}

/**
 * A session that hangs takes the WHOLE RUN with it (2026-09-15): the rc19 pass stopped dead after seven modes with a
 * live node process and no browser, and the twenty-two modes behind it were never measured. Each session gets its own
 * clock — generous, since a cold mode load on a production build can take a minute — and a mode that overruns is
 * recorded as a miss and the run carries on.
 */
const SESSION_BUDGET_MS = Number(process.env.SESSION_BUDGET_MS ?? 180000);
async function timedSession(m: typeof MODES[number], driver: Parameters<typeof session>[1]): Promise<Record<string, unknown>> {
  let timer: NodeJS.Timeout | undefined;
  const bail = new Promise<Record<string, unknown>>((res) => {
    timer = setTimeout(() => res({ slug: m.slug, driver, note: `timed out after ${SESSION_BUDGET_MS / 1000} s`, score: null }), SESSION_BUDGET_MS);
  });
  try { return await Promise.race([session(m, driver), bail]); }
  finally { if (timer) clearTimeout(timer); }
}

// ONLY=intent,masher (MUSIC-SUITE P1): run just those drivers — a lane tuning one driver need not sit through the
// other sessions. A skipped driver is written as a row that says so (score null), never as a zero.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const run = (m: typeof MODES[number], d: Parameters<typeof session>[1]) =>
  !ONLY || ONLY.has(d) ? timedSession(m, d) : Promise.resolve({ slug: m.slug, driver: d, note: 'skipped (ONLY)', score: null } as Record<string, unknown>);
const rows: Record<string, unknown>[] = [];
for (const m of MODES) {
  const idle = await run(m, 'idle');
  const del = await run(m, 'deliberate');
  const mash = await run(m, 'masher');
  const intent = (process.env.INTENT === '1' || ONLY?.has('intent')) && INTENT_DRIVERS[m.slug] ? await run(m, 'intent') : null;
  const verdict: string[] = [];
  if (typeof del.silentPct === 'number' && del.silentPct > 25) verdict.push(`SILENT ${del.silentPct}% of deliberate presses`);
  const silentBtns = Object.entries((del.byBtn ?? {}) as Record<string, any>).filter(([, r]) => r.presses >= 2 && r.silent / r.presses > 0.5).map(([b]) => b);
  if (silentBtns.length) verdict.push(`silent buttons: ${silentBtns.join(' ')}`);
  if (Number(del.unexplainedScores) > 0 || Number(mash.unexplainedScores) > 0) verdict.push(`unexplained scores: ${del.unexplainedScores}/${mash.unexplainedScores}`);
  if (typeof idle.score === 'number' && idle.score > 0) verdict.push(`IDLE scores ${idle.score}`);
  const best = Math.max(Number(del.score) || 0, Number(intent?.score) || 0);
  if (typeof mash.score === 'number' && mash.score > best * 1.5 && mash.score > 0) verdict.push(`MASH ${mash.score} beats ${intent ? 'intent ' + intent.score + ' / ' : ''}deliberate ${del.score}`);
  const row = { slug: m.slug, verdict: verdict.length ? verdict : ['ok'], idle, deliberate: del, masher: mash, ...(intent ? { intent } : {}) };
  rows.push(row);
  console.log(JSON.stringify({ slug: m.slug, verdict: row.verdict, idleScore: idle.score, delScore: del.score, mashScore: mash.score, intentScore: intent?.score, silent: del.silentPct, byBtn: del.byBtn }));
  fs.writeFileSync(`${OUT}/mechanics${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify(rows, null, 1));
}
console.log('\nSUMMARY');
for (const r of rows as any[]) console.log(`${r.slug.padEnd(16)} ${r.verdict.join(' · ')}`);
await browser.close();
