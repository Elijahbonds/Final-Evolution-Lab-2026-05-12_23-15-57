// One-off: approach, charge, release on /dev/mode/dunk and screenshot the flight every 250 ms.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-flight';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const logs: string[] = []; p.on('console', (m) => { const t = m.text(); if (/FEL-ANIM|MISSING|error/i.test(t)) logs.push(t.slice(0, 200)); });
await p.goto(`${BASE}${process.env.PATH_ ?? '/dev/mode/dunk'}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
await p.mouse.click(640, 400);
await p.keyboard.down('w'); await p.waitForTimeout(Number(process.env.APPROACH ?? 1400)); await p.keyboard.up('w');
await p.keyboard.down(' '); await p.waitForTimeout(Number(process.env.HOLD ?? 700)); await p.keyboard.up(' ');
for (let i = 0; i < 10; i++) { await p.screenshot({ path: `${OUT}/f${String(i).padStart(2, '0')}.png` }); await p.waitForTimeout(250); }
console.log('logs:', logs.slice(0, 6).join(' | '));
await b.close();
