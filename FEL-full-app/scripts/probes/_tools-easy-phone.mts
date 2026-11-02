// Every measuring tool, screen by screen at 390 px (TOOLS-EASY, 2026-10-28). No server: scripts/probes/_tools-easy-entry.tsx
// is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium.
// Per scene: a screenshot, and the premium rule's numbers — sideways scroll, distinct font sizes of visible text, distinct
// button looks, the primary's height, the visible word count — plus page errors.
//   CHROMIUM_EXE=… npx tsx scripts/probes/_tools-easy-phone.mts <outDir> [before|after] [root] [scene,scene]
// `root` is the tree to bundle (default: this one; the "before" tree is the lane's base, extracted from git objects).
// Run it under the shared browser lock: flock /home/user/wt/gate-queue.lock timeout 900 npx tsx …
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const HERE = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(HERE, '.tools-easy-shots'));
const VER = process.argv[3] ?? 'after';
const ROOT = resolve(process.argv[4] ?? HERE);
const ALL = ['readiness', 'readiness-stand', 'readiness-refused', 'combine-stand', 'combine-refused', 'vbt', 'vbt-live', 'sprint', 'sprint-tap', 'jump-tests', 'form-review'];
const SCENES = process.argv[5] ? process.argv[5].split(',') : ALL;
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, `te-${VER}.js`);
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_tools-easy-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __VER__: JSON.stringify(VER) }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'], nodePaths: [join(HERE, 'node_modules')],
});
const css = join(OUT, `te-${VER}.css`);
execFileSync(join(HERE, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, `te-${VER}.html`);
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="te-${VER}.js"></script></body></html>`);

const METRICS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' && !e.closest('.hidden') && !e.closest('details:not([open]) > :not(summary)'); };
  const sizes = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) sizes.add(getComputedStyle(e).fontSize);
  }
  const looks = new Set();
  for (const e of document.querySelectorAll('button, a, label:has(input[type=file])')) {
    if (!vis(e)) continue;
    const s = getComputedStyle(e);
    looks.add([s.backgroundImage !== 'none' ? 'grad' : s.backgroundColor, s.borderTopWidth + ' ' + s.borderTopColor, s.color].join('|'));
  }
  const buttons = Array.from(document.querySelectorAll('button, a, label:has(input[type=file]), input:not([type=file]):not([type=checkbox])')).filter(vis).length;
  const inputs = Array.from(document.querySelectorAll('input:not([type=file])')).filter(vis).length;
  const prim = Array.from(document.querySelectorAll('[data-primary],[data-fel-primary]')).filter(vis).map((e) => Math.round(e.getBoundingClientRect().height));
  const words = (document.body.innerText || '').split(/\\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const big = Array.from(document.querySelectorAll('[data-setup-word]')).filter(vis).map((e) => e.textContent.trim());
  const refusal = Array.from(document.querySelectorAll('[data-take-refusal],[data-readiness-why],[data-combine-why]')).filter(vis).map((e) => e.textContent.trim());
  return { scrollWidth: document.documentElement.scrollWidth, fontSizes: [...sizes].sort(), buttonLooks: looks.size, controls: buttons, inputs, primaryHeights: prim, words, setupWord: big, refusal };
})()`;

async function drive(page: Page, scene: string): Promise<void> {
  const feed = async (expr: string) => { await page.evaluate(`window.__feed(${expr})`); await page.waitForTimeout(400); };
  if (scene.startsWith('readiness-')) {
    await page.waitForSelector('[data-readiness-start]:not([disabled])', { timeout: 20000 });
    await page.evaluate('window.__feed([])');
    await page.click('[data-readiness-start]');
    await page.waitForTimeout(300);
    await feed('window.__stand()');
    if (scene === 'readiness-refused') await feed('window.__swing().map((f) => ({ ...f, t: f.t + 6100 }))');
  } else if (scene.startsWith('combine-')) {
    await page.evaluate('window.__feed([])');
    await page.click('[data-combine-start-camera]');
    await page.waitForTimeout(300);
    await feed('window.__stand()');
    if (scene === 'combine-refused') await feed('window.__swing().map((f) => ({ ...f, t: f.t + 6100 }))');
  } else if (scene === 'vbt-live') {
    await page.waitForSelector('[data-vbt-start]', { timeout: 20000 });
    await page.fill('[data-vbt-load]', '100').catch(() => {});
    await page.fill('[data-vbt-height]', '178').catch(() => {});
    await page.evaluate('window.__feed([])');
    await page.click('[data-vbt-start]');
    await page.waitForTimeout(300);
    await feed('Array.from({ length: 30 }, (_, k) => ({ t: k * 33, present: false, image: [] }))');
  } else if (scene === 'sprint-tap') {
    await page.evaluate('window.__feed([])');
    await page.click('[data-sprint-camera]');
    await page.waitForTimeout(600);
  }
}

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 120000 }).catch(() => errors.push('never ready'));
  await page.waitForTimeout(500);
  await drive(page, scene).catch((e) => errors.push(`drive: ${String(e).slice(0, 200)}`));
  const m = await page.evaluate(METRICS) as { scrollWidth: number };
  await page.screenshot({ path: join(OUT, `${VER}-${scene}.jpg`), type: 'jpeg', quality: 70, fullPage: true });
  results[scene] = { ...m, errors };
  if (m.scrollWidth > WIDTH || errors.length) ok = false;
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, `${VER}-metrics.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify({ out: OUT, ver: VER, ok, results }));
process.exit(ok ? 0 : 1);
