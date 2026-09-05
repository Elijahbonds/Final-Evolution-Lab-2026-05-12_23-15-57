// _garment-alpha — why do the tee and the court short read "torn"? Reads the shown top/short materials on a dev-mode
// harness: alpha mode, texture alpha flag, culling, depth offset.   MODE=karate npx tsx scripts/probes/_garment-alpha.mts
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'karate';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(5000);
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__'; const hero = d.hero ? d.hero() : null; if (!hero) return 'no hero';
  const root = hero.root ?? hero.mesh ?? hero.node ?? hero; const meshes = hero.meshes ?? (root.getChildMeshes ? root.getChildMeshes() : []);
  const rows = []; for (const m of meshes) { if (!/Kit_(tops|shorts)/.test(m.name) || !m.isVisible) continue; const mat = m.material; if (!mat) continue; const t = mat.albedoTexture ?? mat.diffuseTexture;
    rows.push({ mesh: m.name.slice(0, 30), mat: mat.name.slice(0, 30), alpha: mat.alpha, tMode: mat.transparencyMode, blend: mat.needAlphaBlending(), test: mat.needAlphaTesting(), texHasAlpha: t ? t.hasAlpha : null, useAlphaFromTex: mat.useAlphaFromAlbedoTexture, cutOff: mat.alphaCutOff, cull: mat.backFaceCulling, zOff: mat.zOffset, verts: m.getTotalVertices(), heroMeshCount: meshes.length }); }
  return JSON.stringify(rows); })()`));
if (process.env.STRIP) {
  // A/B: strip the albedo textures off the shown top and short and look again — patches that vanish were paint
  await p.evaluate(`(() => { const d = window.__FEL_DEV__; const hero = d.hero(); const root = hero.root ?? hero.mesh ?? hero.node ?? hero; const meshes = hero.meshes ?? root.getChildMeshes();
    for (const m of meshes) { if (!/Kit_(tops|shorts)/.test(m.name) || !m.isVisible || !m.material) continue; const mat = m.material.clone(m.material.name + '_strip'); mat.albedoTexture = null; mat.albedoColor = m.name.includes('tops') ? { r: 0.92, g: 0.92, b: 0.9 } : { r: 0.12, g: 0.12, b: 0.14 }; m.material = mat; } })()`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_strip.png` });
  console.log('stripped frame written');
}
await b.close();
