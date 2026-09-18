// _card-shot — screenshot a public card page at phone width (SLUG=client-seed).
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp'; const slug = process.env.SLUG ?? 'client-seed';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const p = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
await p.goto(`${BASE}/card/${slug}`, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/card-${slug}.png`, fullPage: true }); console.log('shot', `card-${slug}.png`); await b.close();
