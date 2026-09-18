// _mash-watch — WHAT is the masher actually banking? (anti-mash bar, 2026-09-15)
//
// The mechanics probe says a random masher out-scores intent in skate and free run. This watches one masher run and
// prints the mode's own story of it: every banner it raised, the console beats the mode logs (landings, bails, manuals),
// and the HUD at the end — so the hole in the grammar is read off the game rather than guessed at.
//   BASE=… MODE=skateboard SEC=25 npx tsx scripts/probes/_mash-watch.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'skateboard';
// a production build has no /dev/mode routes (next start): pass the shipping route instead
const PATHNAME = process.env.PATHNAME ?? `/dev/mode/${MODE}?agent=1`;
const SEC = Number(process.env.SEC ?? 25);
const b0 = null; const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const bctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
const p = await bctx.newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/SKATE|BAIL|LAND|MANUAL|GRIND|COMBO|FREERUN|RUN-/i.test(t)) logs.push(t.slice(0, 120)); });
if (process.env.LOGIN === '1') {
  const lp = await bctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await lp.waitForTimeout(800);
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', 'playtest@fel.local'); await lp.fill('input[type="password"]', 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}
await p.goto(`${BASE}${PATHNAME}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(Object.assign(new Event('gamepadconnected'), {}));
  window.__BAN = []; let last = '';
  setInterval(() => { const q = window.__FEL_QA__; if (!q) return; const h = q.rawHud ? q.rawHud() : {}; const s = JSON.stringify([h.banner, h.combo, h.score, h.pot]); if (s !== last) { last = s; window.__BAN.push(s); } }, 60);
})()`);
const start = p.locator('text=/^(START|TAP TO START|PLAY)$/').first(); if (await start.count()) await start.first().click().catch(() => {});
const press = async (i: number) => { await p.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`); await p.waitForTimeout(40); await p.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`); };
const tEnd = Date.now() + SEC * 1000;
while (Date.now() < tEnd) {
  const idx = [0, 1, 2, 3, 0, 1, 7, 5, 14, 15][Math.floor(Math.random() * 10)];
  await p.evaluate(`(() => { window.__PAD.axes[0] = ${(Math.random() * 2 - 1).toFixed(2)}; window.__PAD.axes[1] = ${(Math.random() * 2 - 1).toFixed(2)}; window.__PAD.timestamp = Date.now(); })()`);
  await press(idx);
  await p.waitForTimeout(80);
}
const hud = await p.evaluate(`(() => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : null; })()`);
const bans = await p.evaluate('window.__BAN') as string[];
await b.close();
console.log('HUD:', JSON.stringify(hud).slice(0, 400));
console.log('banner/combo/score trail:', bans.slice(-40).join(' '));
console.log('logs:', logs.slice(-40).join('\n  '));
