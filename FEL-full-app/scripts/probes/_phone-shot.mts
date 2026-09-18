import { chromium, devices } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(1000);
if (/\/login/.test(p.url())) { await p.fill('input[type="email"]', 'playtest@fel.local'); await p.fill('input[type="password"]', 'playtest-local-only'); await p.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(p.url())) await p.waitForTimeout(300); }
console.log('after login', p.url());
await p.goto(`${BASE}/play/velocity-kart?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForTimeout(15000);
console.log(p.url(), await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? 'no marker'));
await p.screenshot({ path: `${process.env.HOME}/Claude/outbox/finish-release/phone/_shot.png` });
await b.close();
