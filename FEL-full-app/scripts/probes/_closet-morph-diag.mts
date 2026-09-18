// One-off: are the candidate's morph deltas sane? Zero them, shoot; drive one, shoot. (dev-only ?hero=)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '', OUT = process.env.OUT_DIR ?? 'docs/shots/tones';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage();
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
const state = await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; const m = s.meshes.find((x) => x.morphTargetManager); const mm = m.morphTargetManager; const out = []; for (let i = 0; i < mm.numTargets; i++) { const t = mm.getTarget(i); const pos = t.getPositions(); let maxd = 0, n = 0; const base = m.getVerticesData('position'); for (let k = 0; k < pos.length; k += 3) { const d = Math.hypot(pos[k] - base[k], pos[k+1] - base[k+1], pos[k+2] - base[k+2]); if (d > 1e-5) n++; if (d > maxd) maxd = d; } out.push({ name: t.name, influence: +t.influence.toFixed(2), movedVerts: n, maxDelta: +maxd.toFixed(3) }); } return JSON.stringify({ mesh: m.name, verts: m.getTotalVertices(), targets: out }); })()`);
console.log('morphs:', state);
const canvas = await p.$('canvas');
await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; for (const m of s.meshes) { const mm = m.morphTargetManager; if (mm) for (let i = 0; i < mm.numTargets; i++) mm.getTarget(i).influence = 0; } })()`);
await p.waitForTimeout(400); await canvas!.screenshot({ path: `${OUT}/cand-morph0.png` });
await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; for (const m of s.meshes) { const mm = m.morphTargetManager; if (mm) { mm.getTarget(0).influence = 1; } } })()`);
await p.waitForTimeout(400); await canvas!.screenshot({ path: `${OUT}/cand-morph-first.png` });
await b.close();
