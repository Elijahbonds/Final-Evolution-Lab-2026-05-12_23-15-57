// CLOTHING-ALONE inspect (2026-09-14): what the dunk hero wears — every child mesh, its skeleton, weights, visibility.
//   PORT=3061 QS=body=male npx tsx scripts/probes/_clothing-inspect.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', QS = process.env.QS ?? 'body=male', MODE = process.env.MODE ?? 'dunk';
(async () => {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('console', (m) => { const t = m.text(); if (/FEL-KIT|FEL-IDENT|error/i.test(t)) console.log('  [console]', t.slice(0, 200)); });
  await p.goto(`http://localhost:${PORT}/dev/mode/${MODE}?${QS}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForTimeout(3000);
  const out = await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, h = dev.hero();
    const rows = [];
    const skels = new Set();
    for (const m of h.getChildMeshes(false)) {
      if (m.skeleton) skels.add(m.skeleton);
      const idx = m.getVerticesData && m.getVerticesData('matricesIndices');
      const w = m.getVerticesData && m.getVerticesData('matricesWeights');
      let bones = null;
      if (idx && w && m.skeleton) { const cnt = {}; for (let i = 0; i < w.length; i++) if (w[i] > 0.05) { const n = m.skeleton.bones[idx[i]]?.name ?? idx[i]; cnt[n] = (cnt[n] || 0) + 1; } bones = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + v).join(' '); }
      rows.push({ name: m.name, vis: m.isVisible, en: m.isEnabled(), verts: m.getTotalVertices(), skel: m.skeleton ? m.skeleton.name + '#' + m.skeleton.uniqueId : null, infl: m.numBoneInfluencers, parent: m.parent?.name, mat: m.material?.name, zOff: m.material?.zOffset, fix: m.metadata?.felGarmentFix, bones, instanced: m.getClassName() });
    }
    return { root: h.name, url: h.metadata, skeletons: [...skels].map((s) => s.name + '#' + s.uniqueId + ' bones ' + s.bones.length), rows };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
