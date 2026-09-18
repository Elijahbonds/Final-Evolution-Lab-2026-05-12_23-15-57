// One-off: the Closet preview at several skin tones on a body (dev-only ?hero= and ?tone=).
//   HERO=/models/candidates/fel-hero-mpfb.glb OUT_DIR=... npx tsx scripts/probes/_closet-tones.mts
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', OUT = process.env.OUT_DIR ?? 'docs/shots/tones', HERO = process.env.HERO ?? '', ROUTE = process.env.ROUTE ?? '/closet';
const TONES = (process.env.TONES ?? '241509,8d5524,c68642,f3d2b3').split(',');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage(); const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
for (const tone of TONES) {
  await p.goto(`${BASE}${ROUTE}?tone=${tone}${HERO ? `&hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
  const info = await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; if (!s) return 'no preview'; const skins = s.meshes.map((m) => m.material).filter((m) => m && /skin/i.test(m.name)); const m = skins[0]; return m ? (m.name + ' tex=' + (m.albedoTexture ? m.albedoTexture.name.split('/').pop() : 'none') + ' albedo=' + m.albedoColor.toHexString() + ' felSkin=' + (m.metadata && m.metadata.felSkin)) : 'no skin material'; })()`);
  const canvas = await p.$('canvas'); await canvas!.screenshot({ path: `${OUT}/${HERO ? 'cand' : 'ship'}-${tone}.png` });
  console.log(`${HERO ? 'cand' : 'ship'} ${tone}: ${info}`);
}
console.log('errors:', errs.length, errs.slice(0, 2));
await b.close();
