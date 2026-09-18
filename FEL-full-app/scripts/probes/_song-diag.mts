// _song-diag — M2–M4 in the Academy: lay a pattern, save two sections, song mode, play, watch bars/sections swap, render.
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.EMAIL ?? 'client@fel.local', password: process.env.PASSWORD ?? 'client-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 1000 }, storageState: await rc.storageState() }); const p = await ctx.newPage();
const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message.slice(0, 160))); p.on('console', (m) => { if (m.type() === 'error' && !/style property/.test(m.text())) errors.push(m.text().slice(0, 160)); });
await p.goto(`${BASE}/play/music`, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(2500);
const click = async (sel: string) => { const l = p.locator(sel).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await p.waitForTimeout(400); };
await click('button:has-text("CELL: LAY A FOUNDATION")');
await click('button:has-text("SAVE GRID AS SECTION")');
await p.locator('select').last().selectOption('hook'); await p.waitForTimeout(200);
// a different pattern for the hook: toggle a few cells in the first row, then save
for (const si of [2, 6, 10, 14]) { const cells = p.locator('div[style*="aspect-ratio"]'); await cells.nth(si).click(); }
await click('button:has-text("SAVE GRID AS SECTION")');
const afterSave = await p.evaluate('window.__FEL_SONG__');
await click('button:has-text("SONG MODE")');
await click('button:has-text("PLAY")');
const bars: any[] = []; for (let i = 0; i < 6; i++) { await p.waitForTimeout(1100); bars.push(await p.evaluate('window.__FEL_SONG__')); }
await click('button:has-text("STOP")');
await click('button:has-text("RENDER SONG + STEMS")'); await p.waitForTimeout(6000);
const afterRender = await p.evaluate('window.__FEL_SONG__');
const links = await p.locator('a[download]').count();
await p.screenshot({ path: `${OUT}/song.png` });
console.log(JSON.stringify({ afterSave, barsSeen: bars.map((x) => `${x.bar}:${x.section}`), afterRender, downloadLinks: links, errors: errors.slice(0, 4) }));
await b.close(); await rc.dispose();
