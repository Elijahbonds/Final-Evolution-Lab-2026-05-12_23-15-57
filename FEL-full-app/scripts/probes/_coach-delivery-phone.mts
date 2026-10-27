// COACH-DELIVERY phase 2 (2026-10-27): /coach → Clients, the program builder and the inbox/thread at 390 px, measured. The
// real CoachView, bundled with esbuild over the active-coach fixture (scripts/probes/_coach-delivery-entry.tsx), the app's
// Tailwind compiled with its own CLI, in headless Chromium at 390×844 (the _coach-phone-probe.mts mechanism).
//
//   npx tsx scripts/probes/_coach-delivery-phone.mts <outDir> <label> [--root=<another checkout, for the before run>]
//
// Per view (clients = the Clients tab's first screen; builder, inbox, thread = that card scrolled to the top):
//   overflowX      documentElement.scrollWidth - innerWidth (the gate: 0)
//   offenders      visible elements reaching past the right edge not inside a scrolling container
//   words          words of visible text in the first screen (the premium rule: never more than the baseline)
//   sizes          distinct font sizes in the first screen
//   smallTargets   visible buttons/links/inputs/selects in the view under 44 px tall (or wide) — the tap-target gate
//   buttonLooks    distinct button looks on the page (shape, height, weight, fill kind)
// Writes <outDir>/<label>/<view>-390.png and metrics.json.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const HERE = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const ROOT = resolve(args.find((a) => a.startsWith('--root='))?.slice(7) ?? HERE);
const OUT = join(resolve(pos[0] ?? join(HERE, '.coach-delivery')), pos[1] ?? 'now');
mkdirSync(OUT, { recursive: true });
const W = 390, H = 844;

// the same fixture on every checkout: the entry is copied next to the checkout's own CoachView
const entry = join(ROOT, 'scripts/probes/_coach-delivery-entry.tsx');
if (ROOT !== HERE) copyFileSync(join(HERE, 'scripts/probes/_coach-delivery-entry.tsx'), entry);
const js = join(OUT, 'coach.js');
await build({
  entryPoints: [entry], bundle: true, outfile: js, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const css = join(OUT, 'coach.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: readFileSync(js, 'utf8') });
  await page.getByRole('button', { name: 'Clients' }).first().click({ timeout: 20000 });
  await page.waitForSelector('[data-roster-row]', { timeout: 20000 });
  await page.waitForTimeout(800);

  // A string, not a function (tsx keepNames wraps named functions in a helper the page lacks).
  const MEASURE = (top: string) => `((W, H, top) => {
    const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return p.getBoundingClientRect().right <= W + 0.5; } return false; };
    const offenders = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > W + 0.5 && !clipped(el)) offenders.push((el.textContent || '').trim().slice(0, 50));
    }
    let words = 0; const sizes = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').trim(); if (!t) continue;
      const el = n.parentElement; if (!el || !vis(el)) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= H || r.width === 0) continue;
      words += t.split(/\\s+/).filter(Boolean).length; sizes.add(getComputedStyle(el).fontSize);
    }
    const scope = top ? document.querySelector(top) : document.body;
    const targets = Array.from((scope || document.body).querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary')).filter(vis);
    const small = targets.filter((el) => { const r = el.getBoundingClientRect(); const t = el.getAttribute('type'); if (t === 'checkbox' || t === 'radio') return false; return r.height < 44 || r.width < 44; })
      .map((el) => (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 30));
    const looks = new Set(Array.from(document.querySelectorAll('button')).filter(vis).map((b) => { const s = getComputedStyle(b); return [s.borderRadius, Math.round(b.getBoundingClientRect().height / 4), s.fontWeight, s.textTransform, s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'ghost' : 'fill'].join('|'); }));
    return { scrollWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth - W, offenders: offenders.slice(0, 12), offenderCount: offenders.length, words, sizes: sizes.size, smallTargets: small.length, smallSample: small.slice(0, 120), buttonLooks: looks.size };
  })(${W}, ${H}, ${JSON.stringify(top)})`;

  // located by the card's own first words, so the same view is found on a checkout without this lane's data attributes
  const VIEWS: { name: string; starts: string | null }[] = [
    { name: 'clients', starts: null }, { name: 'builder', starts: 'Programs I coach' }, { name: 'inbox', starts: 'Inbox' }, { name: 'thread', starts: 'Thread with' },
  ];
  for (const v of VIEWS) {
    let scope = '';
    if (v.starts) {
      const ok = await page.evaluate(`(() => { const el = Array.from(document.querySelectorAll('.fel-card')).find((c) => (c.textContent || '').trim().startsWith(${JSON.stringify(v.starts)})); if (!el) return false; el.setAttribute('data-measure-view', ${JSON.stringify(v.name)}); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8); return true; })()`);
      if (!ok) { results[v.name] = { missing: v.starts }; continue; }
      scope = `[data-measure-view="${v.name}"]`;
    } else await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(250);
    results[v.name] = await page.evaluate(MEASURE(scope));
    await page.screenshot({ path: join(OUT, `${v.name}-390.png`) });
  }
  await page.evaluate('window.scrollTo(0, 0)');
  await page.screenshot({ path: join(OUT, 'clients-390-full.png'), fullPage: true });
  results.errors = errors;
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ root: ROOT, when: new Date().toISOString(), views: results }, null, 1));
console.log(JSON.stringify(results, null, 1));
