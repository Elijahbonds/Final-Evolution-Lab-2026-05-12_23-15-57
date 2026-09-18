// _arena-splash — does the splash offer the ARENA chips on a combat mode, and does each arena load? Screenshots only.
//   BASE=http://127.0.0.1:3098 MODE=duel ARENA=rooftop npx tsx scripts/probes/_arena-splash.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098', MODE = process.env.MODE ?? 'duel', ARENA = process.env.ARENA ?? '';
const OUT = process.env.OUT ?? '/tmp/arena-probe'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[ARENA\]|\[NEXUS\]|error/i.test(t) && !/401|FEL-FRAME|receiveShadows/.test(t)) logs.push(t.slice(0, 200)); });
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1${ARENA ? `&arena=${ARENA}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('text=ARENA', { timeout: 240000 }).catch(() => console.log('no ARENA chips'));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/${MODE}-${ARENA || 'default'}-splash.png` });
const chips = await p.locator('button[aria-pressed]').allTextContents();
console.log('chips:', chips.join(' | '));
const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
for (let i = 0; i < 90; i++) { if (await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero())) break; await p.waitForTimeout(1000); }
await p.waitForTimeout(3500);
await p.screenshot({ path: `${OUT}/${MODE}-${ARENA || 'default'}-play.png` });
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
