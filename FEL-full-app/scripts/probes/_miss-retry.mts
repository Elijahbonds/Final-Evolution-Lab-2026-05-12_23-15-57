// Venice DualShock pad acceptance #4 — miss + retry without a pause/retry card.
// Hold the charge (SPACE) continuously and never slam: every attempt is a blown miss. Measure the gap from the
// MISSED banner to the next run-up's hint, and assert no PAUSED / RETRY / resume text ever appears.
//   npx tsx scripts/probes/_miss-retry.mts   (MISSES=3 MAX_S=120)
import { chromium, request } from 'playwright-core';
const MISSES = Number(process.env.MISSES ?? 3), maxMs = Number(process.env.MAX_S ?? 120) * 1000;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
await p.goto('http://localhost:3000/play/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(2500);
const text = async () => (await p.evaluate('document.body.innerText')) as string;
await p.keyboard.down(' ');                       // the hold goes down once and stays down
const t0 = Date.now(); let misses = 0, missAt = 0, sawCard = false; const gaps: number[] = []; let state: 'run' | 'missed' = 'run';
while (misses < MISSES && Date.now() - t0 < maxMs) {
  await p.waitForTimeout(80);
  const t = await text();
  if (/PAUSED|TAP TO RESUME|RETRY|TRY AGAIN/i.test(t)) sawCard = true;
  if (state === 'run' && /MISSED/i.test(t)) { state = 'missed'; missAt = Date.now(); misses++; }
  else if (state === 'missed' && !/MISSED/i.test(t) && /running to the rim|HOLD CHARGE|DUNK \d\/\d/.test(t)) { gaps.push(Date.now() - missAt); state = 'run'; }
}
await p.keyboard.up(' ');
const last = (await text()).slice(0, 220).replace(/\n/g, ' ');
console.log(`misses seen: ${misses} · miss → next run-up gaps (ms): ${gaps.join(', ') || 'none'} · pause/retry card seen: ${sawCard ? 'YES' : 'no'}`);
console.log(`screen: ${last}`);
await b.close();
