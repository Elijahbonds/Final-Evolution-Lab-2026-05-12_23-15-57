// _ladder-page — pass 5 phase 4: /ladder renders for a logged-in player (heading, this-week block, recent seasons).
import { chromium, request } from 'playwright-core';
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies(cookies);
const errs: string[] = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await p.goto('http://localhost:3000/ladder', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
const text = await p.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400)`);
console.log(`ladder: url ${p.url()} · heading ${text.includes('MASTERY LADDER') ? 'yes' : 'NO'} · this-week ${/This week|No season/.test(text) ? 'yes' : 'NO'} · seasons ${/Recent seasons/.test(text) ? 'yes' : 'NO'} · console errors ${errs.length}`);
console.log('text:', text.slice(0, 220));
await b.close();
