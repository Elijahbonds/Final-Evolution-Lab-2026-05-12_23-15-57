// Court locations — is the scanned court mounted under a location, and which way do Babylon's clip planes cut?
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(process.env.URL ?? 'http://localhost:3000/dev/mode/dunk?location=blossom', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
const out = await p.evaluate(`(() => {
  const sc = window.__FEL_DEV__?.scene; if (!sc) return 'no scene';
  const m = sc.getMeshByName('Mesh_0'); if (!m) return 'no Mesh_0';
  const mat = m.material; const active = sc.getActiveMeshes().data.slice(0, sc.getActiveMeshes().length).some((x) => x === m);
  const tex = mat && (mat.albedoTexture || mat.diffuseTexture || mat.emissiveTexture);
  return JSON.stringify({ name: m.name, active, enabled: m.isEnabled(), visible: m.isVisible, vis: m.visibility, indices: m.getTotalIndices(), inFrustum: m.isInFrustum(sc.frustumPlanes || sc.activeCamera.getViewMatrix() && []),
    group: m.renderingGroupId, layerMask: m.layerMask, camMask: sc.activeCamera.layerMask, alwaysSelect: m.alwaysSelectAsActiveMesh,
    mat: mat ? { cls: mat.getClassName(), name: mat.name, alpha: mat.alpha, tMode: mat.transparencyMode, ready: mat.isReady(m), unlit: mat.unlit, env: mat.environmentIntensity, tex: tex ? { ready: tex.isReady(), name: tex.name, alpha: tex.hasAlpha } : null, needsPre: mat.needDepthPrePass, backFace: mat.backFaceCulling } : null,
    worldY: m.getBoundingInfo().boundingBox.centerWorld.y, scaling: m.absoluteScaling.asArray().map((v) => +v.toFixed(2)), parentChain: (() => { const c = []; let p = m.parent; while (p) { c.push(p.name + (p.isEnabled ? (p.isEnabled() ? '' : '(off)') : '')); p = p.parent; } return c; })() });
})()`);
console.log(out);
await b.close();
