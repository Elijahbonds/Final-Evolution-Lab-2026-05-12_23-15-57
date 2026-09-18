// _map-box-diag — the offline flatten boxes (cut-scan-stands.py, file coords) in WORLD coords under the mounted map (MODE=dunk)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; const node = s.getTransformNodeByName('nexus_venue_map_venice-blue-court'); if (!node) return 'no map';
  const mesh = node.getChildMeshes(false)[0]; const M = mesh.getWorldMatrix().m; const tf = (x, y, z) => ({ x: M[0]*x + M[4]*y + M[8]*z + M[12], y: M[1]*x + M[5]*y + M[9]*z + M[13], z: M[2]*x + M[6]*y + M[10]*z + M[14] }); const out = [];
  for (const [x0, x1, z0, z1] of [[0.55, 0.98, -0.22, 0.22], [-0.98, -0.55, -0.22, 0.22]]) { const pts = [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].map(([x, z]) => tf(x, 0, z));
    out.push({ x: [Math.min(...pts.map(v => v.x)), Math.max(...pts.map(v => v.x))].map(v => +v.toFixed(2)), z: [Math.min(...pts.map(v => v.z)), Math.max(...pts.map(v => v.z))].map(v => +v.toFixed(2)), y: +pts[0].y.toFixed(3) }); }
  return JSON.stringify({ mapPos: node.position.asArray(), rotY: node.rotation.y, scale: node.scaling.x, meshPos: mesh.position.asArray(), boxes: out }); })()`).catch((e) => 'eval failed: ' + e.message));
await b.close();
