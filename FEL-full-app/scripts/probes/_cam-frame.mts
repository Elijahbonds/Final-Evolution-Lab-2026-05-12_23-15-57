// _cam-frame — measure the hero's on-screen height as a fraction of the viewport (the cameraPresets.json metric).
// The hero is the skinned character whose root is nearest the active camera's target. Samples over ~3 s.
//   URL=http://localhost:3000/dev/mode/dunk npx tsx scripts/probes/_cam-frame.mts
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(Number(process.env.WAIT_MS ?? 8000));
const samples: number[] = [];
for (let i = 0; i < 6; i++) {
  const r = await p.evaluate(`(() => {
    const d = window.__FEL_DEV__; if (!d) return null; const s = d.scene; const cam = s.activeCamera; if (!cam) return null;
    const roots = new Map();
    // prefer the harness's own hero handle when the dev object exposes it (phase 6); else the character nearest the camera target
    const heroRoot = d.hero ? (typeof d.hero === 'function' ? d.hero() : d.hero) : null;
    for (const m of s.meshes) { if (!m.skeleton || !m.isVisible || !m.isEnabled()) continue; let r = m; while (r.parent) r = r.parent; const arr = roots.get(r) ?? []; arr.push(m); roots.set(r, arr); }
    if (!roots.size) return { err: 'no skinned meshes' };
    const target = cam.getTarget ? cam.getTarget() : cam.target ?? cam.position;
    let best = null, bestD = Infinity;
    if (heroRoot) { for (const [r, meshes] of roots) { let q = heroRoot; while (q && q !== r) q = q.parent; if (q === r || r === heroRoot) { best = meshes; bestD = 0; break; } } }
    if (!best) for (const [r, meshes] of roots) { const pos = r.getAbsolutePosition ? r.getAbsolutePosition() : r.position; const dd = (pos.x - target.x) ** 2 + (pos.z - target.z) ** 2; if (dd < bestD) { bestD = dd; best = meshes; } }
    const engine = s.getEngine(); const W = engine.getRenderWidth(), H = engine.getRenderHeight();
    const tf = s.getTransformMatrix();
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const m of best) { m.refreshBoundingInfo(true); const bb = m.getBoundingInfo().boundingBox; const M = tf.m; for (const v of bb.vectorsWorld) { const cx = M[0] * v.x + M[4] * v.y + M[8] * v.z + M[12], cy = M[1] * v.x + M[5] * v.y + M[9] * v.z + M[13], cw = M[3] * v.x + M[7] * v.y + M[11] * v.z + M[15]; if (cw <= 0) continue; const sx = (cx / cw * 0.5 + 0.5) * W, sy = (1 - (cy / cw * 0.5 + 0.5)) * H; minY = Math.min(minY, sy); maxY = Math.max(maxY, sy); minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); } }
    const hp = heroRoot ? (heroRoot.getAbsolutePosition ? heroRoot.getAbsolutePosition() : heroRoot.position) : null; const camDist = hp ? +Math.hypot(cam.position.x - hp.x, cam.position.y - hp.y, cam.position.z - hp.z).toFixed(2) : null;
    return { mode: d.modeId, viaHero: !!(heroRoot && bestD === 0), camDist, camY: +cam.position.y.toFixed(2), cam: cam.name, type: cam.getClassName(), H, px: Math.round(maxY - minY), fraction: +((maxY - minY) / H).toFixed(3), cx: Math.round((minX + maxX) / 2 / W * 100) / 100, roots: roots.size, radius: cam.radius ?? null };
  })()`);
  if (r && !(r as { err?: string }).err) samples.push((r as { fraction: number }).fraction);
  if (i === 0) console.log(JSON.stringify(r));
  await p.waitForTimeout(500);
}
samples.sort((a, b) => a - b);
console.log(`fraction samples: ${samples.join(' ')} · median ${samples[Math.floor(samples.length / 2)] ?? 'n/a'}`);
await b.close();
