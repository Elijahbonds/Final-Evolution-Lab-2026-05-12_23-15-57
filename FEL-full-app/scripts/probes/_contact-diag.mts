// _contact-diag — the contact-shadow discs under the bodies: where they are, how visible, whether their texture is ready.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'golf';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const rows = [];
  for (const m of s.meshes) { if (!/_contact$/.test(m.name)) continue; const mat = m.material; const t = mat?.diffuseTexture;
    rows.push({ name: m.name.slice(0, 34), vis: m.isVisible, en: m.isEnabled(), pos: m.position.asArray().map(v => +v.toFixed(2)), absPos: m.getAbsolutePosition().asArray().map(v => +v.toFixed(2)), scale: +m.scaling.x.toFixed(2), alpha: +mat.alpha.toFixed(2), texReady: t?.isReady(), hasAlpha: t?.hasAlpha, opacityTex: !!mat.opacityTexture, parent: m.parent?.name, rendering: m.renderingGroupId, inFrustum: s.activeCamera?.isInFrustum(m) }); }
  const cam = s.activeCamera; return JSON.stringify({ cam: cam.position.asArray().map(v => +v.toFixed(1)), rows }); })()`));
await b.close();
