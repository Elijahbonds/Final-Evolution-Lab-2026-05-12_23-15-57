// _body-count — how many bodies are live late in a run, and what each costs.  MODE=football
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'football';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 100000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(1500); for (let i = 0; i < 6; i++) { await p.keyboard.press('j'); await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w'); }
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const rows = {}; for (const m of s.meshes) { if (!m.isEnabled() || !m.getTotalVertices()) continue; const k = m.name.replace(/_(c|pk)\\d+$/, '').replace(/_[0-9]+$/, ''); const r = rows[k] ??= { n: 0, tris: 0, vis: 0 }; r.n++; r.tris += m.getTotalIndices() / 3; if (m.isVisible) r.vis++; }
  const top = Object.entries(rows).sort((a, b) => b[1].tris - a[1].tris).slice(0, 12).map(([k, v]) => k + ':' + v.n + 'x/' + v.vis + 'vis/' + Math.round(v.tris / 1000) + 'k'); return 'total tris ' + Math.round(s.getActiveIndices() / 3000) + 'k | ' + top.join(' · '); })()`));
await b.close(); process.exit(0);
