// _south-key-diag — what stands on the court's south key (z 4..14)? names, parents, sizes.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 80000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const rows = [];
  for (const m of s.meshes) { if (!m.isVisible || !m.isEnabled() || !m.getTotalVertices()) continue; const bb = m.getBoundingInfo().boundingBox; const c = bb.centerWorld, e = bb.extendSizeWorld;
    if (c.z < 12 || c.z > 30 || Math.abs(c.x) > 14 || e.length() < 0.8) continue; if (/^Body|^Kit_|Hair_|eyes|grass_large|^vb_apron|^vb_grass|^vb_sand|^vb_walk|^Mesh_0$|^vb_sea|^vb_court_logo/.test(m.name)) continue;
    const chain = []; let q = m.parent; while (q && chain.length < 3) { chain.push(q.name.slice(0, 26)); q = q.parent; }
    rows.push({ name: m.name.slice(0, 28), chain: chain.join('<'), c: c.asArray().map(v => +v.toFixed(1)), size: e.scale(2).asArray().map(v => +v.toFixed(1)), tris: m.getTotalIndices() / 3 | 0 }); }
  return JSON.stringify(rows.slice(0, 20)); })()`));
await b.close(); process.exit(0);
