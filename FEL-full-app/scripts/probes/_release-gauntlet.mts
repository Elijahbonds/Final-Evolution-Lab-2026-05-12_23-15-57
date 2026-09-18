// RELEASE GAUNTLET (FINISH-RELEASE, 2026-09-14) — the owner's friend-test bar, every enabled mode on its SHIPPING route
// against a production build: it loads, it starts, it PLAYS TO ITS END, and nothing errors on the way.
//
// Per route: sign in once → open → wait for READY → wake → drive a mixed input script (fake pad sticks + face buttons +
// triggers, keyboard) until the harness publishes #fel-ready[data-state=ended] or an end/card screen shows, or the cap.
// Records: ready ms, playing reached, end reached + how (marker / card text), seconds to end, fps (agent metrics),
// console errors + page errors (401 / favicon filtered), frames at 4 s and at the end.
//
//   BASE=http://127.0.0.1:3096 OUT=… MODES=all CAP=110 npx tsx scripts/probes/_release-gauntlet.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/finish-release/gauntlet`;
const CAP = Number(process.env.CAP ?? 110);
/** Harness fast-forward (?qaSpeed, agent-only): N updates per frame so a mode reaches its own end inside the cap. */
const QA = Number(process.env.QA ?? 4);
const IDLE_CAP = Number(process.env.IDLE_CAP ?? 60);
const EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local';
const PASS = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';
fs.mkdirSync(OUT, { recursive: true });

type Spec = { slug: string; path: string; kind?: 'babylon' | 'page' };
export const ROUTES: Spec[] = [
  { slug: 'dunk', path: '/play/dunk' }, { slug: 'try', path: '/try' }, { slug: 'karate', path: '/play/karate' },
  { slug: 'football', path: '/play/football' }, { slug: 'skateboard', path: '/play/skateboard' },
  { slug: 'snowboard_slalom', path: '/play/snowboard' }, { slug: 'surf', path: '/play/surf' },
  { slug: 'tennis', path: '/play/tennis' }, { slug: 'derby', path: '/play/baseball' }, { slug: 'penalty', path: '/play/soccer' },
  { slug: 'golf', path: '/play/golf' }, { slug: 'onevone', path: '/play/onevone' }, { slug: 'threevthree', path: '/play/threevthree' },
  { slug: 'carnival', path: '/play/carnival' }, { slug: 'karate_vs', path: '/play/karate-vs' },
  { slug: 'mixedcombat', path: '/play/mixedcombat' }, { slug: 'dunkduel', path: '/play/dunkduel', kind: 'page' },
  { slug: 'sprint', path: '/play/sprint' }, { slug: 'showdown', path: '/play/showdown' }, { slug: 'duel', path: '/play/duel' },
  { slug: 'volleyball', path: '/play/volleyball' }, { slug: 'dance', path: '/play/dance' },
  { slug: 'who_scene_it', path: '/play/who-scene-it' }, { slug: 'freerun', path: '/play/freerun' },
  { slug: 'threepoint', path: '/play/threepoint' }, { slug: 'bigair', path: '/play/big-air' },
  { slug: 'aeroaces', path: '/play/aero-aces' }, { slug: 'velocitykart', path: '/play/velocity-kart' },
  { slug: 'brainbrawl', path: '/play/brain-brawl' },
];
const pick = (process.env.MODES ?? 'all').split(',');
const MODES = pick[0] === 'all' ? ROUTES : ROUTES.filter((r) => pick.includes(r.slug));
const END_TEXT = /\b(GO AGAIN|RUN IT BACK|PLAY AGAIN|REMATCH|GAME OVER|RESULTS|FINAL SCORE|SESSION OVER|TIME'?S UP|YOU WIN|YOU LOSE|VICTORY|DEFEAT|CHAMPION|NEXT NIGHT|CLAIM YOUR)\b/i;

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript('globalThis.__name = (f) => f;');
// in-page fps: the agent metrics read PerfMonitor, which is off outside dev — count rAF frames per second instead
await ctx.addInitScript('(() => { let n = 0, t = performance.now(); window.__FPS = null; const f = (now) => { n++; if (now - t >= 1000) { window.__FPS = Math.round(n * 1000 / (now - t)); n = 0; t = now; } requestAnimationFrame(f); }; requestAnimationFrame(f); })();');
await ctx.addInitScript(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  (window as any).__PAD = pad;
  (navigator as any).getGamepads = () => [pad, null, null, null];
});
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', EMAIL); await p.fill('input[type="password"]', PASS); await p.click('button[type="submit"]');
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && /\/login/.test(p.url())) await p.waitForTimeout(300);
  }
  console.log('LOGIN →', p.url()); await p.close();
}

async function pad(p: Page, js: string) { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = Date.now(); })()`).catch(() => {}); }
/** One beat of a mixed input script: move, act, release. Varied so turn-based, timing and racing modes all progress. */
async function beat(p: Page, k: number) {
  const dirs = [[0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0], [-1, 0], [0, 1]];
  const [x, y] = dirs[k % dirs.length];
  await pad(p, `p.axes[0] = ${x}; p.axes[1] = ${y}`);
  const btn = [0, 2, 7, 0, 1, 3, 5, 0][k % 8];   // A, X, RT, A, B, Y, RB, A
  await pad(p, `p.buttons[${btn}].pressed = true; p.buttons[${btn}].value = 1`);
  if (k % 3 === 0) await p.keyboard.down('Space');
  await p.waitForTimeout(btn === 7 ? 650 : 180);
  await pad(p, `p.buttons[${btn}].pressed = false; p.buttons[${btn}].value = 0`);
  if (k % 3 === 0) await p.keyboard.up('Space');
  if (k % 5 === 0) { await p.keyboard.press(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK'][k % 5]); }
  // quiz / picker screens: click the first visible answer-like button now and then (never navigation / claim / quit)
  if (k % 7 === 3) {
    await p.evaluate(() => {
      const bad = /QUIT|CLAIM|HOME|BACK|EXIT|SIGN|MENU|SHOP|CLOSET/i;
      const b = [...document.querySelectorAll('button')].find((el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top > 80 && !bad.test(el.textContent ?? ''); });
      (b as HTMLButtonElement | undefined)?.click();
    }).catch(() => {});
  }
  await p.waitForTimeout(220);
}

const rows: Record<string, unknown>[] = [];
for (const m of MODES) {
  const p = await ctx.newPage();
  const errors: string[] = [];
  const t0 = Date.now();
  p.on('console', (msg) => { if (msg.type() === 'error') { const t = msg.text(); if (!/status of 401|favicon|Failed to load resource: the server responded with a status of 404/.test(t)) errors.push(t.slice(0, 220)); } });
  p.on('pageerror', (e) => errors.push('pageerror ' + String(e.message).slice(0, 220)));
  // TRAIL=<regex>: keep matching console lines (a mode's phase trace) with a timestamp, for a failure's context
  const trail: string[] = []; const TRAIL = process.env.TRAIL ? new RegExp(process.env.TRAIL) : null;
  if (TRAIL) p.on('console', (msg) => { const t = msg.text(); if (TRAIL.test(t)) trail.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${t.slice(0, 240)}`); });
  const row: Record<string, unknown> = { slug: m.slug, path: m.path };
  try {
    await p.goto(`${BASE}${m.path}${m.path.includes('?') ? '&' : '?'}agent=1&qaSpeed=${QA}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (m.kind === 'page') {
      await p.waitForTimeout(6000);
      row.page = (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)));
      row.pass = errors.length === 0 && !/404|error|something went wrong/i.test(String(row.page));
      await p.screenshot({ path: `${OUT}/${m.slug}.png` });
    } else {
      let state = '';
      // a lobby page in front of the mode (carnival's GAME NIGHT card): take its start button, once
      { const lobby = p.getByRole('button', { name: /START THE NIGHT|START NIGHT|LET'S GO/i }); await p.waitForTimeout(1500); if (await lobby.count()) await lobby.first().click().catch(() => {}); }
      while (Date.now() - t0 < 150000) {
        state = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '');
        if (state === 'loaded' || state === 'playing' || state === 'failed') break;
        await p.waitForTimeout(300);
      }
      row.readyMs = Date.now() - t0; row.readyState = state;
      if (state === 'failed' || !state) { row.pass = false; row.note = `never ready (${state || 'no marker'})`; await p.screenshot({ path: `${OUT}/${m.slug}-noready.png` }); }
      else {
        await p.waitForTimeout(800);
        const start = p.getByRole('button', { name: /^(START|TAP TO START|READY|PLAY)$/i });
        if (await start.count()) await start.first().click().catch(() => {}); else await p.keyboard.press('Space');
        const tPlay = Date.now();
        let playing = false, ended: string | null = null, k = 0, fps: number[] = [];
        while ((Date.now() - tPlay) / 1000 < CAP) {
          await beat(p, k++);
          const s = await p.evaluate(() => ({
            state: document.getElementById('fel-ready')?.dataset.state ?? '',
            text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2000),
            fps: (window as any).__FPS ?? null,
          })).catch(() => ({ state: '', text: '', fps: null }));
          if (s.state === 'playing') playing = true;
          if (typeof s.fps === 'number' && playing) fps.push(s.fps);
          if (k === 8) await p.screenshot({ path: `${OUT}/${m.slug}-play.png` });
          if (s.state === 'ended') { ended = 'marker'; break; }
          if (playing && END_TEXT.test(s.text)) { ended = `text:${END_TEXT.exec(s.text)?.[0]}`; break; }
        }
        row.masherSec = ended ? Math.round((Date.now() - tPlay) / 1000) : null;
        // IDLE PHASE. An endless mode (the karate horde, a survival run) ends when the game BEATS you, and a masher that
        // never loses is itself the finding: the anti-mash bar is that intent must beat noise. So when the masher did
        // not reach an end, hands off — let the game end it — and record how long each driver lasted.
        if (!ended && playing) {
          await pad(p, 'p.axes = [0, 0, 0, 0]; p.buttons.forEach((b) => { b.pressed = false; b.value = 0; })');
          const tIdle = Date.now();
          while ((Date.now() - tIdle) / 1000 < IDLE_CAP) {
            await p.waitForTimeout(1000);
            const s = await p.evaluate(() => ({ state: document.getElementById('fel-ready')?.dataset.state ?? '', text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2000) })).catch(() => ({ state: '', text: '' }));
            if (s.state === 'ended') { ended = 'idle:marker'; break; }
            if (END_TEXT.test(s.text)) { ended = `idle:text:${END_TEXT.exec(s.text)?.[0]}`; break; }
          }
          row.idleSec = ended ? Math.round((Date.now() - tIdle) / 1000) : null;
        }
        await p.waitForTimeout(1200);   // let the card settle, then keep what it SAYS — the anti-mash audit reads the result a masher earned
        row.endText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)).catch(() => null);
        await p.screenshot({ path: `${OUT}/${m.slug}-end.png` });
        fps.sort((a, b) => a - b);
        row.playing = playing; row.ended = ended; row.endSec = ended ? Math.round((Date.now() - tPlay) / 1000) : null;
        row.fpsP50 = fps.length ? fps[Math.floor(fps.length / 2)] : null; row.fpsP10 = fps.length ? fps[Math.floor(fps.length * 0.1)] : null;
        row.pass = playing && !!ended && errors.length === 0;
      }
    }
  } catch (e) { row.pass = false; row.note = 'exception ' + String((e as Error).message).slice(0, 200); }
  row.errors = [...new Set(errors)].slice(0, 6); row.errorCount = errors.length;
  if (TRAIL) row.trail = trail.slice(-30);
  rows.push(row);
  console.log(JSON.stringify(row));
  await p.close();
}
fs.writeFileSync(`${OUT}/gauntlet${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify(rows, null, 1));
const pass = rows.filter((r) => r.pass).length;
console.log(`\n${pass}/${rows.length} PASS`);
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${String(r.slug).padEnd(16)} playing=${r.playing ?? '-'} ended=${r.ended ?? '-'} t=${r.endSec ?? '-'}s fps50=${r.fpsP50 ?? '-'} errs=${r.errorCount} ${r.note ?? ''}`);
await browser.close();
