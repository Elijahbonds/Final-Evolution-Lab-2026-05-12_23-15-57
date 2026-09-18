// ROSTER FIDELITY — how different are the hero and the bodies standing next to him, in the same frame?
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'onevone';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
// THE TIER IS DECIDED BY THE CANVAS. detectQualityTier reads the backing-pixel budget, so a small probe
// viewport silently tests the MOBILE path — which loads a different hero. Default big enough to be desktop.
const W = Number(process.env.W ?? 1600), H = Number(process.env.H ?? 1000);
const p = await b.newPage({ viewport: { width: W, height: H } });
const loaded: string[] = [];
p.on('request', (r) => { const u = r.url(); if (/\.glb(\?|$)/.test(u)) loaded.push(u.split('/').pop()!.split('?')[0]); });
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(12000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
const out = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const bodies = [];
  for (const sk of s.skeletons) {
    const meshes = s.meshes.filter(m => m.skeleton === sk && m.getTotalVertices() > 0);
    const tris = meshes.reduce((t, m) => t + (m.getTotalIndices() / 3), 0);
    const verts = meshes.reduce((t, m) => t + m.getTotalVertices(), 0);
    if (verts > 0) bodies.push({ bones: sk.bones.length, tris: Math.round(tris), verts, parts: meshes.length });
  }
  bodies.sort((a, b) => b.tris - a.tris);
  // texture memory, the thing the hero's own comment calls out at 96 MB
  let texBytes = 0; const bigTex = [];
  for (const t of s.textures) {
    const sz = t.getSize ? t.getSize() : null;
    if (!sz || !sz.width) continue;
    const bytes = sz.width * sz.height * 4 * 1.33;      // rgba + mips
    texBytes += bytes;
    if (bytes > 4e6) bigTex.push((t.name || '?').slice(0, 28) + ' ' + sz.width + 'x' + sz.height);
  }
  return { tier: s.metadata && s.metadata.felTier, bodies: bodies.length, top: bodies.slice(0, 3),
           totalTris: Math.round(bodies.reduce((t, x) => t + x.tris, 0)),
           texMB: Math.round(texBytes / 1048576), bigTextures: bigTex.slice(0, 8) };
})()`);
console.log(MODE, JSON.stringify(out));
console.log('glb loaded:', [...new Set(loaded)].join(' '));
await b.close();
