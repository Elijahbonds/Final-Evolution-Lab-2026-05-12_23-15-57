// Pass 5 phase 5 (second half) — the results card settles an async challenge from a `?mp=<code>` run.
//   MODE=karate-vs ROUTE=karate-vs MAX_S=240 npx tsx scripts/probes/_mp-results-card.mts
// Host (playtest) creates the challenge; the guest (mentee) plays /play/<route>?mp=<code> with the active driver until
// the session posts, then the card must show FRIEND CHALLENGE with the settled scores.
import { chromium, request } from 'playwright-core';
const mode = process.env.MODE ?? 'karate-vs'; const route = process.env.ROUTE ?? mode; const maxMs = Number(process.env.MAX_S ?? 240) * 1000;
async function login(email: string, password: string) {
  const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } });
  return rc;
}
const host = await login('playtest@fel.local', 'playtest-local-only');
const created = await (await host.post('/api/v1/mp/create', { data: { mode } })).json();
console.log(`host create ${mode}: code ${created.code ?? 'none'} · hostScore ${created.hostScore} ${created.error ?? ''}`);
await host.dispose();
if (!created.code) process.exit(1);
const guest = await login('mentee@fel.local', 'playtest-local-only');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await guest.storageState()).cookies); await guest.dispose();
let sessionStatus: number | null = null; let joinBody = '';
p.on('response', async (r) => { const u = new URL(r.url()); if (r.request().method() !== 'POST') return; if (u.pathname === '/api/sessions') sessionStatus = r.status(); if (u.pathname === '/api/v1/mp/join') joinBody = (await r.text()).slice(0, 220); });
await p.goto(`http://localhost:3000/play/${route}?mp=${created.code}`, { waitUntil: 'domcontentloaded' });
try { await p.waitForSelector('canvas', { timeout: 60000 }); } catch { console.log(`no canvas — landed on ${p.url()}`); await b.close(); process.exit(1); }
await p.waitForTimeout(9000); await p.keyboard.press('j'); const t0 = Date.now();
const keys = ['j', 'k', 'l', 'j', 'ArrowUp', 'j']; let tick = 0;
while (sessionStatus === null && Date.now() - t0 < maxMs) {
  await p.waitForTimeout(1500);
  await p.keyboard.down('ArrowUp'); await p.keyboard.press(keys[tick++ % keys.length]); await p.waitForTimeout(120); await p.keyboard.up('ArrowUp');
}
console.log(`guest /api/sessions → ${sessionStatus ?? 'never posted'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
let card = ''; for (let i = 0; i < 30 && !card; i++) { await p.waitForTimeout(500); card = await p.evaluate(`(() => { const t = document.body.innerText; const i = t.indexOf('FRIEND CHALLENGE'); return i < 0 ? '' : t.slice(i, i + 160).replace(/\\n/g, ' · '); })()`) as string; }
console.log(`join response: ${joinBody || 'none'}`);
console.log(`results card: ${card || 'NO FRIEND CHALLENGE block'}`);
await b.close();
