// Why does /play/snowboard never post? Trace hero position, HUD gates and clock every 4 s under the ride driver.
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
await p.goto(`http://localhost:3000/play/${process.env.ROUTE ?? 'snowboard'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(2000);
const t0 = Date.now(); let tick = 0;
while (Date.now() - t0 < Number(process.env.MAX_S ?? 60) * 1000) {
  for (let i = 0; i < 3; i++) { await p.keyboard.down('ArrowUp'); await p.keyboard.press(tick++ % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(1200); await p.keyboard.up('ArrowUp'); await p.waitForTimeout(100); }
  const s = await p.evaluate(`(() => { const d = window.__FEL_DEV__; const h = d?.hero?.(); const t = document.body.innerText; const m = t.match(/(\\d+)s\\s+GATES (\\d+)\\/(\\d+)/); return JSON.stringify({ hero: h ? [h.position.x.toFixed(1), h.position.y.toFixed(1), h.position.z.toFixed(1)] : null, hud: m ? m[0] : t.slice(0, 120).replace(/\\n/g, ' ') }); })()`);
  console.log(`t+${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
}
await b.close();
