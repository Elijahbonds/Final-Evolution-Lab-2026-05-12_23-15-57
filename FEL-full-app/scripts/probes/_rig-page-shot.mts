// Screenshot /dev/rig for a candidate avatar and print the page's gate text.
import { chromium } from 'playwright-core';
const AVATAR = process.env.AVATAR ?? '/models/candidates/fel-hero-mpfb.glb';
const OUT = process.env.OUT ?? '/tmp/rig-candidate.png';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const { request } = await import('playwright-core');
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addCookies((await rc.storageState()).cookies); await rc.dispose();
const p = await ctx.newPage();
const errs: string[] = []; p.on('console', (m) => { if (m.type() === 'error' || /FEL-/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.goto(`http://localhost:3000/dev/rig?avatar=${encodeURIComponent(AVATAR)}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 30_000 }).catch(() => {});
await p.waitForTimeout(8000);
await p.screenshot({ path: OUT });
console.log('text:', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 500));
for (const e of errs.slice(0, 6)) console.log('  ·', e);
await b.close();
