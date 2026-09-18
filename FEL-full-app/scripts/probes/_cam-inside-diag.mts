// _cam-inside-diag — on penalty's keeper round: where is the camera, and which meshes' bounding boxes contain it?
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'penalty';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
const probe = `(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const c = s.activeCamera; const cp = c.position; const hits = [];
  for (const m of s.meshes) { if (!m.isVisible || !m.isEnabled() || !m.getTotalVertices()) continue; const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
    const pad = 0.4; if (cp.x > mn.x - pad && cp.x < mx.x + pad && cp.y > mn.y - pad && cp.y < mx.y + pad && cp.z > mn.z - pad && cp.z < mx.z + pad && (mx.x - mn.x) < 80) hits.push({ name: m.name.slice(0, 40), parent: m.parent?.name?.slice(0, 30), mat: m.material?.name?.slice(0, 24), min: mn.asArray().map(v => +v.toFixed(2)), max: mx.asArray().map(v => +v.toFixed(2)) }); }
  const hud = document.body.innerText.match(/"hint": "([^"]*)"/)?.[1]?.slice(0, 40);
  return JSON.stringify({ hud, cam: cp.asArray().map(v => +v.toFixed(2)), target: c.getTarget?.().asArray().map(v => +v.toFixed(2)), hits }); })()`;
for (let i = 0; i < 8; i++) {
  const r = await p.evaluate(probe); console.log(`t${i}`, r);
  if (String(r).includes('THEIR KICK')) break;
  await p.keyboard.press('j'); await p.waitForTimeout(2500);
}
await b.close();
