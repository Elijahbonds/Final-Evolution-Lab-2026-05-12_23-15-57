// Why does /play/golf never stroke under the drivers? Press A (j) every 1.5 s and dump the hint / HUD every 6 s.
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
await p.goto('http://localhost:3000/play/golf', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
const dump = async (tag: string) => { const s = await p.evaluate(`(() => { const d = window.__FEL_DEV__; const sc = d?.scene; const ball = sc?.getMeshByName?.('gball'); const h = d?.hero?.(); const cam = sc?.activeCamera; return JSON.stringify({ ball: ball ? [ball.position.x.toFixed(1), ball.position.y.toFixed(2), ball.position.z.toFixed(1)] : null, hero: h ? [h.position.x.toFixed(1), h.position.z.toFixed(1)] : null, cam: cam ? [cam.position.x.toFixed(0), cam.position.y.toFixed(0), cam.position.z.toFixed(0)] : null, hud: (document.body.innerText.match(/\\d\\/3[^▲]*/) || [''])[0].replace(/\\n/g, ' ').slice(0, 80) }); })()`); console.log(`${tag}: ${s}`); };
await dump('before start');
const btn = p.getByRole('button', { name: /start|ready|tap to/i }).first(); if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => {});
await p.keyboard.press('j'); await p.waitForTimeout(2000); await dump('after start');
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < Number(process.env.MAX_S ?? 45) * 1000) {
  await p.keyboard.press(process.env.KEY ?? 'j'); n++; await p.waitForTimeout(1500);
  if (n % 4 === 0) await dump(`t+${((Date.now() - t0) / 1000).toFixed(0)}s (${n} presses)`);
}
await b.close();
