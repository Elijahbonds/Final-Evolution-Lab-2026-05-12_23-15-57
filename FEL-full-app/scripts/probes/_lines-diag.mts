// _lines-diag — every LinesMesh / wireframe material in a dev-mode scene (rays pass through lines: a wire cage no pick can name).
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 80000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const rows = [];
  for (const m of s.meshes) { const cls = m.getClassName(); const wf = !!(m.material && m.material.wireframe); if (cls !== 'LinesMesh' && !wf) continue;
    const bb = m.getBoundingInfo().boundingBox; rows.push({ name: m.name.slice(0, 30), cls, wf, en: m.isEnabled(), vis: m.isVisible, parent: m.parent?.name?.slice(0, 24), c: bb.centerWorld.asArray().map(v => +v.toFixed(1)), size: bb.extendSizeWorld.scale(2).asArray().map(v => +v.toFixed(1)), col: (m.color ?? m.material?.emissiveColor ?? m.material?.diffuseColor)?.toHexString?.() }); }
  return JSON.stringify(rows); })()`));
await b.close(); process.exit(0);
