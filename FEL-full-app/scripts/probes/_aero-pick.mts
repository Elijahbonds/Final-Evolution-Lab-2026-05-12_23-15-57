// _aero-pick — what mesh is under a few screen points on a live circuit (dev), plus the terrain's material state.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await p.goto(`${BASE}/dev/mode/aeroaces?agent=1&map=${process.env.MAP ?? 'redrock-canyon'}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const W = window as any; const s = W.__FEL_DEV__.scene;
  const out: any = {};
  for (const [x, y] of [[640, 760], [640, 650], [200, 700], [1000, 700], [640, 450]]) {
    const hit = s.pick(x * (s.getEngine().getRenderWidth() / 1280), y * (s.getEngine().getRenderHeight() / 800), () => true);
    out[`${x},${y}`] = hit?.hit ? `${hit.pickedMesh.name} d${hit.distance.toFixed(0)} y${hit.pickedPoint.y.toFixed(1)}` : 'none';
  }
  const t = s.meshes.find((m: any) => /aero_terrain/.test(m.name));
  const m = t.material;
  out.terrain = { vis: t.isVisible, en: t.isEnabled(), layer: t.layerMask, rg: t.renderingGroupId, alpha: m.alpha, tmode: m.transparencyMode, needsAlpha: m.needAlphaBlending?.(), backFace: m.backFaceCulling, frozen: m.isFrozen, ready: t.isReady(true), matReady: m.isReady(t), tex: m.albedoTexture ? { name: m.albedoTexture.name, ready: m.albedoTexture.isReady() } : null, onlyTri: t.getTotalIndices(), active: s.getActiveMeshes().data.includes(t), hasColors: t.isVerticesDataPresent('color') };
  out.cam = s.activeCamera.position.asArray().map((v: number) => +v.toFixed(1));
  const dome = s.getMeshByName('bk_dome'); out.dome = dome ? { pos: dome.position.asArray().map((v: number) => +v.toFixed(0)), sc: dome.scaling.x, rg: dome.renderingGroupId, inf: dome.infiniteDistance } : null;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
