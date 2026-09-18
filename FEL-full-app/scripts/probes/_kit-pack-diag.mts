// _kit-pack-diag — where did a kit-pack garment land? parent / skeleton / world centre vs the body's own kit mesh.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'derby'; const item = process.env.ITEM ?? 'top_baseball';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('console', (m) => { if (/FEL-KIT/.test(m.text())) console.log('console:', m.text().slice(0, 160)); });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene';
  const row = (m) => ({ name: m.name.slice(0, 40), parent: m.parent?.name?.slice(0, 30) ?? null, skel: m.skeleton?.name ?? null, bones: m.skeleton?.bones.length ?? 0, infl: m.numBoneInfluencers, visible: m.isVisible, centre: m.getBoundingInfo().boundingBox.centerWorld.asArray().map(v => +v.toFixed(2)), pos: m.position.asArray().map(v => +v.toFixed(2)), verts: m.getTotalVertices() });
  const packs = s.meshes.filter(m => m.name.includes('${item}')).map(row);
  const kits = s.meshes.filter(m => /^Kit_tops_top_bonds/.test(m.name)).map(row);
  const cam = s.activeCamera; const active = s.getActiveMeshes().data;
  const more = s.meshes.filter(m => m.name.includes('${item}')).map(m => ({ name: m.name.slice(0, 34), ready: m.isReady(true), matReady: m.material ? m.material.isReady(m) : null, mat: m.material?.name, alpha: m.material?.alpha, layer: m.layerMask, camLayer: cam.layerMask, rg: m.renderingGroupId, inActive: active.includes(m), enabled: m.isEnabled(), vis: m.visibility, ext: m.getBoundingInfo().boundingBox.extendSizeWorld.asArray().map(v => +v.toFixed(2)), inFrustum: cam.isInFrustum(m), skelReady: !!m.skeleton, bonesTex: m.skeleton?.isUsingTextureForMatrices, sub: m.subMeshes?.length }));
  const kitMore = s.meshes.filter(m => /^Kit_tops_top_bonds/.test(m.name)).map(m => ({ name: m.name.slice(0, 30), layer: m.layerMask, rg: m.renderingGroupId, always: m.alwaysSelectAsActiveMesh, ext: m.getBoundingInfo().boundingBox.extendSizeWorld.asArray().map(v => +v.toFixed(2)), bonesTex: m.skeleton?.isUsingTextureForMatrices }));
  return JSON.stringify({ packs, kits, more, kitMore }); })()`));
if (process.env.FORCE) {
  console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const out = []; for (const m of s.meshes.filter(m => m.name.includes('${item}'))) { m.alwaysSelectAsActiveMesh = true; m.refreshBoundingInfo(true); m.isVisible = true; m.visibility = 1; out.push(m.name.slice(0, 30)); } return 'forced ' + out.join(','); })()`));
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const rows = [];
    for (const m of s.meshes.filter(m => m.name.includes('${item}') || /^Kit_tops_top_bonds|^Body/.test(m.name))) { m.refreshBoundingInfo(true); const bb = m.getBoundingInfo().boundingBox;
      const wm = m.getWorldMatrix().asArray().map(v => +v.toFixed(2)); rows.push({ name: m.name.slice(0, 30), skinnedCentre: bb.centerWorld.asArray().map(v => +v.toFixed(2)), ext: bb.extendSizeWorld.asArray().map(v => +v.toFixed(2)), worldT: wm.slice(12, 15), worldScale: [wm[0], wm[5], wm[10]], skel: m.skeleton?.name, bonesN: m.skeleton?.bones.length, hasIdx: !!m.getVerticesData('matricesIndices'), hasW: !!m.getVerticesData('matricesWeights'), infl: m.numBoneInfluencers, useBones: m.useBones, cbus: m.computeBonesUsingShaders }); }
    return JSON.stringify(rows); })()`));
  await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_pack_forced.png` }); console.log('forced frame written');
}
await b.close();
