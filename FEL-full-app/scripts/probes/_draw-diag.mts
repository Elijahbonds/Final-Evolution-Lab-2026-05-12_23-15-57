// _draw-diag — active meshes grouped by name family (digits stripped) with counts, so a draw budget overrun has a name (MODE=…)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'snowboard_slalom';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
for (let i = 0; i < 3; i++) { await p.keyboard.down('j'); await p.waitForTimeout(600); await p.keyboard.up('j'); await p.waitForTimeout(300); }
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const fam = {}; let total = 0;
  for (const m of s.getActiveMeshes().data) { if (!m) continue; total++; const k = m.name.replace(/[_\\-]?\\d+/g, '#').slice(0, 28); const inst = m.getClassName() === 'InstancedMesh'; const key = k + (inst ? ' (inst)' : ''); fam[key] = (fam[key] ?? 0) + 1; }
  const rows = Object.entries(fam).sort((a, b) => b[1] - a[1]).slice(0, 25); return JSON.stringify({ active: total, rows }); })()`));
await b.close();
