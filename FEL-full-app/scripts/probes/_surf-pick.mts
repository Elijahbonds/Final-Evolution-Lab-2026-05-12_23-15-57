// _surf-pick — which meshes cover given screen points on /dev/mode/surf (a multi-pick through translucent layers).
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/surf`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(2000); await p.keyboard.press('Space');
for (const wait of [3000, 5500]) {
  await p.waitForTimeout(wait);
  const r = await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const e = s.getEngine(); const sx = e.getRenderWidth() / window.innerWidth, sy = e.getRenderHeight() / window.innerHeight;
    const out = {}; for (const [x, y] of [[640, 520], [300, 520], [640, 380], [640, 650]]) {
      const hits = s.multiPick(x * sx, y * sy, (m) => m.isVisible && m.isEnabled()) || [];
      out[x + ',' + y] = hits.slice(0, 5).map((h) => h.pickedMesh.name + '(' + (h.pickedMesh.material ? h.pickedMesh.material.name + ' a' + (+(h.pickedMesh.material.alpha ?? 1)).toFixed(2) + ' v' + h.pickedMesh.visibility.toFixed(2) : '-') + ') d' + h.distance.toFixed(1));
    }
    const c = s.activeCamera; return { cam: [c.position.x, c.position.y, c.position.z].map((n) => +n.toFixed(1)), out }; })()`);
  console.log(wait, JSON.stringify(r));
}
await b.close();
