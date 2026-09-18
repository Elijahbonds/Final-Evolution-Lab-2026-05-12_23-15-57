// WHAT IS THE PLAYER ACTUALLY LOOKING AT? Every visible mesh wider than 4 m, with its material and the
// colour it resolves to — a mode whose road reads as pale sky is a mode where something else is the road.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto(`http://localhost:3061/dev/mode/${process.env.MODE ?? 'velocitykart'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 }); await p.waitForTimeout(11000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const hex = (c) => c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('') : '-';
  const rows = [];
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue;
    const bb = m.getBoundingInfo().boundingBox;
    const size = bb.maximumWorld.subtract(bb.minimumWorld);
    if (Math.max(size.x, size.z) < 4) continue;
    const mat = m.material;
    rows.push([
      m.name, 'size ' + [size.x, size.y, size.z].map((v) => v.toFixed(1)).join('x'),
      'y ' + m.getAbsolutePosition().y.toFixed(2),
      mat ? mat.getClassName() + ' ' + mat.name : 'NO MATERIAL',
      'diffuse ' + hex(mat && mat.diffuseColor), 'albedo ' + hex(mat && mat.albedoColor),
      'emissive ' + hex(mat && mat.emissiveColor),
      (mat && mat.disableLighting) ? 'UNLIT' : '',
      (mat && (mat.diffuseTexture || mat.albedoTexture)) ? 'textured' : 'flat',
    ].join(' | '));
  }
  return rows.join('\\n') + '\\nambient ' + hex(s.ambientColor) + '  clear ' + hex(s.clearColor)
    + '  env ' + (s.environmentTexture ? 'yes intensity ' + s.environmentIntensity : 'none')
    + '  lights ' + s.lights.map((l) => l.getClassName() + ':' + l.intensity.toFixed(2)).join(',');
})()`));
await b.close();
