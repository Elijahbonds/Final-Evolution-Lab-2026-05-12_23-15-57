// THE ACCESSIBILITY AUDIT (A11-01, lane/a11y-design, 2026-10-25): WCAG 2.2 AA on the ten key pages, measured on the rig.
//
// No new dependency (owner's rule): no axe. The real pages are bundled with esbuild (scripts/a11y/entry.tsx calls each
// page module with the server stubbed), the app's Tailwind CSS is compiled with its own CLI plus app/theme.css, and the
// result is loaded into headless Chromium at a phone (390 × 844) and a desktop (1280 × 800). Per page and width:
//
//   names and roles   every interactive element has an accessible name; every form field a label (4.1.2, 3.3.2, 1.1.1)
//   contrast          every visible text run against the colours computed behind it, gradient stops included (1.4.3)
//   target size       every enabled target is 24 × 24 or spaced to the 2.5.8 exception
//   focus             a real Tab pass: each stop shows a change on screen (2.4.7), is not hidden under fixed chrome
//                     (2.4.11), and the order does not jump back up the page (2.4.3); no positive tabindex
//   landmarks         a <main> and an <h1>
//
// The rules are pure and tested (lib/a11y/wcag.ts). Severity: critical / serious / moderate, defined there.
//
//   npx tsx scripts/a11y/audit.mts <outDir> [label] [--pages=play,train] [--gate=play,train,...]
//
// Writes <outDir>/<label>/audit.json and a full-page shot per page and width. Prints one line per page.
// --gate: exit 1 when any listed page has a critical (the pages this lane owns). Without it the audit only reports.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../probes/_chromium.mts';
import { buildRig } from './rig.mts';
import * as wcagNs from '../../lib/a11y/wcag.ts';
import type { Violation } from '../../lib/a11y/wcag.ts';

// tsx loads a .ts module from this CommonJS package as CJS: its exports arrive under `default` (the probes' unwrap)
const wcag = ((wcagNs as { default?: unknown }).default ?? wcagNs) as typeof wcagNs;
const { dedupe, tally } = wcag;

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0] ?? join(ROOT, '.a11y-audit'));
const LABEL = pos[1] ?? 'now';
const OUT = join(OUT_ROOT, LABEL);
const BUILD = join(OUT_ROOT, '.build');
mkdirSync(OUT, { recursive: true });
mkdirSync(BUILD, { recursive: true });

export const PAGES = ['landing', 'login', 'signup', 'play', 'train', 'profile', 'learn', 'education', 'playbook', 'account'] as const;
const pages = (flag('pages')?.split(',') ?? [...PAGES]).filter(Boolean);
const gate = flag('gate')?.split(',').filter(Boolean) ?? [];
const WIDTHS = [{ w: 390, h: 844, name: 'phone' }, { w: 1280, h: 800, name: 'desktop' }];
const TAB_MAX = 90;

const { html } = await buildRig(BUILD);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });

async function tabPass(page: Page): Promise<Violation[]> {
  await page.evaluate('window.__a11y.prepareFocus()');
  const stops: unknown[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < TAB_MAX; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate('window.__a11y.focusStop()') as { target: string; body: boolean };
    if (s.body && i > 0) break;
    const key = s.target;
    if (seen.has(key) && stops.length > 3) { /* a wrap: the pass is done */ }
    seen.add(key);
    stops.push(s);
  }
  return await page.evaluate(`window.__a11y.judgeFocus(${JSON.stringify(stops)})`) as Violation[];
}

const report: Record<string, unknown> = { label: LABEL, when: new Date().toISOString(), pages: {} };
const lines: string[] = [];
let gateFail = false;
for (const p of pages) {
  const all: Violation[] = [];
  const errors: string[] = [];
  const perWidth: Record<string, unknown> = {};
  for (const vp of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(`file://${html}#${p}`);
    await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 30000 });
    const err = await page.evaluate('document.body.dataset.a11yError || null');
    if (err) errors.push(String(err).slice(0, 400));
    const st = await page.evaluate('window.__a11y.staticScan()') as { violations: Violation[]; interactive: number };
    await page.screenshot({ path: join(OUT, `${p}-${vp.name}.png`), fullPage: true });
    const fv = await tabPass(page);
    const vs = [...st.violations, ...fv];
    perWidth[vp.name] = { interactive: st.interactive, ...tally(dedupe(vs)) };
    all.push(...vs);
    await page.close();
  }
  const uniq = dedupe(all);
  const t = tally(uniq);
  (report.pages as Record<string, unknown>)[p] = { ...t, perWidth, errors, violations: uniq };
  if (gate.includes(p) && t.critical > 0) gateFail = true;
  lines.push(`${p.padEnd(10)} total ${String(t.total).padStart(3)}  critical ${String(t.critical).padStart(3)}  serious ${String(t.serious).padStart(3)}  moderate ${String(t.moderate).padStart(3)}  ${JSON.stringify(t.byRule)}${errors.length ? `  ERRORS ${errors.length}` : ''}`);
}
await browser.close();
const pagesObj = report.pages as Record<string, { total: number; critical: number; serious: number; moderate: number }>;
report.totals = Object.values(pagesObj).reduce((a, t) => ({ total: a.total + t.total, critical: a.critical + t.critical, serious: a.serious + t.serious, moderate: a.moderate + t.moderate }), { total: 0, critical: 0, serious: 0, moderate: 0 });
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(report, null, 1));
console.log(lines.join('\n'));
console.log(`ALL        ${JSON.stringify(report.totals)}  →  ${join(OUT, 'audit.json')}`);
if (gateFail) { console.error(`gate: criticals on ${gate.join(', ')}`); process.exit(1); }
