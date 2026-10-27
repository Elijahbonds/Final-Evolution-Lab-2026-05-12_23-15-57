// P9 — THE ACCESSIBILITY DEEPENING (lane/premium-ui, docs/PLAN-UI-10PHASE.md). Past the audit's static scan and Tab pass
// (scripts/a11y/audit.mts), on every scene of the premium rig (scripts/premium-ui/entry.tsx), each frozen bundle:
//
//   reduced motion   prefers-reduced-motion: reduce → no element is still running a premium animation (fel-enter,
//                    fel-fade, fel-skeleton, fel-ring-arc, fel-rise) once the page settles; the same with the app's own
//                    setting (data-fel-motion="reduce") and the device saying nothing
//   zoom 200 %       WCAG 1.4.4/1.4.10: the 1280 × 800 desktop at 200 % is a 640 × 400 CSS viewport — no sideways page scroll
//                    and no text clipped by its box
//   text spacing     WCAG 1.4.12: line-height 1.5, paragraph spacing 2em, letter-spacing .12em, word-spacing .16em —
//                    no text clipped by its box (an intended one-line ellipsis — `truncate` / line-clamp — is not a loss:
//                    the text is the element's title-less label repeated in its accessible name, and is counted apart)
//   focus order      the audit's Tab pass (judgeFocus: 2.4.3 order jumps, 2.4.7 visible, 2.4.11 not hidden), phone width
//
//   flock /home/user/wt/gate-queue.lock npx tsx scripts/premium-ui/a11y-deep.mts <outDir> <label> [<label> …] [--scenes=a,b]
// Reads <outDir>/.build-<label> (built by shots.mts --build-only). Writes <outDir>/<label>/deep.json.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../probes/_chromium.mts';
import { SCENES } from './scenes.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0]);
const LABELS = pos.slice(1);
const scenes = (flag('scenes')?.split(',') ?? [...SCENES]).filter(Boolean);
let BUILD = '';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = p.startsWith('/__fonts/') ? join(ROOT, 'app/fonts', p.slice(9)) : existsSync(join(BUILD, p)) && p !== '/' ? join(BUILD, p) : join(ROOT, 'public', p);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const PREMIUM_ANIM = /^(fel-enter|fel-fade|fel-shimmer|fel-ring-fill|fel-rise)$/;
const RUNNING = `(() => [...document.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el);
  return cs.animationName.split(',').some((n) => ${PREMIUM_ANIM}.test(n.trim())) && cs.animationPlayState === 'running' && parseFloat(cs.animationDuration) > 0
    && el.getAnimations().some((a) => a.playState === 'running'); }).length)()`;
/** Text whose box clips it: overflow hidden/clip and the content larger than the box. `ellipsis` = an intended one-liner. */
const CLIPPED = `(() => { let clipped = 0, ellipsis = 0; const where = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const hidesX = /hidden|clip/.test(cs.overflowX), hidesY = /hidden|clip/.test(cs.overflowY);
    const over = (hidesX && el.scrollWidth > el.clientWidth + 1) || (hidesY && el.scrollHeight > el.clientHeight + 1);
    if (!over) continue;
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp) { ellipsis++; continue; }
    clipped++; if (where.length < 6) where.push(el.tagName.toLowerCase() + ' "' + el.textContent.trim().slice(0, 40) + '"');
  }
  return { clipped, ellipsis, where }; })()`;
const SPACING = `(() => { const s = document.createElement('style'); s.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.appendChild(s); })()`;

async function open(page: Page, scene: string) {
  await page.goto(`${ORIGIN}/index.html#${scene}`);
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60000 });
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
for (const label of LABELS) {
  BUILD = join(OUT_ROOT, `.build-${label}`);
  const OUT = join(OUT_ROOT, label);
  mkdirSync(OUT, { recursive: true });
  console.log(`— ${label}`);
  const report: Record<string, unknown> = {};
  for (const s of scenes) {
    const row: Record<string, unknown> = {};
    // reduced motion, from the device
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage(); await open(page, s);
      row.reducedOs = await page.evaluate(RUNNING); await ctx.close();
    }
    // reduced motion, from the app's own setting (the device says nothing)
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
      const page = await ctx.newPage();
      await page.addInitScript(`document.documentElement.setAttribute('data-fel-motion', 'reduce')`);
      await open(page, s);
      row.reducedApp = await page.evaluate(RUNNING); await ctx.close();
    }
    // 200 % zoom of the 1280 × 800 desktop
    {
      const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage(); await open(page, s);
      row.zoom200 = { sideScroll: await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), ...(await page.evaluate(CLIPPED) as object) };
      await ctx.close();
    }
    // text spacing (1.4.12), phone
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage(); await open(page, s);
      const base = await page.evaluate(CLIPPED) as { clipped: number };
      await page.evaluate(SPACING); await page.waitForTimeout(150);
      const spaced = await page.evaluate(CLIPPED) as { clipped: number; ellipsis: number; where: string[] };
      row.textSpacing = { ...spaced, newlyClipped: Math.max(0, spaced.clipped - base.clipped) };
      // focus order (the audit's Tab pass)
      await page.evaluate('location.reload()'); await page.waitForFunction('document.body.dataset.a11yReady', null, { timeout: 60000 }); await page.waitForTimeout(600);
      await page.evaluate('window.__a11y.prepareFocus()');
      const stops: unknown[] = [];
      for (let i = 0; i < 90; i++) {
        await page.keyboard.press('Tab');
        const st = await page.evaluate('window.__a11y.focusStop()') as { body: boolean };
        if (st.body && i > 0) break;
        stops.push(st);
      }
      const v = await page.evaluate(`window.__a11y.judgeFocus(${JSON.stringify(stops)})`) as { rule: string; severity: string }[];
      row.focus = { stops: stops.length, violations: v.length, rules: [...new Set(v.map((x) => x.rule))] };
      await ctx.close();
    }
    report[s] = row;
    const r = row as { reducedOs: number; reducedApp: number; zoom200: { sideScroll: boolean; clipped: number }; textSpacing: { newlyClipped: number; where: string[] }; focus: { stops: number; violations: number; rules: string[] } };
    console.log(`${s.padEnd(13)} reduced os/app ${r.reducedOs}/${r.reducedApp}  zoom200 ${r.zoom200.sideScroll ? 'SIDE-SCROLL' : 'ok'} clipped ${r.zoom200.clipped}  spacing +${r.textSpacing.newlyClipped}  focus ${r.focus.stops} stops ${r.focus.violations} ${r.focus.rules.join(',')}${r.textSpacing.newlyClipped ? `  ${r.textSpacing.where.join(' | ')}` : ''}`);
  }
  writeFileSync(join(OUT, 'deep.json'), JSON.stringify({ label, when: new Date().toISOString(), scenes: report }, null, 1));
}
await browser.close();
server.close();
