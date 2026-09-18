// _floor-diag — which meshes make the floor under the court, and how reflective are they? (Venice court reads amber under the dusk dome)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(10000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const rows = [];
  for (const m of s.meshes) { if (!m.isVisible || !m.isEnabled() || !m.getTotalVertices()) continue; const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
    if (mn.y > 0.6 || mx.y < -0.6) continue; if (mx.x - mn.x < 6 || mx.z - mn.z < 6) continue; if (mn.x > 2 || mx.x < -2 || mn.z > 2 || mx.z < -2) continue;
    const mat = m.material; rows.push({ name: m.name.slice(0, 36), parent: m.parent?.name?.slice(0, 26), cls: mat?.getClassName(), mat: mat?.name?.slice(0, 26), rough: mat?.roughness ?? mat?.specularPower, metal: mat?.metallic, env: mat?.environmentIntensity, emis: mat?.emissiveColor?.asArray().map(v => +v.toFixed(2)), size: [+(mx.x - mn.x).toFixed(1), +(mx.y - mn.y).toFixed(2), +(mx.z - mn.z).toFixed(1)], y: +mn.y.toFixed(3) }); }
  return JSON.stringify(rows); })()`));
await b.close();
