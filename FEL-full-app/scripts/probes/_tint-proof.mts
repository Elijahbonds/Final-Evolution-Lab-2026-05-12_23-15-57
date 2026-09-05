// _tint-proof — PACK THE FIVE #1/#4: log in as the playtest user, open /play/<route> (default dunk), and read the
// hero's jersey / shorts / shoe material colours; compare with the Closet's equipped accents (wearable-catalog).
//   ROUTE=dunk npx tsx scripts/probes/_tint-proof.mts
import { chromium, request } from 'playwright-core';
const route = process.env.ROUTE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
const closet = await (await rc.get('/api/v1/closet')).json().catch(() => null);
const cookies = (await rc.storageState()).cookies; await rc.dispose();
console.log('closet equipped:', JSON.stringify(closet?.look?.equipped ?? null));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.context().addCookies(cookies);
await p.goto(`http://localhost:3000/play/${route}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(6000);
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__ (production build?)'; const hero = d.hero ? d.hero() : null; if (!hero) return 'no hero yet';
  const hex = (c) => c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
  const rows = []; for (const m of hero.getChildMeshes()) { const mat = m.material; if (!mat) continue; const name = (m.name + ' ' + mat.name).toLowerCase(); if (!/jersey|top|shirt|tee|shorts|pants|shoe|sneaker|boot/.test(name)) continue; rows.push({ mesh: m.name.slice(0, 28), mat: mat.name.slice(0, 28), visible: m.isVisible && m.isEnabled(), color: hex(mat.albedoColor ?? mat.diffuseColor), hasTexture: !!(mat.albedoTexture ?? mat.diffuseTexture) }); }
  return JSON.stringify({ mode: d.modeId, garments: rows }, null, 0); })()`));
await b.close();
