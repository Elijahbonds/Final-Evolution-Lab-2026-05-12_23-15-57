// One-off: on a dev-mode page, list kit meshes' visibility and the venue map's floor materials, and take a frame.
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/dunk', OUT = process.env.OUT_DIR ?? 'docs/shots', TAG = process.env.TAG ?? 'diag';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(Number(process.env.WAIT_MS ?? 7000));
await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
await p.waitForTimeout(1500);
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__'; const s = d.scene; const kit = s.meshes.filter((m) => /^(Kit|Hair)_/.test(m.name)).map((m) => m.name.replace(/_c\\d+$/, '') + (m.isVisible ? '' : '(hidden)')); const mapRoot = s.transformNodes.find((n) => /nexus_venue_map/.test(n.name)); const map = (mapRoot ? mapRoot.getChildMeshes() : []).slice(0, 8).map((m) => { const mat = m.material; return m.name.slice(0, 18) + ':' + (mat ? mat.getClassName() + ' r' + (mat.roughness ?? '-') + ' m' + (mat.metallic ?? '-') + ' env' + (mat.environmentIntensity ?? '-') + ' emi' + (mat.emissiveIntensity ?? '-') + ' tex' + (mat.albedoTexture ? 1 : 0) : 'none'); }); return JSON.stringify({ mode: d.modeId, kit, map, mapMeshes: mapRoot ? mapRoot.getChildMeshes().length : 0, mapScale: mapRoot ? mapRoot.scaling.x : null, mapPos: mapRoot ? [mapRoot.position.x, mapRoot.position.y, mapRoot.position.z] : null }); })()`));
await p.screenshot({ path: `${OUT}/${TAG}.png` });
await b.close();
