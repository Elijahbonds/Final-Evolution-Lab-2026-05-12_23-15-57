// COACH-BUSINESS (2026-10-25): the coach-business screens at phone (390 px) and desktop (1280 px), measured and shot.
// No server: the real components are bundled with esbuild (scripts/probes/_coach-business-entry.tsx, every /api call
// from fixtures), the app's Tailwind CSS is compiled with its own CLI, and both load into headless Chromium.
//
// The measure, per screen and width: the page must not scroll sideways (documentElement.scrollWidth <= width) and no
// visible element may reach past the right edge unless a scrolling container holds it.
//
//   npx tsx scripts/probes/_coach-business-shots.mts <outDir>
// Exit 0 = no overflow and no page error. PNGs land in outDir.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'coach-business-'));
mkdirSync(OUT, { recursive: true });
const BUILD = mkdtempSync(join(tmpdir(), 'coach-business-build-'));

const js = join(BUILD, 'cb.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-business-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const css = join(BUILD, 'cb.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

const MEASURE = (W: number) => `((W) => {
  const clipped = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return p.getBoundingClientRect().right <= W + 0.5;
    }
    return false;
  };
  const offenders = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > W + 0.5 && !clipped(el)) offenders.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 60), right: Math.round(r.right) });
  }
  return { scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 20), count: offenders.length };
})(${W})`;

const VIEWS: { view: string; ready: string; open?: string }[] = [
  { view: 'profile', ready: '[data-coach-profile]' },
  { view: 'profile-live', ready: '[data-coach-profile]' },
  { view: 'market', ready: '[data-marketplace]' },
  { view: 'dashboard', ready: '[data-business-dashboard]', open: 'Add a package' },
  { view: 'dashboard-live', ready: '[data-business-dashboard]' },
  { view: 'dashboard-setup', ready: '[data-disputes]' }, // PAYMENTS-READY: "finish your Stripe setup" + disputes
  { view: 'pro', ready: '[data-pro-buy]' }, // PAYMENTS-READY: the /pro buy page
];
const WIDTHS = [{ name: 'phone', w: 390, h: 844 }, { name: 'desktop', w: 1280, h: 900 }];

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: unknown[] = [];
let failed = false;
const cssText = readFileSync(css, 'utf8');
const jsText = readFileSync(js, 'utf8');
for (const { view, ready, open } of VIEWS) {
  for (const { name, w, h } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'phone' ? 2 : 1 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${cssText}</style></head><body><div id="root"></div><script>window.__VIEW=${JSON.stringify(view)}</script></body></html>`);
    await page.addScriptTag({ content: jsText });
    await page.waitForSelector(ready, { timeout: 15_000 });
    if (open) await page.getByRole('button', { name: open }).click();
    if (view === 'profile') await page.getByRole('button', { name: 'Apply to train' }).click();
    await page.waitForTimeout(300);
    const m = await page.evaluate(MEASURE(w)) as { scrollWidth: number; offenders: unknown[]; count: number };
    const file = join(OUT, `${view}-${name}-${w}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const ok = m.scrollWidth <= w && m.count === 0 && errors.length === 0;
    if (!ok) failed = true;
    results.push({ view, width: w, scrollWidth: m.scrollWidth, overflowing: m.count, errors, offenders: m.offenders, shot: file });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
