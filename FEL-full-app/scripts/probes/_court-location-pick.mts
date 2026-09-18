// Court locations — the splash row appears on a basketball play route, a pick reloads with ?location= and the splash
// takes the location's art. Cleans the remembered pick afterwards.
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
await p.goto('http://localhost:3000/play/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.getByText('TAP TO START').first().waitFor({ timeout: 45000 }).catch(() => {});
const text = async () => (await p.evaluate('document.body.innerText')) as string;
const t1 = await text();
console.log(`row on splash: ${/LOCATION/.test(t1)} · venice chip: ${/VENICE BEACH COURT/.test(t1)} · blossom chip: ${/BLOSSOM PARK/.test(t1)}`);
await p.getByRole('button', { name: /BLOSSOM PARK/ }).first().click({ timeout: 5000 });
await p.waitForURL(/location=blossom/, { timeout: 15000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.getByText('TAP TO START').first().waitFor({ timeout: 45000 }).catch(() => {});
const t2 = await text();
const stored = await p.evaluate(`localStorage.getItem('fel-court-location')`);
console.log(`after pick: url has location=blossom: ${/location=blossom/.test(p.url())} · stored: ${stored} · splash eyebrow BLOSSOM PARK: ${/BLOSSOM PARK/.test(t2.slice(0, 400))}`);
await p.screenshot({ path: process.env.OUT ?? 'docs/shots/court-location-splash.png' });
await p.evaluate(`localStorage.removeItem('fel-court-location')`);
await b.close();
