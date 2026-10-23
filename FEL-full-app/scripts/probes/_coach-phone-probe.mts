// The coach screens at 390 px, measured (coach-loop P1, 2026-10-20). No server: the real CoachView is bundled with
// esbuild (scripts/probes/_coach-phone-entry.tsx, every /api call answered from fixtures), the app's Tailwind CSS is
// compiled with its own CLI, and both are loaded into headless Chromium at an iPhone 12–15 width.
//
// The measure, per tab section (roster, programs, inbox, attention board, invites): the page must not scroll sideways
// (documentElement.scrollWidth <= 390), and no visible element may reach past the right edge unless a scrolling
// container holds it. Every offender is printed with its text, so a failure names what to fix.
//
//   npx tsx scripts/probes/_coach-phone-probe.mts [outDir]
// Exit 0 = no overflow. A screenshot of the Clients tab is written to outDir (default: the OS temp dir).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'coach-phone-'));
const WIDTH = 390;

const js = join(OUT, 'coach.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-phone-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const css = join(OUT, 'coach.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body><div id="root"></div></body></html>`);
await page.addScriptTag({ content: readFileSync(js, 'utf8') });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try { await page.getByRole('button', { name: 'Clients' }).click({ timeout: 15000 }); } catch (e) { console.error(errors.join('\n')); throw e; }
await page.waitForSelector('[data-roster-row]');
await page.waitForSelector('[data-alerts-strip]');
// open what a coach opens: the QR, the assign panel
await page.locator('button[title="Show the QR"]').first().click();
await page.getByRole('button', { name: /Assign .* to others/ }).click();
await page.waitForTimeout(400);

// A string, not a function: tsx compiles page callbacks with esbuild's keepNames, which wraps named functions in
// __name() — a helper that does not exist in the page (the same trap _body-seam-live.mts notes).
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
    if (r.right > W + 0.5 && !clipped(el)) offenders.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 60), right: Math.round(r.right), cls: String(el.className || '').slice(0, 90) });
  }
  return { scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 40), count: offenders.length };
})(${WIDTH})`;
const report = await page.evaluate(MEASURE) as { scrollWidth: number; offenders: { tag: string; text: string; right: number; cls: string }[]; count: number };
await page.screenshot({ path: join(OUT, 'coach-clients-390.png'), fullPage: true });
await page.evaluate('window.scrollTo(0, 0)');
await page.screenshot({ path: join(OUT, 'coach-tabs-390.png'), clip: { x: 0, y: 0, width: WIDTH, height: 140 } });
await browser.close();

console.log(JSON.stringify({ width: WIDTH, scrollWidth: report.scrollWidth, overflowing: report.count, errors, out: OUT }, null, 1));
for (const o of report.offenders) console.log(`  ${o.tag} right=${o.right} "${o.text}" .${o.cls}`);
process.exit(report.scrollWidth <= WIDTH && report.count === 0 && errors.length === 0 ? 0 : 1);
