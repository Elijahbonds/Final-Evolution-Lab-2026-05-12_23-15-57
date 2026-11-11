// SCREEN-FIXES-2 (2026-11-11): are the Play shelf's family rows one button look? The every-screen scorer counted a fourth
// button look on /play: with the owner's three-line lists the closed rows grew taller than the open one. This mounts the
// shelf alone (shelf-entry.tsx) with the app's CSS and fonts on a 390 x 844 phone (and at 150 % text), and reads every
// family row's height and its look with the scorer's own rule (scripts/every-screen/inpage.ts: radius, font size, weight,
// case, fill kind, border, height to 4 px). Writes <outDir>/<label>/shelf.json and shelf.jpg.
//
//   npx tsx scripts/probes/screen-fixes/shelf-rows.mts build <outDir> <label>
//   /home/user/wt/gate-run.sh 300 npx tsx scripts/probes/screen-fixes/shelf-rows.mts measure <outDir> <label>
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const [cmd, outDir, label = 'now'] = process.argv.slice(2);
if (!cmd || !outDir) { console.error('usage: shelf-rows.mts build|measure <outDir> <label>'); process.exit(2); }
const SITE = path.resolve(outDir, label);

if (cmd === 'build') {
  const { buildRig } = await import('../../a11y/rig.mts');
  fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'app/fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(ROOT, 'app/fonts', f), path.join(SITE, 'fonts', f));
  await buildRig(SITE, { entry: path.join(ROOT, 'scripts/probes/screen-fixes/shelf-entry.tsx'), fontBase: '/fonts', prodFonts: true });
  console.log('[shelf] built', SITE);
  process.exit(0);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// the scorer's button-look signature (scripts/every-screen/inpage.ts), as a string: tsx would wrap a function in __name
const ROWS = `(() => Array.from(document.querySelectorAll('button[aria-expanded]')).map((el) => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const m = cs.backgroundColor.match(/[\\d.]+/g) || [0, 0, 0, 0]; const a = m.length > 3 ? Number(m[3]) : 1;
  const fill = cs.backgroundImage !== 'none' ? 'grad' : a >= 0.6 ? 'solid' : a > 0 ? 'tint' : 'none';
  const bw = parseFloat(cs.borderTopWidth);
  const sig = [Math.min(parseFloat(cs.borderTopLeftRadius), 999), cs.fontSize, cs.fontWeight, cs.textTransform, fill, bw ? 'b' : '-', Math.round(r.height / 4) * 4].join('|');
  const list = el.querySelector('[data-shelf-list]'); const lh = parseFloat(getComputedStyle(list).lineHeight);
  return { name: (el.textContent || '').trim().slice(0, 14), open: el.getAttribute('aria-expanded') === 'true', h: Math.round(r.height * 10) / 10, lines: Math.round(list.scrollHeight / lh), sig };
}))()`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--no-sandbox'] });
const out: Record<string, unknown> = {};
try {
  for (const [setup, scale] of [['phone', 1], ['text150', 1.5]] as const) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    if (scale !== 1) await p.addStyleTag({ content: `html { font-size: ${16 * scale}px !important; } [data-shelf-list] { font-size: ${14 * scale}px !important; }` });
    await p.waitForTimeout(1500);
    const rows = await p.evaluate(ROWS) as { name: string; open: boolean; h: number; lines: number; sig: string }[];
    if (setup === 'phone') await p.screenshot({ path: path.join(SITE, 'shelf.jpg'), type: 'jpeg', quality: 70 });
    const looks = [...new Set(rows.map((r) => r.sig))];
    out[setup] = { looks: looks.length, rows };
    console.log(`${setup}: ${rows.length} rows, ${looks.length} look${looks.length === 1 ? '' : 's'} — ${rows.map((r) => `${r.name}${r.open ? ' (open)' : ''} ${r.h}px/${r.lines}L`).join(', ')}`);
    await ctx.close();
  }
} finally { await b.close(); server.close(); }
fs.writeFileSync(path.join(SITE, 'shelf.json'), JSON.stringify(out, null, 1));
