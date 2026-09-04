// What does a logged-in page actually render? Prints status, final URL, canvas presence and body text.
import { chromium, request } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/play/dunkduel';
const rc = await request.newContext({ baseURL: new globalThis.URL(URL_).origin });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addCookies(cookies);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
p.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url().slice(0, 140)}`); });
const res = await p.goto(URL_, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
console.log('status', res?.status(), 'url', p.url());
console.log('canvas', await p.evaluate(() => document.querySelectorAll('canvas').length), 'buttons:', await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 12).join(' | ')));
console.log('text:', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 700));
await b.close();
