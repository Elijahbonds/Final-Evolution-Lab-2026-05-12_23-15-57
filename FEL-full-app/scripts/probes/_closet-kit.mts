// One-off: a kit body in the Closet — which garments are visible, and a frame. (dev-only ?hero=)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '', OUT = process.env.OUT_DIR ?? 'docs/shots/kit', TAG = process.env.TAG ?? 'kit';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage(); const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
console.log(TAG, await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; s.root.rotation.y = 0.6; return JSON.stringify({ visible: s.meshes.filter((m) => m.isVisible).map((m) => m.name.replace(/_c\\d+$/, '')), playing: [...s.animator.groups.values()].filter((g) => g.isPlaying).map((g) => g.name) }); })()`));
await p.waitForTimeout(300); const canvas = await p.$('canvas'); await canvas!.screenshot({ path: `${OUT}/${TAG}.png` });
console.log('errors:', errs.length, errs.slice(0, 2));
await b.close();
