#!/usr/bin/env -S npx tsx
// Menu-screen audit: load every menu surface like a person, screenshot it,
// collect console/page errors, and flag blank screens by measured pixel
// variance (a menu that renders nothing is the failure this exists to catch).
//
//   URL=http://localhost:3001 npx tsx scripts/menu-audit.mts

import { chromium } from 'playwright-core';
import { chromiumExe } from './probes/_chromium.mts';
import { mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://localhost:3001';
const OUT = 'docs/shots/menus';
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['home', '/'],
  ['modes-lab', '/modes'],
  ['play-hub', '/play'],
  ['arena', '/arena'],
  ['sessions', '/sessions'],
  ['profile', '/profile'],
  ['workout', '/workout'],
  ['create', '/create'],
  ['creator', '/creator'],
  ['cards', '/cards'],
  ['live', '/live'],
  ['coach', '/coach'],
  ['mirror', '/play/mirror'],
  ['irl', '/play/irl'],
] as const;

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });

await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
await p.locator('input[type="password"]').press('Enter');
await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
await p.waitForLoadState('networkidle').catch(() => {});

const rows: string[] = [];
for (const [name, route] of ROUTES) {
  const errors: string[] = [];
  const onConsole = (m: any) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); };
  const onPageErr = (e: any) => errors.push(`pageerror: ${String(e.message).slice(0, 140)}`);
  p.on('console', onConsole); p.on('pageerror', onPageErr);
  const status = await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).then((r) => r?.status() ?? 0).catch(() => 0);
  await p.waitForTimeout(4200);
  const file = `${OUT}/${name}.png`;
  await p.screenshot({ path: file });
  // blank-screen check: pixel variance of the shot
  const png = PNG.sync.read(readFileSync(file));
  let sum = 0, sq = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i += 37) {
    const l = png.data[i * 4] + png.data[i * 4 + 1] + png.data[i * 4 + 2];
    sum += l; sq += l * l;
  }
  const count = Math.ceil(n / 37);
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sq / count - mean * mean));
  const blank = std < 6;
  const bodyText = (await p.evaluate<string>('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 90);
  rows.push(`${name.padEnd(11)} ${String(status).padEnd(4)} std=${std.toFixed(1).padStart(5)}${blank ? ' ← BLANK' : ''}  errors=${errors.length}  "${bodyText}"`);
  if (errors.length) for (const e of errors.slice(0, 3)) rows.push(`    · ${e}`);
  p.off('console', onConsole); p.off('pageerror', onPageErr);
}
await b.close();
const report = rows.join('\n');
console.log(report);
writeFileSync(`${OUT}/_report.txt`, report + '\n');
