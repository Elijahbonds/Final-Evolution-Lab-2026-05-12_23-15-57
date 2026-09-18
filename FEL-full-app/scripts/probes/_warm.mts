import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: true });
for (const m of (process.env.MODES ?? '').split(',')) {
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:3098/dev/mode/${m}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const t0 = Date.now(); let s = '';
  while (Date.now() - t0 < 300000) { s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'failed') break; await p.waitForTimeout(1000); }
  console.log(m, s, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  await p.close();
}
await b.close();
