// Dump every console line matching a pattern from a mode page (dev): FILTER=regex URL=... npx tsx scripts/_console-dump.mts
import { chromium } from 'playwright-core';
const URL = process.env.URL ?? 'http://localhost:3000/dev/mode/tennis';
const FILTER = new RegExp(process.env.FILTER ?? 'FEL-ANIM|Error|error', 'i');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
// LOGIN=1: carry a real session (the /play routes are auth-gated)
if (process.env.LOGIN === '1') {
  const { request } = await import('playwright-core');
  const rc = await request.newContext({ baseURL: new globalThis.URL(URL).origin });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
  await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
}
p.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}`));
p.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url().slice(0, 160)}`); });
p.on('console', (m) => { if (FILTER.test(m.text())) console.log(`[${m.type()}] ${m.text().slice(0, 600)}`); });
p.on('pageerror', (e) => console.log(`[pageerror] ${e.message.slice(0, 600)}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 30_000 }).catch(() => {});
// KEYS=j,k,l DRIVE_MS=25000: press the keys in turn so play advances (the keeper round in penalty)
const keys = (process.env.KEYS ?? '').split(',').filter(Boolean);
const until = Date.now() + Number(process.env.DRIVE_MS ?? 9000);
let k = 0;
while (Date.now() < until) { if (keys.length) { await p.keyboard.down(keys[k % keys.length]); await p.waitForTimeout(400); await p.keyboard.up(keys[k % keys.length]); k++; } await p.waitForTimeout(300); }
await b.close();
