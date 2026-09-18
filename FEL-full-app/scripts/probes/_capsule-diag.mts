// _capsule-diag — which visible meshes are the pill people? name, parent chain, position, material colour.  MODE=karate
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'karate';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(11000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const rows = [];
  for (const m of s.meshes) { if (!m.isVisible || !m.isEnabled() || !m.getTotalVertices()) continue; const n = m.name.toLowerCase(); if (!/torso|capsule|pill|leg|arm|head|actor|body_|crowd|npc|dummy|spect/.test(n) || /kit_|body_c|hair|meshy/.test(n)) continue;
    const chain = []; let q = m.parent; while (q && chain.length < 4) { chain.push(q.name.slice(0, 22)); q = q.parent; }
    const mat = m.material; rows.push({ name: m.name.slice(0, 26), chain: chain.join('<'), pos: m.getAbsolutePosition().asArray().map(v => +v.toFixed(1)), col: (mat?.albedoColor ?? mat?.diffuseColor ?? mat?.emissiveColor)?.toHexString?.(), cls: m.getClassName() }); }
  return JSON.stringify(rows.slice(0, 24)) + ' total=' + rows.length; })()`));
await b.close();
