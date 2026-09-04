// _session-e2e — phase 8 proof: log in, open /play/<route>, pass the READY gate, let the game run to its end
// (idle player loses / timer runs out) and watch the network for POST /api/sessions and /api/analytics.
//   ROUTE=karate-vs MAX_S=240 npx tsx scripts/probes/_session-e2e.mts
import { chromium, request } from 'playwright-core';
const route = process.env.ROUTE ?? 'karate-vs'; const maxMs = Number(process.env.MAX_S ?? 240) * 1000;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
const posts: string[] = []; let sessionStatus: number | null = null; let sessionBody = '';
p.on('response', async (r) => { const u = new URL(r.url()); if (r.request().method() !== 'POST' || !u.pathname.startsWith('/api/')) return; posts.push(`${u.pathname} ${r.status()}`); if (u.pathname === '/api/sessions') { sessionStatus = r.status(); try { sessionBody = (await r.text()).slice(0, 160); } catch { /* beacon */ } } });
await p.goto(`http://localhost:3000/play/${route}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); const t0 = Date.now();
while (sessionStatus === null && Date.now() - t0 < maxMs) { await p.waitForTimeout(2000); if ((Date.now() - t0) % 20000 < 2000) await p.keyboard.press('j'); }   // a tap now and then keeps the READY/results gates moving
const ended = await p.evaluate(`document.body.innerText.slice(0, 400).replace(/\\n/g, ' ')`);
console.log(`${route}: /api/sessions → ${sessionStatus ?? 'never posted'} in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${sessionBody}`);
console.log('posts:', [...new Set(posts)].join(' | ') || 'none'); console.log('screen:', ended.slice(0, 200));
await b.close();
