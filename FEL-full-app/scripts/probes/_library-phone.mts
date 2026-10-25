// The exercise library at 390 px and 1280 px, measured (EXERCISE-LIBRARY, 2026-10-25). No server:
// scripts/probes/_library-entry.tsx (the real browser + review components, the real engine over the real data) is
// bundled with esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium.
// Per scene and width: no sideways scroll, no page error, the elements the scene promises are there; a screenshot each.
//   npx tsx scripts/probes/_library-phone.mts [outDir]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'library-'));
mkdirSync(OUT, { recursive: true });
const js = join(OUT, 'library.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_library-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_DISABLE_3D': '"1"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty' },
});
const css = join(OUT, 'library.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="library.js"></script></body></html>`);

type Step = (p: Page) => Promise<void>;
const typeSearch = (q: string): Step => async (p) => { await p.fill('input[aria-label="Search the exercise library"]', q); await p.waitForTimeout(500); };
const drafts: Step = async (p) => { await p.check('text=Show drafts'); await p.waitForTimeout(400); };
const ask = (q: string): Step => async (p) => {
  await p.getByRole('tab', { name: 'Ask' }).click();
  await p.fill('input[aria-label="Ask the exercise library"]', q);
  await p.getByRole('button', { name: 'Ask', exact: true }).click();
  await p.waitForSelector('[data-testid="ask-answer"]', { timeout: 20000 });
  await p.waitForTimeout(200);
};
const SCENES: { name: string; hash: string; steps: Step[]; expect: string[] }[] = [
  { name: 'coach-search-typo', hash: 'coach-search', steps: [drafts, typeSearch('goblet sqaut')], expect: ['[data-testid="library-card"]', '[data-testid="library-recovery"]', '[data-testid="draft-badge"]'] },
  { name: 'coach-filters', hash: 'coach-search', steps: [drafts, typeSearch('rdl'), async (p) => { await p.getByRole('button', { name: /Filters/ }).click(); await p.waitForTimeout(200); }], expect: ['[data-testid="library-facets"]', '[data-testid="library-card"]'] },
  { name: 'coach-sheet', hash: 'coach-search', steps: [drafts, typeSearch('pogo hop'), async (p) => { await p.locator('[data-testid="library-card"]').first().click(); await p.waitForSelector('[data-testid="library-sheet"]'); }], expect: ['[data-testid="library-sheet"]', '[data-testid="add-to-catalogue"]', '[data-testid="muscle-map"]'] },
  { name: 'coach-zero-relax', hash: 'coach-search', steps: [drafts, typeSearch('pistol squat sled')], expect: ['[data-testid="library-results"]'] },
  { name: 'ask-knee-vertical', hash: 'coach-ask', steps: [drafts, ask('knee-friendly exercises for vertical jump with no equipment')], expect: ['[data-testid="ask-chips"]', '[data-testid="library-card"]'] },
  { name: 'ask-easier-pistol', hash: 'coach-ask', steps: [drafts, ask('something easier than a pistol squat')], expect: ['[data-testid="ask-chips"]', '[data-testid="library-card"]'] },
  { name: 'ask-warmup-plan', hash: 'coach-ask', steps: [drafts, ask('warm-up for basketball, 10 minutes')], expect: ['[data-testid="ask-plan"]'] },
  { name: 'ask-injury-guard', hash: 'coach-ask', steps: [drafts, ask('my knee hurts when i squat')], expect: ['[data-testid="ask-safety"]', '[data-testid="library-card"]'] },
  { name: 'athlete-approved-only', hash: 'athlete', steps: [typeSearch('crossover')], expect: ['[data-testid="library-card"]', '[data-testid="library-counts"]'] },
  { name: 'review', hash: 'review', steps: [async (p) => { await p.waitForSelector('[data-testid="review-row"]', { timeout: 20000 }); }], expect: ['[data-testid="review-row"]'] },
];

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const width of [390, 1280]) {
  for (const s of SCENES) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${html}#${s.hash}`);
    const missing: string[] = [];
    try {
      await page.waitForSelector('[data-testid="library-browser"],[data-testid="library-review"]', { timeout: 30000 });
      await page.waitForTimeout(400);
      for (const step of s.steps) await step(page);
      for (const sel of s.expect) if (!(await page.locator(sel).count())) missing.push(sel);
    } catch (e) { errors.push(String(e)); }
    const r = await page.evaluate(`(() => ({ scrollWidth: document.documentElement.scrollWidth, cards: document.querySelectorAll('[data-testid="library-card"]').length,
      chips: Array.from(document.querySelectorAll('[data-testid="ask-chips"] button')).map((b) => b.textContent),
      first: Array.from(document.querySelectorAll('[data-testid="library-card"] .text-sm')).slice(0, 3).map((e) => e.textContent),
      counts: document.querySelector('[data-testid="library-counts"]')?.textContent ?? null }))()`) as { scrollWidth: number };
    await page.screenshot({ path: join(OUT, `${s.name}-${width}.png`), fullPage: width === 390 });
    results[`${s.name}@${width}`] = { ...r, missing, errors };
    if (r.scrollWidth > width || errors.length || missing.length) ok = false;
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify({ out: OUT, ok, results }, null, 1));
process.exit(ok ? 0 : 1);
