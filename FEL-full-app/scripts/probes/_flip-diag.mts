// _flip-diag — the Flip on /play/music: log in, open FLIP, load a FEL stem, play pad 1 by key, read the dev hook, screenshot.
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.EMAIL ?? 'client@fel.local', password: process.env.PASSWORD ?? 'client-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, storageState: await rc.storageState() }); const p = await ctx.newPage();
const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
await p.goto(`${BASE}/play/music`, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(2000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(2000); }
await p.locator('button:has-text("FLIP")').first().click({ timeout: 30000 }); await p.waitForTimeout(600);
await p.locator('button:has-text("808 snare")').first().click(); await p.waitForTimeout(1500);
const afterLoad = await p.evaluate('window.__FEL_FLIP__');
await p.keyboard.press('1'); await p.waitForTimeout(300);
const afterKey = await p.evaluate('window.__FEL_FLIP__');
await p.locator('button[aria-label="pad 2"]').first().dispatchEvent('pointerdown'); await p.waitForTimeout(300);
const afterTap = await p.evaluate('window.__FEL_FLIP__');
await p.locator('button:has-text("GRID")').first().click(); await p.waitForTimeout(500);
const afterGrid = await p.evaluate('window.__FEL_FLIP__');
await p.screenshot({ path: `${OUT}/flip.png` });
console.log(JSON.stringify({ afterLoad, afterKey, afterTap, afterGrid, errors: errors.slice(0, 4) }));
await b.close(); await rc.dispose();
