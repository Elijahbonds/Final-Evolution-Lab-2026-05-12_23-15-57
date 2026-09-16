// _dunk-lab — one competent dunker, N attempts, and everything the contest said about each one.
//
// THE 10-PHASE DUNK PASS (owner, 2026-09-16) needs an instrument before it needs an opinion. The scorecard capture
// plays a verb a second and tells you whether presses were answered; it cannot tell you whether the WINDMILL you asked
// for fired at the rise, what the judges paid for it, or how much of the flight it spent. This drives the runway the
// way a player who knows the game drives it — hold RUN, call one named dunk on its cue beat, slam when the window
// opens — and records, per attempt:
//
//   called / armed / fired / refused   (the mode's own [DUNK-CUE] and [DUNK-TRICK] lines)
//   the launch                          ([DUNK-LAUNCH] charge, run speed, apex)
//   the slam                            (HUD slamTiming: ON TIME / N ms EARLY · EXECUTION %)
//   the card                            (HUD judgeReveal, five judges, and the total)
//   the body                            (clips on the rig through the flight, via __FEL_QA__ / __FEL_DEV__.anim)
//
// Every phase of the pass is measured with this, before and after, so a change is either visible in these numbers or it
// is decoration.
//
//   BASE=http://127.0.0.1:3096 ATTEMPTS=8 TRICK=all npx tsx scripts/probes/_dunk-lab.mts
//   TRICK=windmill  — call the same dunk every attempt (the A/B rig for one trick's shape)
//   SLAM_OFFSET_MS=-80  — slam early on purpose (the execution curve, measured rather than argued)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 8);
const TAG = process.env.TAG ?? 'lab';
const SLAM_OFFSET_MS = Number(process.env.SLAM_OFFSET_MS ?? 0);
const RUN_MS = Number(process.env.RUN_MS ?? 1500);          // how long RUN is held before the gather line
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunk`;
fs.mkdirSync(OUT, { recursive: true });

/** The air vocabulary, as a player physically throws it: hold a direction, tap a button. */
const AIR: { id: string; dir: string; btn: number }[] = [
  { id: 'windmill', dir: 'up', btn: 0 }, { id: 'tomahawk', dir: 'up', btn: 3 },
  { id: 'spin360', dir: 'right', btn: 1 }, { id: 'scorpion', dir: 'right', btn: 3 }, { id: 'cradle', dir: 'right', btn: 0 },
  { id: 'eastbay', dir: 'down', btn: 3 }, { id: 'betweenlegs', dir: 'down', btn: 1 }, { id: 'clutch', dir: 'down', btn: 0 },
  { id: 'lostfound', dir: 'left', btn: 1 }, { id: 'hideseek', dir: 'left', btn: 0 },
];
const want = process.env.TRICK && process.env.TRICK !== 'all' ? AIR.filter((t) => t.id === process.env.TRICK) : AIR;
if (!want.length) throw new Error(`no such trick: ${process.env.TRICK} (have ${AIR.map((t) => t.id).join(', ')})`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[DUNK|\[LOB|\[RIM|\[JUDGE/.test(t)) log.push(`${Date.now()} ${t.slice(0, 180)}`); });

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}

await page.goto(`${BASE}/play/dunk?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }

// the pad, plus a HUD tap that records every distinct readout the contest publishes
await page.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  window.__HUD = []; let last = '';
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  setInterval(() => {
    const h = window.__hudNow();
    const s = JSON.stringify([h.banner, h.slamTiming, h.breakdown, h.score, h.judgeReveal, h.slamPulse, h.hint]);
    if (s !== last) { last = s; window.__HUD.push({ t: Date.now(), banner: h.banner, slamTiming: h.slamTiming, breakdown: h.breakdown, score: h.score, cards: h.judgeReveal, pulse: !!h.slamPulse, hint: h.hint }); }
  }, 50);
})()`);
const start = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await start.count()) await start.first().click().catch(() => {});
await page.waitForTimeout(1200);

const press = async (i: number, ms = 70) => {
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
  await page.waitForTimeout(ms);
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
};
const DPAD: Record<string, number> = { up: 12, down: 13, left: 14, right: 15 };
const hold = async (i: number, on: boolean) => page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = ${on}; b.value = ${on ? 1 : 0}; window.__PAD.timestamp = Date.now(); })()`);
const trigger = async (v: number) => page.evaluate(`(() => { const b = window.__PAD.buttons[7]; b.pressed = ${v > 0.5}; b.value = ${v}; window.__PAD.timestamp = Date.now(); })()`);
const hud = async () => page.evaluate('window.__hudNow()') as Promise<Record<string, unknown>>;

interface Attempt { n: number; trick: string; launch?: string; cue: string[]; slamTiming?: string; breakdown?: string; cards?: unknown; total?: number; banners: string[]; note?: string }
const attempts: Attempt[] = [];
let logMark = 0;

for (let n = 0; n < ATTEMPTS; n++) {
  const trick = want[n % want.length];
  const mark = Date.now();
  const a: Attempt = { n: n + 1, trick: trick.id, cue: [], banners: [] };

  // RUN: the hold drives the runway; the launch fires at the gather line
  await trigger(1);
  const runT0 = Date.now();
  let launched = false;
  while (Date.now() - runT0 < RUN_MS + 2500) {
    const fresh = log.slice(logMark);
    if (fresh.some((l) => /\[DUNK-LAUNCH\]/.test(l))) { launched = true; break; }
    await page.waitForTimeout(30);
  }
  if (!launched) { await trigger(0); await page.waitForTimeout(400); }   // release: jump from here
  const airT0 = Date.now();
  await trigger(0);

  // THE CALL: the direction goes down first (a player holds it), the button follows — the mode arms an early press and
  // fires it on the trick's own cue beat, so this does not have to be frame-perfect.
  await hold(DPAD[trick.dir], true);
  await page.waitForTimeout(90);
  await press(trick.btn, 60);
  await page.waitForTimeout(60);
  await hold(DPAD[trick.dir], false);

  // THE SLAM: the HUD raises slamPulse when the window opens. Offset is deliberate, for the execution curve.
  let slammed = false;
  while (Date.now() - airT0 < 3500) {
    const h = await hud();
    if (h.slamPulse) {
      if (SLAM_OFFSET_MS > 0) await page.waitForTimeout(SLAM_OFFSET_MS);
      await press(0, 60);
      slammed = true;
      break;
    }
    await page.waitForTimeout(16);
  }
  if (!slammed) a.note = 'the slam window never opened';

  // the aftermath: replay, the judges' reveal, the total
  await page.waitForTimeout(9000);
  const rows = await page.evaluate('window.__HUD') as { t: number; banner?: string; slamTiming?: string; breakdown?: string; score?: number; cards?: unknown; hint?: string }[];
  const mine = rows.filter((r) => r.t >= mark);
  a.banners = [...new Set(mine.map((r) => r.banner).filter((b): b is string => !!b))];
  a.slamTiming = mine.map((r) => r.slamTiming).filter(Boolean).pop() ?? '';
  a.breakdown = mine.map((r) => r.breakdown).filter(Boolean).pop() ?? '';
  const cards = mine.map((r) => r.cards).filter((c) => Array.isArray(c) && (c as unknown[]).length) as unknown[][];
  a.cards = cards.pop() ?? null;
  a.total = mine.map((r) => r.score).filter((s): s is number => typeof s === 'number').pop();
  const fresh = log.slice(logMark); logMark = log.length;
  a.launch = fresh.find((l) => /\[DUNK-LAUNCH\]/.test(l))?.replace(/^\d+ /, '');
  a.cue = fresh.filter((l) => /\[DUNK-(CUE|TRICK|SLAM|WIN)\]/.test(l)).map((l) => l.replace(/^\d+ /, ''));
  attempts.push(a);
  console.log(`#${a.n} ${a.trick.padEnd(12)} ${(a.slamTiming || '—').padEnd(34)} ${(a.breakdown || '').slice(0, 52)}`);
  if (n < 3) await page.screenshot({ path: `${OUT}/${TAG}-attempt${a.n}-${a.trick}.png` });
}

const out = { tag: TAG, base: BASE, attempts, slamOffsetMs: SLAM_OFFSET_MS, log: log.slice(-200) };
fs.writeFileSync(`${OUT}/dunk-lab-${TAG}.json`, JSON.stringify(out, null, 1));
await browser.close();
const fired = attempts.filter((a) => a.cue.some((l) => /\[DUNK-TRICK\] air/.test(l))).length;
const onTime = attempts.filter((a) => /ON TIME/.test(a.slamTiming ?? '')).length;
console.log(`\n${attempts.length} attempts · ${fired} tricks fired · ${onTime} slams on time · ${OUT}/dunk-lab-${TAG}.json`);
