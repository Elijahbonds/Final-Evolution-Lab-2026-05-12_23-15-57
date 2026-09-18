// _faucet-proof — PACK THE FIVE #2: log in, open /modes (header wallet chip), watch POST /api/v1/wallet/earn for
// daily_first_session and its response; run twice to show the replay returns the same grant without a second toast mark.
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
for (const pass of [1, 2]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies(cookies);
  const earns: string[] = [];
  p.on('response', async (r) => { if (r.request().method() === 'POST' && r.url().includes('/api/v1/wallet/earn')) { let body = ''; try { body = (await r.text()).slice(0, 200); } catch {} earns.push(`${r.status()} ${r.request().postData()?.slice(0, 120)} → ${body}`); } });
  await p.goto('http://localhost:3000/modes', { waitUntil: 'domcontentloaded' });
  let toast = false; for (let i = 0; i < 20 && !toast; i++) { await p.waitForTimeout(500); toast = await p.evaluate(`/\\+\\d+ coins/.test(document.body.innerText)`); }
  await p.waitForTimeout(1500);
  const mark = await p.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('fel:daily_first_session')).join(',')`);
  console.log(`pass ${pass}: earn posts=${earns.length} ${earns.join(' | ')} · toast=${toast} · mark=${mark || 'none'}`);
  await p.close();
}
await b.close();
