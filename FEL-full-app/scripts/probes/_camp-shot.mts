// One-off: log in, open /camp, screenshot the Curriculum and Session tabs.
//   OUT_DIR=... npx tsx scripts/probes/_camp-shot.mts
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT_DIR ?? 'docs/shots/camp';
const browser = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 1 });
const rc = ctx.request;
const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage();
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${BASE}/camp`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'Curriculum' }).click();
await p.waitForTimeout(400);
await p.locator('details').nth(5).click();   // open week 6
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/curriculum.png`, fullPage: true });
const text = await p.locator('main').innerText();
console.log('curriculum text head:', text.slice(0, 400).replace(/\n+/g, ' | '));
console.log('has thesis:', text.includes('say it out loud in week 1'), '· weeks:', (text.match(/Week \d — /g) ?? []).length, '· protocol fields:', (text.match(/\d\. [A-Z][a-z]+/g) ?? []).length);
await p.getByRole('button', { name: 'Session' }).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/session.png`, fullPage: true });
const st = await p.locator('main').innerText();
console.log('session text head:', st.slice(0, 500).replace(/\n+/g, ' | '));
console.log('errors:', errors.length, errors.slice(0, 3));
await browser.close();
