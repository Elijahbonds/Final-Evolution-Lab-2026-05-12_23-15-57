// _aero-scene-diag — fog, terrain, camera vs plane on a live Aero Aces circuit (dev).
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await p.goto(`${BASE}/dev/mode/aeroaces?agent=1&map=${process.env.MAP ?? 'redrock-canyon'}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space'); await p.waitForTimeout(5000);
const r = await p.evaluate(() => {
  const W = window as any; const s = W.__FEL_DEV__.scene; const cam = s.activeCamera; const hero = W.__FEL_DEV__.hero();
  const terr = s.meshes.find((m: any) => /aero_terrain/.test(m.name));
  const bb = terr?.getBoundingInfo().boundingBox;
  const big = s.meshes.filter((m: any) => m.isEnabled() && m.isVisible).map((m: any) => { const b = m.getBoundingInfo().boundingBox; return { n: m.name, size: +Math.max(b.maximumWorld.x - b.minimumWorld.x, b.maximumWorld.z - b.minimumWorld.z).toFixed(0) }; }).filter((m: any) => m.size > 400);
  return {
    fog: { mode: s.fogMode, density: s.fogDensity, start: s.fogStart, end: s.fogEnd, color: s.fogColor?.toHexString?.() },
    cam: { pos: cam.position.asArray().map((v: number) => +v.toFixed(1)), target: cam.getTarget?.().asArray().map((v: number) => +v.toFixed(1)), maxZ: cam.maxZ, minZ: cam.minZ, fov: cam.fov },
    hero: hero ? { pos: hero.position.asArray().map((v: number) => +v.toFixed(1)), rotY: +hero.rotation.y.toFixed(2) } : null,
    terrain: terr ? { enabled: terr.isEnabled(), visible: terr.isVisible, verts: terr.getTotalVertices(), min: bb.minimumWorld.asArray().map((v: number) => +v.toFixed(0)), max: bb.maximumWorld.asArray().map((v: number) => +v.toFixed(0)), mat: terr.material?.name, alpha: terr.material?.alpha } : null,
    big, clear: s.clearColor?.toHexString?.(),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
