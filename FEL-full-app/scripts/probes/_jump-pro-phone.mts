// The jump check's result screens at 390 px (JUMP-PRO, 2026-10-24). No server: scripts/probes/_jump-pro-entry.tsx is
// bundled with esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium.
// Per scene: no sideways scroll, no page error, the elements the scene promises are there; a full-page screenshot each.
//   npx tsx scripts/probes/_jump-pro-phone.mts [outDir]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'jump-pro-'));
const WIDTH = 390;
const js = join(OUT, 'jump.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_jump-pro-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'jump.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="jump.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const scene of ['live30', 'live60', 'slowmo'] as const) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  if (scene === 'slowmo') {
    await page.click('[data-slowmo-open]');
    await page.setInputFiles('[data-slowmo-file]', { name: 'IMG_0001.MOV', mimeType: 'video/quicktime', buffer: Buffer.from('stand-in') });
    await page.waitForSelector('[data-slowmo-best]', { timeout: 60000 });
  } else {
    await page.waitForSelector('[data-jump-session]', { timeout: 60000 });
  }
  await page.waitForTimeout(200);
  const r = await page.evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    number: document.querySelector('[data-jump-number],[data-slowmo-best]')?.textContent,
    rows: Array.from(document.querySelectorAll('[data-jump-row]')).map((e) => e.textContent),
    mean: document.querySelector('[data-jump-mean]')?.textContent ?? null,
    change: document.querySelector('[data-jump-real-change]')?.textContent ?? null,
    verified: Array.from(document.querySelectorAll('[data-jump-verified],[data-slowmo-verified]')).map((e) => e.textContent),
    tip: document.querySelector('[data-jump-tip]')?.textContent ?? null,
  }))()`) as { scrollWidth: number };
  await page.screenshot({ path: join(OUT, `jump-${scene}-390.png`), fullPage: true });
  results[scene] = { ...r, errors };
  if (r.scrollWidth > WIDTH || errors.length) ok = false;
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ out: OUT, ok, results }, null, 1));
process.exit(ok ? 0 : 1);
