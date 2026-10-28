// The full Quick Screen, screen by screen at 390 px (SCREEN-EASY, 2026-10-28). No server: scripts/probes/_screen-easy-entry.tsx
// is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium.
// Per scene: a screenshot, and the premium rule's numbers — sideways scroll, distinct font sizes of visible text, distinct
// button looks, the primary's height, the visible word count — plus page errors.
//   CHROMIUM_EXE=… npx tsx scripts/probes/_screen-easy-phone.mts <outDir> [before|after]
// Run it under the shared browser lock: flock /home/user/wt/gate-queue.lock timeout 900 npx tsx …
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.screen-easy-shots'));
const VER = process.argv[3] ?? 'after';
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;
const SCENES = ['age', 'pain', 'takeoff', 'setup', 'turn', 'wall', 'pain-check', 'result', 'result-clean'];

const js = join(OUT, 'se.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_screen-easy-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __VER__: JSON.stringify(VER) }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'se.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="se.js"></script></body></html>`);

const METRICS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' && !e.closest('details:not([open]) > :not(summary)'); };
  const sizes = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) sizes.add(getComputedStyle(e).fontSize);
  }
  const looks = new Set();
  for (const e of document.querySelectorAll('button, a')) {
    if (!vis(e)) continue;
    const s = getComputedStyle(e);
    looks.add([s.backgroundImage !== 'none' ? 'grad' : s.backgroundColor, s.borderTopWidth + ' ' + s.borderTopColor, s.color].join('|'));
  }
  const prim = Array.from(document.querySelectorAll('[data-primary],[data-fel-primary]')).filter(vis).map((e) => Math.round(e.getBoundingClientRect().height));
  const words = (document.body.innerText || '').split(/\\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return { scrollWidth: document.documentElement.scrollWidth, fontSizes: [...sizes].sort(), buttonLooks: looks.size, primaryHeights: prim, words,
    missing: !!document.querySelector('[data-missing]') };
})()`;

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 120000 }).catch(() => errors.push('never ready'));
  await page.waitForTimeout(300);
  const m = await page.evaluate(METRICS) as { scrollWidth: number; missing: boolean };
  await page.screenshot({ path: join(OUT, `${VER}-${scene}.jpg`), type: 'jpeg', quality: 80, fullPage: scene.startsWith('result') });
  results[scene] = { ...m, errors };
  if (m.scrollWidth > WIDTH || errors.length || m.missing) ok = false;
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, `${VER}-metrics.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify({ out: OUT, ver: VER, ok, results }, null, 1));
process.exit(ok ? 0 : 1);
