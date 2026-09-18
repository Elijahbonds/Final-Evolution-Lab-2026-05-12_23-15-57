// Ship Pass 2, Phase 4 — fault injection on a mode page. What does the player
// SEE when something fails? Never a white screen; a crash report should land.
//   FAULT=glb404|slow|offline|contextloss URL=http://localhost:3000/dev/mode/onevone npx tsx scripts/capture-fault.mts
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:3000/dev/mode/onevone';
const FAULT = process.env.FAULT ?? 'glb404';
const OUT = process.env.OUT_DIR ?? 'docs/shots/fault'; mkdirSync(OUT, { recursive: true });
const NAME = process.env.NAME ?? `${FAULT}`;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
if (process.env.LOGIN === '1') {   // the shipping routes are auth-gated
  const { request } = await import('playwright-core');
  const rc = await request.newContext({ baseURL: new globalThis.URL(URL).origin });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
  await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
}
const logs: string[] = []; const crashPosts: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-|ASSET-LOADER/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 240)}`));
p.on('request', (r) => { if (/telemetry\/(crash|game)|api\/analytics/.test(r.url()) && r.method() === 'POST') crashPosts.push(r.postData()?.slice(0, 200) ?? ''); });
if (FAULT === 'glb404') await p.route('**/models/**/*.glb', (r) => r.fulfill({ status: 404, body: 'gone' }));
if (FAULT === 'slow') await p.route('**/models/**/*.glb', async (r) => { await new Promise((res) => setTimeout(res, 12_000)); await r.continue(); });
if (FAULT === 'offline') await p.route('**/api/**', (r) => r.abort('connectionfailed'));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(Number(process.env.WAIT_MS ?? (FAULT === 'slow' ? 16_000 : 9_000)));
if (FAULT === 'contextloss') {
  await p.evaluate(() => { const c = document.querySelector('canvas'); const gl = c?.getContext('webgl2') ?? c?.getContext('webgl'); const ext = gl?.getExtension('WEBGL_lose_context'); ext?.loseContext(); (window as unknown as { __felLost?: boolean }).__felLost = !!ext; });
  await p.waitForTimeout(6_000);
}
const text = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600);
const canvas = await p.evaluate(() => { const c = document.querySelector('canvas'); return c ? `${c.width}x${c.height}` : 'none'; });
const blank = text.trim().length < 20;
await p.screenshot({ path: `${OUT}/${NAME}.png` });
console.log(`${NAME} canvas ${canvas} | body text ${text.length} chars${blank ? ' — WHITE SCREEN' : ''} | crash posts ${crashPosts.length} | errors ${logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).length}`);
const cue = /retry|reload|try again|couldn.t load|failed to load|something went wrong|offline|reconnect/i.exec(text);
console.log(`${NAME} recovery cue: ${cue ? `"${cue[0]}"` : 'NONE'} | text: ${text.slice(0, 200)}`);
for (const l of logs.slice(0, 4)) console.log('   ·', l);
for (const b of crashPosts.slice(0, 3)) console.log('   post:', b.slice(0, 300));
await b.close();
