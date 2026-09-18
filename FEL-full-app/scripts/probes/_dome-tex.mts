// _dome-tex — what does the backdrop dome's texture actually hold? mean RGB from the GPU, UV mapping, and a v-flip frame.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 80000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(async () => { const s = window.__FEL_DEV__.scene; const d = s.getMeshByName('bk_dome'); const m = d.material; const t = m.emissiveTexture; if (!t) return 'no tex';
  const px = await t.readPixels(); let r = 0, g = 0, bl = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 97) { r += px[i]; g += px[i+1]; bl += px[i+2]; n++; }
  const uv = d.getVerticesData('uv'); let vmin = 9, vmax = -9; for (let i = 1; i < uv.length; i += 2) { vmin = Math.min(vmin, uv[i]); vmax = Math.max(vmax, uv[i]); }
  return JSON.stringify({ tex: t.name, size: t.getSize(), mean: [r/n, g/n, bl/n].map(v => Math.round(v)), invertY: t.invertY, uScale: t.uScale, vScale: t.vScale, coordsIndex: t.coordinatesIndex, coordsMode: t.coordinatesMode, hasAlpha: t.hasAlpha, level: t.level, uvV: [vmin, vmax], matEmis: m.emissiveColor.toHexString(), useEmissiveAsIllum: m.useEmissiveAsIllumination, linkEmissiveWithDiffuse: m.linkEmissiveWithDiffuse, ambient: m.ambientColor?.toHexString(), unlit: m.disableLighting }); })()`));
await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.getMeshByName('bk_dome').material; m.emissiveTexture.vScale = -1; })()`); await p.waitForTimeout(600);
await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_domeflip.png` }); console.log('flip frame'); await b.close(); process.exit(0);
