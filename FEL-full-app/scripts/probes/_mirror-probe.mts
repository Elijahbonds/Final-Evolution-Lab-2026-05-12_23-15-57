import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('console', (m) => { if (/MIRROR-DEBUG/.test(m.text())) console.log(m.text().slice(0, 400)); });
await p.goto('http://localhost:3001/dev/mode/dance', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(6000);
await b.close();
