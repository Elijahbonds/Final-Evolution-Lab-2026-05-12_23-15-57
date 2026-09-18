// _page-shot — log in via the credentials callback as EMAIL/PASSWORD (default: the seeded client) and screenshot PATH at phone width.
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp'; const PATH = process.env.PATH_ ?? '/create'; const NAME = process.env.NAME ?? 'page';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.EMAIL ?? 'client@fel.local', password: process.env.PASSWORD ?? 'client-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });   // WebGL on, or Babylon canvases shoot black
const ctx = await b.newContext({ viewport: { width: Number(process.env.VW ?? 430), height: Number(process.env.VH ?? 932) }, deviceScaleFactor: Number(process.env.DSF ?? 2), storageState: await rc.storageState() }); const p = await ctx.newPage();
if (process.env.LOGS) p.on('console', (m) => console.log('[con]', m.type(), m.text().slice(0, 220)));
await p.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded', timeout: 90000 }); await p.waitForTimeout(1500);
if (process.env.CLICK) { const c = p.locator(process.env.CLICK).first(); if (await c.count()) { await c.click(); await p.waitForTimeout(Number(process.env.WAIT ?? 4000)); } }
if (process.env.CLICK2) { const c = p.locator(process.env.CLICK2).first(); if (await c.count()) { await c.click(); await p.waitForTimeout(Number(process.env.WAIT2 ?? 4000)); } }
if (process.env.EVAL) { try { console.log('[eval]', JSON.stringify(await p.evaluate(process.env.EVAL))); } catch (e) { console.log('[eval-error]', String(e).slice(0, 200)); } }
await p.screenshot({ path: `${OUT}/${NAME}.png`, fullPage: true }); console.log('shot', `${NAME}.png`, p.url()); await b.close(); await rc.dispose();
