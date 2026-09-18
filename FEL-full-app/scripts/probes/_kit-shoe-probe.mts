// _kit-shoe-probe — per-sport kit defaults (owner decision 2026-09-05): open a dev-harness mode and measure every
// Kit_ garment on the hero — visibility, world bounding box (skeleton applied), bind-pose vertex Y range, material
// read (class, albedo, roughness, metallic, emissive, texture) — plus the ankle/knee bone heights, so the shoe fix
// can be measured before and after instead of eyeballed.
//   URL=http://localhost:3006/dev/mode/karate npx tsx scripts/probes/_kit-shoe-probe.mts
//   LOGIN=1 carries the playtest session (closet picks win); WAIT_MS tunes the settle time.
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3006/dev/mode/karate';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
if (process.env.LOGIN === '1') {
  const origin = new URL(URL_).origin; const rc = ctx.request;
  const csrf = (await (await rc.get(`${origin}/api/auth/csrf`)).json()).csrfToken as string;
  await rc.post(`${origin}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
}
const p = await ctx.newPage();
p.on('console', (m) => { if (/FEL-KIT|FEL-IDENT|error/i.test(m.text())) console.log('  console:', m.text().slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(Number(process.env.WAIT_MS ?? 9000));
await p.getByText(/^START$/).first().click({ force: true }).catch(() => {}); await p.waitForTimeout(2500);
console.log(await p.evaluate(`(() => {
  const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__ (production build?)';
  const hero = d.hero ? d.hero() : null; if (!hero) return 'no hero yet';
  const f = (v) => Math.round(v * 1000) / 1000;
  const hex = (c) => c ? c.toHexString() : null;
  const meshes = hero.getChildMeshes();
  const rows = [];
  for (const m of meshes) {
    if (!/^(Kit_|KitSole_|Body|Skin)/.test(m.name)) continue;
    m.refreshBoundingInfo(true);
    const bb = m.getBoundingInfo().boundingBox;
    const pos = m.getVerticesData('position'); let lo = Infinity, hi = -Infinity;
    if (pos) for (let i = 1; i < pos.length; i += 3) { if (pos[i] < lo) lo = pos[i]; if (pos[i] > hi) hi = pos[i]; }
    const mat = m.material;
    rows.push({ mesh: m.name, visible: m.isVisible && m.isEnabled(), verts: m.getTotalVertices(), skinned: !!m.skeleton, scaleY: f(m.scaling.y),
      world: { minY: f(bb.minimumWorld.y), maxY: f(bb.maximumWorld.y), h: f(bb.maximumWorld.y - bb.minimumWorld.y) },
      bind: { minY: f(lo), maxY: f(hi) },
      mat: mat ? { name: mat.name, cls: mat.getClassName(), albedo: hex(mat.albedoColor ?? mat.diffuseColor), rough: mat.roughness, metal: mat.metallic, emissive: hex(mat.emissiveColor), tex: mat.albedoTexture ? mat.albedoTexture.name : null, felShaded: !!(mat.metadata && mat.metadata.felShaded) } : null,
      fix: (m.metadata && m.metadata.felGarmentFix) || (m.metadata && m.metadata.felSoleOf && ('sole of ' + m.metadata.felSoleOf)) || null });
  }
  const skinned = meshes.find((m) => m.skeleton); const skel = skinned && skinned.skeleton;
  const bones = skel ? skel.bones.filter((bn) => /Foot|Leg|Toe|Hips/i.test(bn.name)).map((bn) => { const n = bn.getTransformNode(); const p = n ? n.getAbsolutePosition() : bn.getAbsolutePosition(skinned); return { bone: bn.name, y: f(p.y) }; }) : null;
  // every kit shoe in the scene that is NOT the hero's (partner, rivals on the kit body): did its boot fold too?
  const others = d.scene.meshes.filter((m) => /^(Kit_shoes|KitSole)/.test(m.name) && !m.isDescendantOf(hero) && m.isVisible).map((m) => { m.refreshBoundingInfo(true); const bb = m.getBoundingInfo().boundingBox; return { mesh: m.name, top: f(bb.maximumWorld.y), h: f(bb.maximumWorld.y - bb.minimumWorld.y), fix: (m.metadata && (m.metadata.felGarmentFix || m.metadata.felSoleOf)) || null }; });
  return JSON.stringify({ mode: d.modeId, felModeId: d.scene.metadata && d.scene.metadata.felModeId, heroY: f(hero.position.y), rows, bones, others }, null, 1);
})()`));
await b.close();
