// _pause-overlay — log in as the playtest user, open /play/<route>, press Escape (START) after the READY gate and check
// the PAUSED overlay appears, then clears. The dev harness renders no game component, so this must be the play route.
//   ROUTES=gymnastics,sprint,threepoint,dunk npx tsx scripts/probes/_pause-overlay.mts
import { chromium, request } from 'playwright-core';
const routes = (process.env.ROUTES ?? 'gymnastics,sprint,threepoint,dunk').split(',');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
for (const r of routes) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies(cookies);
  await p.goto(`http://localhost:3000/play/${r}`, { waitUntil: 'domcontentloaded' }); try { await p.waitForSelector('canvas', { timeout: 45000 }); } catch { console.log(`${r.padEnd(12)} no canvas — at ${p.url()} · title "${await p.title()}" · text: ${(await p.evaluate('document.body.innerText')).slice(0, 120).replace(/\n/g, ' ')}`); await p.close(); continue; }
  await p.waitForTimeout(9000);
  await p.keyboard.press('j'); await p.waitForTimeout(4500);   // READY gate (A) + the 3-2-1 countdown
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);   // START → paused
  const paused = await p.evaluate(`document.body.innerText.includes('PAUSED')`);
  await p.keyboard.press('j'); await p.waitForTimeout(700);   // any button → playing
  const resumed = await p.evaluate(`!document.body.innerText.includes('PAUSED')`);
  console.log(`${r.padEnd(12)} paused overlay: ${paused ? 'yes' : 'NO'} · resumed: ${resumed ? 'yes' : 'NO'}`);
  await p.close();
}
await b.close();
