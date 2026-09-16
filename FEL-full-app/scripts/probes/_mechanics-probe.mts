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
import { INTENT_DRIVERS } from './_intent-drivers.mts';
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
];
const pick = (process.env.MODES ?? 'all').split(',');
const MODES = pick[0] === 'all' ? ROUTES : ROUTES.filter((r) => pick.includes(r.slug));

// standard-mapping pad indices
const IDX: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, LT: 6, RT: 7, DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15 };
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

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await bctx.addInitScript('globalThis.__name = (f) => f;')
// THE PROBE DECLARES ITSELF. `?agent=1` is remembered in sessionStorage, which is per TAB — and every route here opens
// its own tab, so a route that strips the query (/try lands clean, the carnival rewrites to ?carnival=1) mounted
// uninstrumented and scored 'no presses at all'. Setting the same flag the URL would set makes every tab a QA session.
await bctx.addInitScript("try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}");;
await bctx.addInitScript(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  (window as any).__PAD = pad;
  (navigator as any).getGamepads = () => [pad, null, null, null];
});
{
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
  try {
    await p.goto(`${BASE}${m.path}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    { const lobby = p.getByRole('button', { name: /START THE NIGHT|START NIGHT|LET'S GO/i }); await p.waitForTimeout(1500); if (await lobby.count()) await lobby.first().click().catch(() => {}); }
    const t0 = Date.now(); let st = '';
    while (Date.now() - t0 < 120000) { st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded' || st === 'failed') break; await p.waitForTimeout(300); }
    if (st !== 'loaded') { row.note = `not ready (${st})`; return row; }
    await p.waitForTimeout(600);
    const start = p.getByRole('button', { name: /^(TAP TO START|START|READY|PLAY)$/i });
    if (await start.count()) await start.first().click().catch(() => {});
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
      if (driver === 'deliberate') {
        // move with purpose while acting: forward on the left stick with a slow weave, so a movement mode is being
        // PLAYED (a deliberate driver standing still would lose to a masher's random stick for the wrong reason)
        await pad(p, `p.axes[0] = ${(0.45 * Math.sin(k * 0.7)).toFixed(2)}; p.axes[1] = -0.75`);
        const v = verbs[k++ % Math.max(1, verbs.length)];
        if (v) await press(p, v.idx, v.holdMs);
        await p.waitForTimeout(1000);
      } else {
        const idx = [0, 1, 2, 3, 0, 1, 7, 5, 14, 15][Math.floor(Math.random() * 10)];
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
    if (sum) {
      row.presses = sum.presses; row.silentPct = sum.silentPct; row.scores = sum.scores; row.unexplainedScores = sum.unexplainedScores; row.responses = sum.responses;
      row.byBtn = Object.fromEntries(Object.entries(sum.byBtn as Record<string, any>).map(([b, r]) => [b, { presses: r.presses, silent: r.presses - r.answered, top: Object.entries(r.answers).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2).map(([t, n]) => `${t}×${n}`) }]));
    } else row.note = 'no __FEL_QA__ (build without QaTrace?)';
    if (driver === 'deliberate') await p.screenshot({ path: `${OUT}/${m.slug}-deliberate.png` });
  } catch (e) { row.note = 'exception ' + String((e as Error).message).slice(0, 160); }
  finally { row.errors = [...new Set(errors)].slice(0, 4); await p.close(); }
  return row;
}

const rows: Record<string, unknown>[] = [];
for (const m of MODES) {
  const idle = await session(m, 'idle');
  const del = await session(m, 'deliberate');
  const mash = await session(m, 'masher');
  const intent = process.env.INTENT === '1' && INTENT_DRIVERS[m.slug] ? await session(m, 'intent') : null;
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
