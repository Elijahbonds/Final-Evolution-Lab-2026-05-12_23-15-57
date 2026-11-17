// device-perf control (2026-11-12): run ./bare-entry.mjs (a bare Babylon WebGPU scene) in each texture variant and report whether the
// WebGPU device survives on this box.
//   PAGE=http://127.0.0.1:3761/bare.html CHROME_ARGS='--enable-unsafe-webgpu' npx tsx scripts/probes/device-perf/bare-run.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3761/bare.html';
const ARGS = (process.env.CHROME_ARGS ?? '--enable-unsafe-webgpu').split(' ').filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: chromiumExe(), args: ARGS });
try {
  for (const tex of (process.env.TEX ?? 'none,png,canvas').split(',')) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const msgs: string[] = [];
    p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') msgs.push(m.text().slice(0, 160)); });
    p.on('pageerror', (e) => msgs.push('pageerror: ' + String(e).slice(0, 160)));
    await p.goto(`${PAGE}?tex=${tex}&s=8`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const t0 = Date.now();
    let r: { done: boolean } & Record<string, unknown> = { done: false };
    while (!r.done && Date.now() - t0 < 90_000) { await sleep(1000); r = await p.evaluate(() => ({ ...(window as any).__bare })); }
    console.log(`tex=${tex.padEnd(7)} ${JSON.stringify(r)} ${JSON.stringify([...new Set(msgs)].slice(0, 6))}`);
    await p.close();
  }
} finally { await b.close(); }
