import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
const p = await ctx.newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
{ const lp = await ctx.newPage(); await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await lp.waitForTimeout(600);
  if (/\/login/.test(lp.url())) { await lp.fill('input[type="email"]', 'playtest@fel.local'); await lp.fill('input[type="password"]', 'playtest-local-only'); await lp.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300); } await lp.close(); }
await p.goto(`${BASE}${process.env.PATHNAME ?? '/play/football?agent=1'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const t0 = Date.now(); while (Date.now() - t0 < 120000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(400); }
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__TRIG = []; const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input;
  if (bus && bus.on) bus.on((e) => { if (e.t === 'trigger') window.__TRIG.push([Math.round(performance.now()), e.side, e.value]); });
})()`);
const start = p.locator('text=/^(START|TAP TO START|PLAY)$/').first(); if (await start.count()) await start.first().click().catch(() => {});
await p.waitForTimeout(1500);
const from = await p.evaluate('window.__FEL_QA__.now()') as number;
await p.evaluate(`(() => { const b = window.__PAD.buttons[7]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
await p.waitForTimeout(2000);
await p.evaluate(`(() => { const b = window.__PAD.buttons[7]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
await p.waitForTimeout(600);
const sum = await p.evaluate(`window.__FEL_QA__.summary(450, ${from})`) as any;
const trig = await p.evaluate(`(() => { const R = window.__TRIG.filter((e) => e[1] === 'R'); const hist = {}; for (const e of R) hist[String(e[2])] = (hist[String(e[2])] || 0) + 1; const flips = []; let prev = null; for (const e of R) { const on = e[2] >= 0.5; if (prev !== null && on !== prev) flips.push(e[0]); prev = on; } return { hist, flips: flips.slice(0, 20), nflips: flips.length, first: R.slice(0, 6) }; })()`) as unknown[];
const trigN = await p.evaluate('window.__TRIG.length') as number;
console.log('presses by button:', JSON.stringify(sum.byBtn));
console.log('trigger events seen:', trigN, JSON.stringify(trig).slice(0, 400));
await b.close();
