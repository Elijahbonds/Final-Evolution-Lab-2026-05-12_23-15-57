// WHY IS THE ROAD PALE? Measure, do not guess — this is the third time this session the obvious explanation
// was wrong. Reads the scene's fog and tone mapping, the tarmac material as the engine sees it, and the
// ACTUAL rendered pixel at a point on the road near the kart and far down the track.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto(`http://localhost:3061/dev/mode/velocitykart?map=${process.env.MAP ?? 'stadium-oval'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(11000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const hex = (c) => c ? '#' + [c.r,c.g,c.b].map((v)=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('') : '-';
  const mat = s.materials.find((m) => m.name === 'kart_tarmac');
  const ip = s.imageProcessingConfiguration || {};
  const canvas = s.getEngine().getRenderingCanvas();
  // sample the framebuffer: bottom-centre (road close) and just under the horizon (road far)
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const g = tmp.getContext('2d');
  g.drawImage(canvas, 0, 0);
  const at = (fx, fy) => { const d0 = g.getImageData(Math.round(canvas.width*fx), Math.round(canvas.height*fy), 1, 1).data; return '#' + [d0[0],d0[1],d0[2]].map((v)=>v.toString(16).padStart(2,'0')).join(''); };
  return JSON.stringify({
    fog: { mode: s.fogMode, density: s.fogDensity, start: s.fogStart, end: s.fogEnd, color: hex(s.fogColor) },
    tarmac: mat ? { cls: mat.getClassName(), albedo: hex(mat.albedoColor), emissive: hex(mat.emissiveColor), metallic: mat.metallic, roughness: mat.roughness, fog: mat.fogEnabled } : 'MISSING',
    tone: { exposure: ip.exposure, contrast: ip.contrast, toneMapping: ip.toneMappingEnabled, type: ip.toneMappingType, vignette: ip.vignetteEnabled },
    env: s.environmentTexture ? s.environmentIntensity : 'none',
    lights: s.lights.map((l) => l.getClassName() + ':' + l.intensity.toFixed(2) + ':' + hex(l.diffuse)),
    clear: hex(s.clearColor),
    pixels: { roadNear: at(0.5, 0.82), roadMid: at(0.5, 0.55), roadFar: at(0.5, 0.30) },
  }, null, 1);
})()`));
await b.close();
