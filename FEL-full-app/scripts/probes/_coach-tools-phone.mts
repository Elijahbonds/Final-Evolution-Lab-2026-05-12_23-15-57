// The coach's tools, screen by screen at 390 and 1280 px (COACH-TOOLS-EASY, 2026-11-02). No server: scripts/probes/_coach-tools-entry.tsx
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
const OUT = resolve(process.argv[2] ?? join(HERE, '.coach-tools-shots'));
const VER = process.argv[3] ?? 'after';
const ROOT = resolve(process.argv[4] ?? HERE);
const ALL = ['home', 'sheet', 'thread', 'drafts', 'reviews', 'reply', 'attention', 'setup', 'combine', 'combine-setup', 'business', 'messages'];
const SCENES = process.argv[5] ? process.argv[5].split(',') : ALL;
mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1280];

const js = join(OUT, `ct-${VER}.js`);
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-tools-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __VER__: JSON.stringify(VER) }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'], nodePaths: [join(HERE, 'node_modules')],
});
const css = join(OUT, `ct-${VER}.css`);
execFileSync(join(HERE, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, `ct-${VER}.html`);
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="ct-${VER}.js"></script></body></html>`);

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
  const click = async (sel: string) => { await page.waitForSelector(sel, { timeout: 20000 }); await page.click(sel); await page.waitForTimeout(500); };
  if (scene === 'home') { await page.waitForSelector('[data-queue-card]', { timeout: 20000 }); return; }
  if (scene === 'sheet' || scene === 'thread') { await click('[data-roster-row="a8"]'); await page.waitForSelector('[data-sheet-body]', { timeout: 20000 }); if (scene === 'thread') await click('[data-sheet-tab="thread"]'); return; }
  if (scene === 'messages') { const has = await page.$('[data-coach-tool="messages"]'); if (has) await click('[data-coach-tool="messages"]'); return; }
  if (['drafts', 'reviews', 'attention'].includes(scene)) { await click(`[data-coach-tool="${scene}"]`); await page.waitForTimeout(800); return; }
  if (scene === 'setup') { await click('[data-coach-setup-open]'); return; }
  if (scene === 'reply') { await click('[data-queue-card="review"] [data-queue-action="cue"]'); return; }
  if (scene === 'combine-setup') { await click('[data-combine-new]'); return; }
  if (scene === 'business') { await page.waitForTimeout(800); }
}

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const WIDTH of WIDTHS) for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: WIDTH > 600 ? 900 : 844 }, deviceScaleFactor: WIDTH > 600 ? 1 : 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 120000 }).catch(() => errors.push('never ready'));
  await page.waitForTimeout(500);
  await drive(page, scene).catch((e) => errors.push(`drive: ${String(e).slice(0, 200)}`));
  const m = await page.evaluate(METRICS) as { scrollWidth: number };
  await page.screenshot({ path: join(OUT, `${VER}-${WIDTH}-${scene}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
  results[`${WIDTH}:${scene}`] = { ...m, errors };
  if (m.scrollWidth > WIDTH || errors.length) ok = false;
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, `${VER}-metrics.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify({ out: OUT, ver: VER, ok, results }));
process.exit(ok ? 0 : 1);
