// The jump check's other jumps at 390 px (JUMP-PRO 2, 2026-10-25). No server: scripts/probes/_jump-pro-2-entry.tsx is
// bundled with esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium.
// Per scene: no sideways scroll, no page error, the elements the scene promises; a full-page screenshot each.
//   npx tsx scripts/probes/_jump-pro-2-phone.mts [outDir]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'jump-pro-2-'));
const WIDTH = 390;
const js = join(OUT, 'jump2.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_jump-pro-2-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'jump2.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="jump2.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
const file = { name: 'IMG_0002.MOV', mimeType: 'video/quicktime', buffer: Buffer.from('stand-in') };
for (const scene of ['approach', 'noreach', 'reach', 'drop', 'power', 'kid'] as const) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  let want = '';
  if (scene === 'approach' || scene === 'noreach') {
    await page.click('[data-side-open="approach"]');
    await page.setInputFiles('[data-side-file="approach"]', file);
    want = scene === 'approach' ? '[data-touch]' : '[data-touch-missing]';
  } else if (scene === 'drop') {
    await page.click('[data-side-open="drop"]');
    await page.setInputFiles('[data-side-file="drop"]', file);
    want = '[data-drop-best]';
  } else if (scene === 'reach') {
    await page.click('[data-reach-open]');
    await page.setInputFiles('[data-reach-file]', file);
    want = '[data-reach-saved]';
  } else if (scene === 'power') {
    await page.click('[data-power-open]');
    await page.fill('[data-power-weight]', '180');
    want = '[data-power-watts]';
  }
  let found = true;
  if (want) found = await page.waitForSelector(want, { timeout: 90000 }).then(() => true, () => false);
  await page.waitForTimeout(200);
  const r = await page.evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    panel: !!document.querySelector('[data-jump-more]'),
    approach: document.querySelector('[data-approach-best]')?.textContent ?? null,
    drop: document.querySelector('[data-drop-best]')?.textContent ?? null,
    reach: document.querySelector('[data-reach-saved],[data-reach-error]')?.textContent ?? null,
    power: document.querySelector('[data-power-watts]')?.textContent ?? null,
    rows: Array.from(document.querySelectorAll('[data-jump-row]')).map((e) => e.textContent),
    rebound: document.querySelector('[data-jump-rebound]')?.textContent ?? null,
    refused: document.querySelector('[data-side-refused]')?.textContent ?? null,
  }))()`) as { scrollWidth: number; panel: boolean };
  await page.screenshot({ path: join(OUT, `jump2-${scene}-390.png`), fullPage: true });
  const pass = found && r.scrollWidth <= WIDTH && !errors.length && (scene === 'kid' ? !r.panel : r.panel);
  results[scene] = { ...r, found, errors, pass };
  if (!pass) ok = false;
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ out: OUT, ok, results }, null, 1));
process.exit(ok ? 0 : 1);
