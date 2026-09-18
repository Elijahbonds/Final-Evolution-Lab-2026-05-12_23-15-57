// _session-e2e — phase 8 proof: log in, open /play/<route>, pass the READY gate, let the game run to its end
// (idle player loses / timer runs out) and watch the network for POST /api/sessions and /api/analytics.
//   ROUTE=karate-vs MAX_S=240 npx tsx scripts/probes/_session-e2e.mts
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';   // BASE=http://localhost:3006 drives the production bundle
const route = process.env.ROUTE ?? 'karate-vs'; const maxMs = Number(process.env.MAX_S ?? 240) * 1000;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
const posts: string[] = []; let sessionStatus: number | null = null; let sessionBody = '';
const errs: string[] = []; p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`.slice(0, 200)); });
p.on('response', async (r) => { const u = new URL(r.url()); if (r.request().method() !== 'POST' || !u.pathname.startsWith('/api/')) return; posts.push(`${u.pathname} ${r.status()}`); if (u.pathname === '/api/sessions') { sessionStatus = r.status(); try { sessionBody = (await r.text()).slice(0, 160); } catch { /* beacon */ } } });
await p.goto(`${BASE}/play/${route}`, { waitUntil: 'domcontentloaded' });
try { await p.waitForSelector('canvas', { timeout: 60000 }); } catch { console.log(`${route}: no canvas — landed on ${p.url()} (disabled route redirect?)`); await b.close(); process.exit(0); }
await p.waitForTimeout(9000);
await p.keyboard.press('j'); const t0 = Date.now();
const ACTIVE = process.env.ACTIVE === '1'; const keys = ['j', 'k', 'l', 'j', 'ArrowUp', 'j'];   // ACTIVE=1: pump the face keys like the gauntlet does, so contests and runs reach an end
// Pass 5 phase 0: DRIVER picks how the run is played, because seven contest routes never end under mashed keys.
//   masher (ACTIVE=1 default) · holds: hold A for HOLD_MS then release every GAP_MS (shots, swings, kicks) ·
//   strides: alternate ← → for STRIDE_MS then A, B (air routines) · run: hold ↑ only (a runner who never evades is downed) ·
//   clicks3: three A presses 0.9 s apart then GAP_MS (three-click meters: golf, penalty) ·
//   ride: hold ↑ with a steer tap either side (a slalom to its line) · passive: a tap every 20 s.
const DRIVER = process.env.DRIVER ?? (ACTIVE ? 'masher' : 'passive');
const HOLD_MS = Number(process.env.HOLD_MS ?? 600), GAP_MS = Number(process.env.GAP_MS ?? 3000), STRIDE_MS = Number(process.env.STRIDE_MS ?? 4000);
let tick = 0;
let lastGate = 0;
while (sessionStatus === null && Date.now() - t0 < maxMs) {
  // Some routes boot slowly (football's splash outlived the first tap): re-tap through TAP TO START / READY every 4 s.
  if (Date.now() - lastGate > 4000) { lastGate = Date.now(); const gate = (await p.evaluate(`/TAP TO START|PRESS START|TAP TO BEGIN/i.test(document.body.innerText.slice(0, 800))`)) as boolean; if (gate) { await p.keyboard.press('j'); const btn = p.getByRole('button', { name: /start|ready|tap to/i }).first(); if (await btn.count().catch(() => 0)) await btn.click({ timeout: 1500 }).catch(() => {}); const txt = p.getByText(/TAP TO START|PRESS START|TAP TO BEGIN/i).first(); if (await txt.count().catch(() => 0)) await txt.click({ timeout: 1500, force: true }).catch(() => {}); } }   // three-point's BootSplash starts on a click, not a key
  if (DRIVER === 'masher') { await p.waitForTimeout(1500); await p.keyboard.down('ArrowUp'); await p.keyboard.press(keys[tick++ % keys.length]); await p.waitForTimeout(120); await p.keyboard.up('ArrowUp'); }
  else if (DRIVER === 'holds') { await p.keyboard.down('j'); await p.waitForTimeout(HOLD_MS); await p.keyboard.up('j'); await p.waitForTimeout(GAP_MS); if (tick++ % 4 === 3) await p.keyboard.press('j'); }
  else if (DRIVER === 'strides') { const tEnd = Date.now() + STRIDE_MS; let side = 0; while (Date.now() < tEnd) { await p.keyboard.press(side++ % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(110); } await p.waitForTimeout(500); await p.keyboard.press('j'); await p.waitForTimeout(700); await p.keyboard.press('k'); await p.waitForTimeout(3500); await p.keyboard.press('j'); }
  else if (DRIVER === 'clicks3') { for (let i = 0; i < 3; i++) { await p.keyboard.press('j'); await p.waitForTimeout(900); } await p.waitForTimeout(GAP_MS); }   // three-click swing/kick meters (golf: aim → power → accuracy)
  else if (DRIVER === 'run') { await p.keyboard.down('w'); await p.waitForTimeout(2500); await p.keyboard.up('w'); await p.waitForTimeout(200); if (tick++ % 6 === 5) await p.keyboard.press('j'); }   // w = left stick up (arrows are the d-pad)
  else if (DRIVER === 'ride') { const side = tick++ % 2 ? 'a' : 'd'; await p.keyboard.down(' '); await p.keyboard.down(side); await p.waitForTimeout(1100); await p.keyboard.up(side); await p.waitForTimeout(300); await p.keyboard.up(' '); await p.waitForTimeout(100); }   // space = held trigger (tuck / pump), a/d = stick steer
  else { await p.waitForTimeout(2000); if ((Date.now() - t0) % 20000 < 2000) await p.keyboard.press('j'); }   // passive: a tap now and then keeps the READY/results gates moving
}
// the route may redirect when the mode is disabled in the rollout: say so instead of throwing

const ended = await p.evaluate(`document.body.innerText.slice(0, 400).replace(/\\n/g, ' ')`);
// PROOF=1 (PACK THE FIVE #3): on the results card, press SHARE DUNK PROOF, read the minted link, fetch the /c page.
if (process.env.PROOF === '1' && sessionStatus !== null) {
  await p.waitForTimeout(1500);
  const btn = p.getByText('SHARE PROOF', { exact: false }).first();
  const has = await btn.count();
  if (!has) console.log('proof: no SHARE PROOF button on the results card');
  else { const label = (await btn.innerText()).replace(/\s+/g, ' '); await btn.click(); let url = ''; for (let i = 0; i < 20 && !url; i++) { await p.waitForTimeout(500); url = await p.evaluate(`(document.body.innerText.match(/https?:\\/\\/[^\\s]+\\/c\\/[A-Za-z0-9_-]+/) || [''])[0]`); }
    let pageHas = 'n/a'; if (url) { const html = await (await p.request.get(url)).text(); pageHas = html.includes('PROOF') ? 'yes' : 'NO'; }
    console.log(`proof: button "${label}" → link ${url || 'none'} · /c page shows DUNK PROOF: ${pageHas}`); }
}
console.log(`${route}: /api/sessions → ${sessionStatus ?? 'never posted'} in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${sessionBody}`);
console.log('posts:', [...new Set(posts)].join(' | ') || 'none'); console.log('screen:', ended.slice(0, 200));
if (errs.length) console.log(`errors (${errs.length}):`, [...new Set(errs)].slice(0, 6).join(' || '));
await b.close();
