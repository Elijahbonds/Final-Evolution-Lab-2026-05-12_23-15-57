// _sky-diag — is the baked sky dome drawn? material, texture readiness, scale, frustum, camera far plane.  MODE=skateboard
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 70000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(4000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const cam = s.activeCamera;
  const big = s.meshes.filter(x => x.getTotalVertices() > 0 && x.getBoundingInfo().boundingBox.extendSizeWorld.length() > 30).map(x => { const m = x.material; const t = m?.emissiveTexture ?? m?.diffuseTexture ?? m?.albedoTexture; return { name: x.name, ext: Math.round(x.getBoundingInfo().boundingBox.extendSizeWorld.length()), vis: x.isVisible && x.isEnabled(), rg: x.renderingGroupId, mat: m?.getClassName(), tex: t ? (t.getClassName() + ':' + (t.url ?? t.name)).slice(0, 60) : null, texReady: t?.isReady?.(), emis: m?.emissiveColor?.toHexString?.(), diff: (m?.diffuseColor ?? m?.albedoColor)?.toHexString?.(), alpha: m?.alpha, disableDepthWrite: m?.disableDepthWrite, infinite: x.infiniteDistance }; });
  return JSON.stringify({ cam: cam?.name, maxZ: cam?.maxZ, fog: s.fogMode, fogColor: s.fogColor?.toHexString?.(), fogD: s.fogDensity, fogStart: s.fogStart, fogEnd: s.fogEnd, clear: s.clearColor?.toHexString?.(), env: !!s.environmentTexture, pp: (s.postProcesses ?? []).map(x => x?.name ?? null).slice(0, 6), camPP: (cam?._postProcesses ?? []).map(x => x?.name ?? null).slice(0, 8), layers: s.layers?.length, big }); })()`));
await b.close(); process.exit(0);
