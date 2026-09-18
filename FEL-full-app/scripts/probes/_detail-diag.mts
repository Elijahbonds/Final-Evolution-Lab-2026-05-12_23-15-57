// _detail-diag — does the venue floor carry the Pass 7 grain (PBR detail map), and what covers it? (MODE=golf|skateboard…)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'golf';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(10000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const rows = [];
  for (const m of s.meshes) { if (!m.getTotalVertices()) continue; const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
    if (mx.x - mn.x < 8 || mx.z - mn.z < 8 || mx.y - mn.y > 1.5) continue; const mat = m.material; const dm = mat?.detailMap;
    rows.push({ name: m.name.slice(0, 30), vis: m.isVisible && m.isEnabled(), cls: mat?.getClassName(), mat: mat?.name?.slice(0, 24), albedoTex: mat?.albedoTexture?.name?.slice(0, 28), detail: dm ? { on: dm.isEnabled, tex: dm.texture?.name, ready: dm.texture?.isReady?.(), u: dm.texture?.uScale, blend: dm.diffuseBlendLevel } : null, y: +mn.y.toFixed(2), size: [+(mx.x - mn.x).toFixed(0), +(mx.z - mn.z).toFixed(0)] }); }
  return JSON.stringify(rows); })()`));
await b.close();
