// why does the snow rider fall to the hard floor at spawn? (2026-09-22) — what is under the start, and what does a ray see
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://localhost:3011';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.goto(`${BASE}/dev/mode/snowboard_slalom?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
for (let i = 0; i < 60; i++) { const st = p.locator('text=/^START$/').first(); if (await st.count()) await st.click().catch(() => {}); const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.()); if (ok) break; await p.waitForTimeout(500); }
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const B = (window as any).BABYLON; const s = (window as any).__FEL_DEV__.scene;
  const h = (window as any).__FEL_DEV__.hero(); let hr = h; while (hr && hr.parent) hr = hr.parent; const hp = hr.getAbsolutePosition();
  const pistes = s.meshes.filter((m: any) => /piste/i.test(m.name)).map((m: any) => ({ name: m.name, pickable: m.isPickable, enabled: m.isEnabled(), pos: m.position.asArray().map((v: number) => +v.toFixed(2)), rot: m.rotation.asArray().map((v: number) => +v.toFixed(3)), bbMinY: +m.getBoundingInfo().boundingBox.minimumWorld.y.toFixed(2), bbMaxY: +m.getBoundingInfo().boundingBox.maximumWorld.y.toFixed(2), bbZ: [+m.getBoundingInfo().boundingBox.minimumWorld.z.toFixed(1), +m.getBoundingInfo().boundingBox.maximumWorld.z.toFixed(1)] }));
  const origin = hp.clone(); origin.y += 1.5;
  const Ray = B ? B.Ray : null;
  let anyHit = null, pisteHit = null;
  if (Ray) {
    const ray = new Ray(origin, new B.Vector3(0, -1, 0), 200);
    const a = s.pickWithRay(ray); anyHit = a && a.hit ? { mesh: a.pickedMesh?.name, y: +a.pickedPoint.y.toFixed(2) } : 'none';
    const pk = s.pickWithRay(ray, (m: any) => /piste/i.test(m.name)); pisteHit = pk && pk.hit ? { mesh: pk.pickedMesh?.name, y: +pk.pickedPoint.y.toFixed(2) } : 'none';
  }
  const grounds = s.meshes.filter((m: any) => /ground|floor|snow/i.test(m.name)).slice(0, 8).map((m: any) => `${m.name} y${m.position.y.toFixed(2)} pick${m.isPickable}`);
  return { hero: hp.asArray().map((v: number) => +v.toFixed(2)), pistes, anyHit, pisteHit, grounds, hasBABYLON: !!B };
});
console.log(JSON.stringify(r, null, 1)); await b.close();
