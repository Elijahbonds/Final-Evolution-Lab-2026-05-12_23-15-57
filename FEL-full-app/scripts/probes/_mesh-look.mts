// _mesh-look — what is that mesh actually made of? (scorecard visuals, 2026-09-15)
//
// A frame review says "a flat white blob" and the source says `#35a352`. One of them is wrong about what reaches the
// screen, and the argument is settled by asking the live scene: the mesh's material class, its albedo, its emissive,
// whether its normals face the sky, and whether anything is culling it.
//   BASE=http://127.0.0.1:3098 ROUTE='/dev/mode/golf?agent=1' NAMES=green,hole,pinFlag npx tsx scripts/probes/_mesh-look.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const ROUTE = process.env.ROUTE ?? '/dev/mode/golf?agent=1';
const NAMES = (process.env.NAMES ?? '').split(',').filter(Boolean);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await p.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
const t0 = Date.now();
while (Date.now() - t0 < 180000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await p.waitForTimeout(500); }
await p.waitForTimeout(2500);
const out = await p.evaluate(`(() => {
  const s = (window.__FEL_QA__ && window.__FEL_QA__.scene && window.__FEL_QA__.scene()) || null;
  if (!s) return { error: 'no scene handle' };
  const want = ${JSON.stringify(NAMES)};
  const rows = [];
  for (const m of s.meshes) {
    if (want.length && !want.some((w) => m.name.includes(w))) continue;
    const mat = m.material;
    const col = (c) => (c ? [+c.r.toFixed(3), +c.g.toFixed(3), +c.b.toFixed(3)] : null);
    let nrm = null;
    try {
      const n = m.getVerticesData && m.getVerticesData('normal');
      if (n && n.length >= 3) { const w = m.getWorldMatrix(); const v = BABYLON ? null : null; nrm = [+n[0].toFixed(2), +n[1].toFixed(2), +n[2].toFixed(2)]; }
    } catch {}
    rows.push({
      name: m.name, enabled: m.isEnabled(), visible: m.isVisible, vis: m.visibility,
      y: +m.getAbsolutePosition().y.toFixed(3),
      rotX: +(m.rotation ? m.rotation.x.toFixed(3) : 0),
      matClass: mat ? mat.getClassName() : null,
      albedo: mat && mat.albedoColor ? col(mat.albedoColor) : null,
      diffuse: mat && mat.diffuseColor ? col(mat.diffuseColor) : null,
      emissive: mat && mat.emissiveColor ? col(mat.emissiveColor) : null,
      metallic: mat && mat.metallic != null ? mat.metallic : null,
      roughness: mat && mat.roughness != null ? mat.roughness : null,
      cull: mat ? mat.backFaceCulling : null,
      normal0: nrm,
    });
  }
  return { env: { intensity: s.environmentIntensity, texture: !!s.environmentTexture, fogMode: s.fogMode, fogDensity: s.fogDensity, exposure: s.imageProcessingConfiguration && s.imageProcessingConfiguration.exposure, tone: s.imageProcessingConfiguration && s.imageProcessingConfiguration.toneMappingEnabled }, rows };
})()`);
await p.screenshot({ path: '/tmp/mesh-look.png' });
await b.close();
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
