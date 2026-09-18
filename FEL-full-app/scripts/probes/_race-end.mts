// _race-end — does an idle race end? (release gauntlet: aeroaces never reached its card). Reads the dev HUD JSON over time.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098', MODE = process.env.MODE ?? 'aeroaces', SEC = Number(process.env.SEC ?? 60);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const logs: string[] = [];
p.on('console', (m) => { if (/RACE|finish|FINISH/i.test(m.text())) logs.push(m.text().slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1&qaSpeed=8`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space');
const w0 = Date.now();
while ((Date.now() - w0) / 1000 < SEC) {
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => { const t = document.body.innerText; const g = (k: string) => (new RegExp(`"${k}":\\s*("?[^,\\n]*"?)`).exec(t) || [])[1]; return { state: document.getElementById('fel-ready')?.dataset.state, pos: g('pos'), lap: g('lap'), gate: g('gate'), time: g('time'), banner: g('banner') }; });
  console.log(((Date.now() - w0) / 1000).toFixed(0), JSON.stringify(r));
  if (r.state === 'ended') break;
}
console.log(logs.slice(-5).join('\n'));
await b.close();
