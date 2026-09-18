// Three-point on desktop: the controller lobby should be a badge until a phone joins (owner call 2026-09-05).
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: process.env.BASE ?? 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
await p.goto(`${process.env.BASE ?? 'http://localhost:3000'}/play/threepoint`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(10000);
const t = (await p.evaluate('document.body.innerText')) as string;
console.log(`panel open (Scan the code): ${/Scan the code/.test(t)} · badge (tap to pair): ${/tap to pair/i.test(t)} · text: ${t.replace(/\n/g, ' · ').slice(0, 220)}`);
await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/threepoint_lobby.png` });
await b.close();
