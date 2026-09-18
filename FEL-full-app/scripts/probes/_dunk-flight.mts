// One-off: approach, charge, release on /dev/mode/dunk and screenshot the flight every 250 ms.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-flight';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const logs: string[] = []; p.on('console', (m) => { const t = m.text(); if (/FEL-ANIM|MISSING|error/i.test(t)) logs.push(t.slice(0, 200)); });
await p.goto(`${BASE}${process.env.PATH_ ?? '/dev/mode/dunk'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 30_000 }); await p.waitForTimeout(2500);
await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
await p.evaluate('(document.activeElement instanceof HTMLElement) && document.activeElement.blur()');   // space must not press a focused button
await p.waitForTimeout(800);
// same rhythm as capture-mode-play: run up, hold CHARGE, release
await p.keyboard.down('w'); await p.waitForTimeout(Number(process.env.APPROACH ?? 900)); await p.keyboard.up('w');
await p.keyboard.down(' '); await p.waitForTimeout(Number(process.env.HOLD ?? 700));
await p.screenshot({ path: `${OUT}/f00-charged.png` });
await p.keyboard.up(' ');
for (let i = 1; i <= 12; i++) { await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}/f${String(i).padStart(2, '0')}.png` }); }
console.log('hud:', (await p.evaluate<string>('document.body.innerText')).split('\n').filter((l) => /phase|charge|score|hint/i.test(l)).slice(0, 4).join(' | '));
console.log('logs:', logs.slice(0, 6).join(' | '));
await b.close();
