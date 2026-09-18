// _lc-chip — LC folded into the wallet: the header chip shows coins · shards · LC, /api/v1/wallet returns lc, and the arena
// config's balance equals the wallet's lc. Logs in as the playtest user.
import { chromium, request } from 'playwright-core';
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const wallet = await (await rc.get('/api/v1/wallet')).json(); const arena = await (await rc.get('/api/arena/config')).json(); const shop = await (await rc.get('/api/shop')).json().catch(() => null);
console.log(`wallet: coins ${wallet.coins} shards ${wallet.shards} lc ${wallet.lc} · arena config balance ${arena.balance ?? arena.lcBalance ?? JSON.stringify(arena).slice(0, 80)} · shop labCredits ${shop?.labCredits}`);
const cookies = (await rc.storageState()).cookies; await rc.dispose();
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies(cookies);
await p.goto('http://localhost:3000/modes', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
console.log('chip:', await p.evaluate(`(() => { const el = document.querySelector('[aria-label="Coins, shards and lab credits balance"]'); return el ? el.innerText.replace(/\\s+/g, ' ') : 'chip not found (old aria-label?) ' + (document.querySelector('[aria-label="Coins and shards balance"]')?.innerText ?? ''); })()`));
await b.close();
