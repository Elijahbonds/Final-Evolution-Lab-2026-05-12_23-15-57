// Dump every console line matching a pattern from a mode page (dev): FILTER=regex URL=... npx tsx scripts/_console-dump.mts
import { chromium } from 'playwright-core';
const URL = process.env.URL ?? 'http://localhost:3000/dev/mode/tennis';
const FILTER = new RegExp(process.env.FILTER ?? 'FEL-ANIM|Error|error', 'i');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('console', (m) => { if (FILTER.test(m.text())) console.log(`[${m.type()}] ${m.text().slice(0, 600)}`); });
p.on('pageerror', (e) => console.log(`[pageerror] ${e.message.slice(0, 600)}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 30_000 }).catch(() => {});
await p.waitForTimeout(9000);
await b.close();
