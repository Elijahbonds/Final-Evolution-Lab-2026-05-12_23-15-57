// Squads and teams at 390 px, measured (TEAMS-SQUADS, 2026-10-25). No server: the real components are bundled with
// esbuild (scripts/probes/_teams-squads-entry.tsx builds every view with the real lib/groups core), the app's Tailwind
// CSS is compiled with its own CLI, and both are loaded into headless Chromium at an iPhone 12–15 width. Next's router
// and Link are stubbed (no app router is mounted in a bare page).
//
// Per screen (home, squad, team, soon, join): the page must not scroll sideways (scrollWidth <= 390), no visible element
// may reach past the right edge unless a scrolling container holds it, every button is at least 36 px tall, and the
// squad's feed shows reactions only (no text box anywhere). A full-page screenshot of each is written to outDir.
//
//   npx tsx scripts/probes/_teams-squads-probe.mts [outDir]
import { build, type Plugin } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'teams-squads-'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const stubs: Plugin = {
  name: 'next-stubs',
  setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      loader: 'tsx', resolveDir: ROOT,
      contents: a.path === 'next/link'
        ? `import { createElement } from 'react'; export default function Link({ href, children, ...rest }) { return createElement('a', { href, ...rest }, children); }`
        : `export const useRouter = () => ({ push: (h) => { window.__PUSHED = h; }, refresh: () => {}, replace: () => {} }); export const notFound = () => { throw new Error('404'); }; export const redirect = () => {};`,
    }));
  },
};

const js = join(OUT, 'teams-squads.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_teams-squads-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', plugins: [stubs],
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const css = join(OUT, 'teams-squads.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

const MEASURE = `((W) => {
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
  const small = Array.from(document.querySelectorAll('button')).filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 36; }).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40));
  return { scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 20), count: offenders.length, small, textareas: document.querySelectorAll('textarea').length, feedInputs: document.querySelectorAll('[data-feed] input, [data-feed] textarea').length };
})(${WIDTH})`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let failed = false;
for (const screen of ['home', 'squad', 'team', 'soon', 'join'] as const) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body><script>window.__SCREEN=${JSON.stringify(screen)}</script><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: readFileSync(js, 'utf8') });
  const ready = { home: '[data-my-groups]', squad: '[data-group-screen]', team: '[data-team-rollup]', soon: '[data-groups-coming-soon]', join: '[data-join-landing]' }[screen];
  await page.waitForSelector(ready, { timeout: 15000 });
  const extra: Record<string, unknown> = {};
  if (screen === 'squad') {
    // the interactions a member makes: react to a drill, nudge a buddy, open the jump board
    await page.locator('[data-feed-item="drill"] button[aria-label^="clap"]').first().click();
    await page.waitForTimeout(250);
    await page.locator('[data-buddy="sam"] button').first().click();
    await page.waitForTimeout(250);
    extra.reactedClap = await page.locator('[data-feed-item="drill"] button[aria-pressed="true"]').count();
    extra.samNudged = await page.locator('[data-buddy="sam"]').innerText();
    extra.feedLines = await page.locator('[data-feed-item] p').allInnerTexts();
    await page.getByRole('tab', { name: 'Verified jump' }).click();
    extra.jumpBoard = await page.locator('[data-boards] ol li').allInnerTexts();
  }
  if (screen === 'team') {
    await page.waitForSelector('[data-teams-panel]');
    await page.getByRole('button', { name: 'Show the QR' }).click();
    await page.waitForSelector('[data-group-invite] img', { timeout: 10000 });
    await page.getByRole('button', { name: /Assign a program to the team/ }).click();
    await page.waitForSelector('[data-team-assign]');
    extra.rollupRows = await page.locator('[data-rollup-row]').count();
  }
  await page.waitForTimeout(300);
  const report = await page.evaluate(MEASURE) as { scrollWidth: number; offenders: unknown[]; count: number; small: string[]; textareas: number; feedInputs: number };
  await page.evaluate('window.scrollTo(0, 0)');
  await page.screenshot({ path: join(OUT, `teams-squads-${screen}-390.png`), fullPage: true });
  results[screen] = { ...report, errors, ...extra };
  if (report.scrollWidth > WIDTH || report.count || report.small.length || report.textareas || report.feedInputs || errors.length) failed = true;
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ width: WIDTH, out: OUT, results }, null, 1));
process.exit(failed ? 1 : 0);
