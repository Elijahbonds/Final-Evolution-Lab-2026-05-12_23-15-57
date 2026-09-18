// One-off: bone matrices → GPU. Shoot as is, with the bone texture off, with CPU skinning. (dev-only ?hero=)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '', OUT = process.env.OUT_DIR ?? 'docs/shots/tones';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage();
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
const canvas = await p.$('canvas');
await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; s.root.rotation.y = 0; })()`);
await p.waitForTimeout(300); await canvas!.screenshot({ path: `${OUT}/cand-A-asis.png` });
console.log('A', await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; const sk = s.skeleton; const eng = s.meshes[0].getEngine(); return JSON.stringify({ tex: sk.useTextureToStoreBoneMatrices, caps: { float: eng.getCaps().textureFloat, floatRender: eng.getCaps().textureFloatRender }, bones: sk.bones.length, matricesLen: sk.getTransformMatrices(s.meshes[1]).length, inScene: s.meshes[1].getScene().skeletons.includes(sk) }); })()`));
await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; s.skeleton.useTextureToStoreBoneMatrices = false; })()`);
await p.waitForTimeout(500); await canvas!.screenshot({ path: `${OUT}/cand-B-notex.png` });
await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; for (const m of s.meshes) m.computeBonesUsingShaders = false; })()`);
await p.waitForTimeout(500); await canvas!.screenshot({ path: `${OUT}/cand-C-cpu.png` });
await b.close();
