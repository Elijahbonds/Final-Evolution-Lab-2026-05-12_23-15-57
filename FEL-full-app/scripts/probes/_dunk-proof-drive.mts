// _dunk-proof-drive — PACK THE FIVE #3: play a whole dunk contest on the shipping route (login, /play/dunk) with a
// timing-based attempt loop (run-up W, hold SPACE to charge, release, slam A on the flight), wait for the session
// post, then press SHARE PROOF and fetch the minted /c page. Misses still end an attempt, so the contest ends.
//   npx tsx scripts/probes/_dunk-proof-drive.mts        (ATTEMPTS=10 MAX_S=360)
import { chromium, request } from 'playwright-core';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 10), maxMs = Number(process.env.MAX_S ?? 360) * 1000;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
let sessionStatus: number | null = null; let sessionBody = '';
p.on('response', async (r) => { if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sessions') { sessionStatus = r.status(); try { sessionBody = (await r.text()).slice(0, 120); } catch {} } });
await p.goto('http://localhost:3000/play/dunk', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(4500);   // READY + countdown
const t0 = Date.now(); let n = 0;
while (sessionStatus === null && n < ATTEMPTS && Date.now() - t0 < maxMs) {
  n++;
  await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w');   // run-up
  await p.keyboard.down(' '); await p.waitForTimeout(1100); await p.keyboard.up(' ');   // charge → launch
  await p.waitForTimeout(650); await p.keyboard.press('j');                              // slam on the flight
  await p.waitForTimeout(900); await p.keyboard.press('j');                              // a second try in the window
  for (let i = 0; i < 14 && sessionStatus === null; i++) { await p.waitForTimeout(700); }   // judging + the rival's turn
  await p.keyboard.press('j');                                                            // any card between turns
  await p.waitForTimeout(600);
  const text = await p.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)`);
  console.log(`attempt ${n} @${((Date.now() - t0) / 1000).toFixed(0)}s: ${text.slice(0, 160)}`);
}
console.log(`dunk: /api/sessions → ${sessionStatus ?? 'never posted'} · ${sessionBody}`);
if (sessionStatus !== null) {
  await p.waitForTimeout(1500);
  const btn = p.getByText('SHARE PROOF', { exact: false }).first();
  if (!(await btn.count())) console.log('proof: no SHARE PROOF button on the results card');
  else {
    const label = (await btn.innerText()).replace(/\s+/g, ' '); await btn.click();
    let url = ''; for (let i = 0; i < 20 && !url; i++) { await p.waitForTimeout(500); url = await p.evaluate(`(document.body.innerText.match(/https?:\\/\\/[^\\s]+\\/c\\/[A-Za-z0-9_-]+/) || [''])[0]`); }
    let pageHas = 'n/a'; if (url) { const html = await (await p.request.get(url)).text(); pageHas = html.includes('DUNK PROOF') ? 'yes' : 'NO'; }
    console.log(`proof: button "${label}" → link ${url || 'none'} · /c page shows DUNK PROOF: ${pageHas}`);
  }
}
await b.close();
