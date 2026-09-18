// One-off: is the Closet canvas alive? (context lost after the dev double mount → stale frame)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage(); const logs: string[] = []; p.on('console', (m) => { const t = m.text(); if (/context|lost|WebGL|closet/i.test(t)) logs.push(t.slice(0, 160)); });
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
console.log(await p.evaluate(`(async () => { const s = window.__FEL_PREVIEW__?.spawned; const eng = s.meshes[0].getEngine(); const c = eng.getRenderingCanvas(); const gl = c.getContext('webgl2') || c.getContext('webgl'); const f0 = eng.frameId; await new Promise((r) => setTimeout(r, 600)); const f1 = eng.frameId; return JSON.stringify({ sameCanvas: c === document.querySelector('canvas'), contextLost: gl ? gl.isContextLost() : 'no gl', framesIn600ms: f1 - f0, fps: +eng.getFps().toFixed(0), engineDisposed: eng.isDisposed, renderLoops: eng._activeRenderLoops.length }); })()`));
console.log('logs:', logs.slice(0, 5).join(' | ') || 'none');
await b.close();
