// One-off: how many engines / scenes / heroes are alive on the Closet page? (dev double mount suspect)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage(); const logs: string[] = []; p.on('console', (m) => { const t = m.text(); if (/FEL-CHAR|FEL-ANIM\] authored|closet|SkinningGuard|FEL-SKIN/.test(t)) logs.push(t.slice(0, 120)); });
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; const eng = s.meshes[0].getEngine(); const Engine = eng.constructor; const inst = Engine.Instances || (Engine.EngineStore && Engine.EngineStore.Instances) || []; const scene = s.meshes[0].getScene(); return JSON.stringify({ canvases: document.querySelectorAll('canvas').length, engines: inst.length, scenesOnThisEngine: eng.scenes.length, renderLoops: eng._activeRenderLoops ? eng._activeRenderLoops.length : null, skeletonsInScene: scene.skeletons.length, meshesInScene: scene.meshes.length, skinnedInScene: scene.meshes.filter((m) => m.skeleton).length, heroRoots: scene.transformNodes.filter((n) => /__root__/.test(n.name)).length, engineDisposed: eng.isDisposed, sceneSameAsPreview: window.__FEL_PREVIEW__.scene === scene, previewSceneDisposed: window.__FEL_PREVIEW__.scene.isDisposed }); })()`));
console.log('logs:', logs.filter((l) => /authored|spawn|preview/.test(l)).length, logs.slice(0, 6).join(' | '));
await b.close();
