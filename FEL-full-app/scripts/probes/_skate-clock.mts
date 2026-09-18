// _skate-clock — does the skate run clock count real seconds? (release gauntlet: 49 of 90 s elapsed in 90 wall seconds)
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098', QS = process.env.QS ?? '';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.goto(`${BASE}/dev/mode/skateboard${QS}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space');
const read = () => p.evaluate(() => { const m = /"time":\s*(\d+)/.exec(document.body.innerText); return m ? Number(m[1]) : null; });
const rows: string[] = [];
const w0 = Date.now(); const h0 = await read();
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(3000);
  if (i === 2) { for (let k = 0; k < 25; k++) { await p.keyboard.down('KeyJ'); await p.waitForTimeout(40); await p.keyboard.up('KeyJ'); await p.waitForTimeout(60); } }
  const h = await read(); rows.push(`wall ${((Date.now() - w0) / 1000).toFixed(1)}s  hud time ${h}  elapsed ${h0 !== null && h !== null ? h0 - h : '?'}`);
}
console.log(rows.join('\n'));
await b.close();
