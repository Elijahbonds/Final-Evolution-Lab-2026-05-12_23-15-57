// Phase 3 round-trip: pick a hair style and a face slider in the Closet and
// screenshot the live 3D preview before/after (the preview and the game share
// one model and one identity pipe, so what shows here is what plays).
//   OUT=<dir> npx tsx scripts/_closet-preview-probe.mts
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addCookies(cookies);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
await page.goto(`${BASE}/closet`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30_000 }); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/closet-before.png` });
await page.getByRole('button', { name: 'Afro', exact: true }).click().catch(() => page.getByText('Afro', { exact: true }).first().click());
await page.waitForTimeout(900);
const slider = page.getByLabel('Roundness');
if (await slider.count()) { await slider.first().fill('90').catch(async () => { await slider.first().evaluate((el: HTMLInputElement) => { el.value = '90'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); }); }
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/closet-after.png` });
const text = (await page.innerText('body')).replace(/\s+/g, ' ');
console.log('closet text has Fine-tune:', /Fine-tune/.test(text), '| Afro chip present:', /Afro/.test(text));
console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
await b.close();
