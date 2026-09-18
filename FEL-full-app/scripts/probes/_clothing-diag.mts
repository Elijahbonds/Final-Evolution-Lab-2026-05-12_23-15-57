// CLOTHING-ALONE diag (2026-09-14): standing closeups of the garments with live material variants (the render loop keeps running).
//   PORT=3061 QS=body=male AIM=Hips npx tsx scripts/probes/_clothing-diag.mts
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', QS = process.env.QS ?? 'body=male', OUT = process.env.OUT_DIR ?? 'docs/shots/clothing-alone', TAG = process.env.TAG ?? 'diag';
mkdirSync(OUT, { recursive: true });
const PAGE = readFileSync(new URL('./_clothing-alone-page.js', import.meta.url), 'utf8');
const VARIANTS: Record<string, string> = JSON.parse(process.env.VARIANTS ?? '{}');
(async () => {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk?${QS}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  await p.evaluate(PAGE);
  await p.evaluate(`window.__cla.aim = ${JSON.stringify(process.env.AIM ?? 'Hips')}; window.__cla.aimDist = ${Number(process.env.AIM_DIST ?? 1.3)}; window.__cla.ref(); window.__cla.setGrid(true)`);
  console.log(await p.evaluate(process.env.INFO ?? `(() => { const d = window.__FEL_DEV__, e = d.scene.getEngine(); const h = d.hero(); return JSON.stringify({ reverseDepth: e.useReverseDepthBuffer, depthBits: e._caps && e.getCaps().depthTextureExtension, minZ: d.scene.activeCamera.minZ, maxZ: d.scene.activeCamera.maxZ, mats: h.getChildMeshes(false).filter((m) => /^(Kit|Body)/.test(m.name) && m.isVisible).map((m) => { const t = m.material; const at = t.albedoTexture; return { m: m.name, mat: t.name, cls: t.getClassName(), alpha: t.alpha, mode: t.transparencyMode, blend: t.needAlphaBlending(), test: t.needAlphaTesting(), cut: t.alphaCutOff, texAlpha: at ? at.hasAlpha : null, fromTex: t.useAlphaFromAlbedoTexture, opac: !!t.opacityTexture, zOff: t.zOffset, zOffU: t.zOffsetUnits, depthFn: t.depthFunction, disableDepthWrite: t.disableDepthWrite, forceDepthWrite: t.forceDepthWrite, needDepthPrePass: t.needDepthPrePass, sep: t.separateCullingPass, cull: t.backFaceCulling, rg: m.renderingGroupId, aIdx: m.alphaIndex }; }) }); })()`));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${TAG}-base.png` });
  for (const [k, js] of Object.entries(VARIANTS)) {
    await p.evaluate(`(() => { const h = window.__FEL_DEV__.hero(); const kit = h.getChildMeshes(false).filter((m) => /^Kit/.test(m.name) && m.isVisible); const body = h.getChildMeshes(false).find((m) => /^Body/.test(m.name)); ${js} })()`);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${TAG}-${k}.png` });
  }
  await b.close();
})();
