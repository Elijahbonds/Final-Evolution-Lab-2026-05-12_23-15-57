// PLAT-BBS04-2: the team roll-up's daily-drill checkbox, measured in a real browser (the a11y rig's page, no server).
//
//   npx tsx scripts/probes/platform/team-rollup-tap.mts <outDir> [label] [--gate]         build this tree, then measure it
//   npx tsx scripts/probes/platform/team-rollup-tap.mts <outDir> <label> --build-only     bundle this tree as <label> (CPU only)
//   npx tsx scripts/probes/platform/team-rollup-tap.mts <outDir> <label> --prebuilt       measure a bundle built earlier
//
// Prints one JSON line per width (phone 390, desktop 1280): the checkbox's own box (the tap target), where the sentence
// beside it starts, the label's and the card's boxes (the layout around it), the audit's findings (lib/a11y/wcag.ts,
// through scripts/a11y/inpage.ts) and its size test for the box alone, and what a real tap on the box's corner does.
// Writes <outDir>/<label>-<width>.jpg. Run it on two trees and diff the lines: that is the before → after. --build-only
// and --prebuilt split the two halves, so two trees can be bundled one after the other and measured in one browser run.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { buildRig } from '../../a11y/rig.mts';

const OUT = resolve(process.argv[2] ?? 'team-rollup-tap');
const LABEL = process.argv[3] ?? 'now';
const BUILD = join(OUT, `build-${LABEL}`);
mkdirSync(OUT, { recursive: true });
const html = join(BUILD, 'index.html');
if (!process.argv.includes('--prebuilt')) await buildRig(BUILD, { entry: resolve(import.meta.dirname, 'team-rollup-entry.tsx') });
if (process.argv.includes('--build-only')) { console.log(`built → ${BUILD}`); process.exit(0); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
const round = (n: number) => Math.round(n * 10) / 10;
let bad = 0;
for (const vp of [{ w: 390, h: 844, name: 'phone' }, { w: 1280, h: 800, name: 'desktop' }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, hasTouch: vp.w < 600 });
  await page.goto(`file://${html}`);
  await page.waitForFunction('document.body.dataset.a11yReady', null, { timeout: 30000 });
  const m = await page.evaluate(`(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const input = document.querySelector('[data-team-rollup] input[type=checkbox]');
    const label = input.closest('label');
    const text = [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const range = document.createRange(); range.selectNodeContents(text);
    const card = document.querySelector('[data-team-rollup]');
    const next = label.nextElementSibling;
    return { input: box(input), text: box(range), label: box(label), card: box(card), next: next ? box(next) : null,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`) as { input: { x: number; y: number; w: number; h: number }; text: { x: number; y: number; w: number; h: number }; label: { x: number; y: number; w: number; h: number }; card: { x: number; y: number; w: number; h: number }; next: { x: number; y: number; w: number; h: number } | null; sideways: number };
  const scan = await page.evaluate('window.__a11y.staticScan()') as { violations: { rule: string; severity: string; target: string; detail?: string }[] };
  // a real tap 3 px inside the box's top-left corner: it must reach the checkbox and send the one PATCH
  const hit = await page.evaluate(`(() => { const e = document.elementFromPoint(${m.input.x + 3}, ${m.input.y + 3}); return e ? e.tagName + (e.type ? ':' + e.type : '') : null; })()`);
  if (vp.w < 600) await page.touchscreen.tap(m.input.x + 3, m.input.y + 3); else await page.mouse.click(m.input.x + 3, m.input.y + 3);
  await page.waitForTimeout(200);
  const after = await page.evaluate('({ patches: window.__PATCHES, changed: window.__CHANGED })') as { patches: string[]; changed: number };
  await page.locator('[data-team-rollup]').screenshot({ path: join(OUT, `${LABEL}-${vp.w}.jpg`), type: 'jpeg', quality: 88 });
  // the checked look, for the eye
  await page.goto(`file://${html}#on`); await page.reload();
  await page.waitForFunction('document.body.dataset.a11yReady', null, { timeout: 30000 });
  await page.locator('[data-team-rollup]').screenshot({ path: join(OUT, `${LABEL}-${vp.w}-on.jpg`), type: 'jpeg', quality: 88 });
  const r = (b: { x: number; y: number; w: number; h: number } | null) => b && { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
  const targetFindings = scan.violations.filter((v) => v.rule === 'target-size');
  const row = {
    label: LABEL, width: vp.w, tapTarget: `${round(m.input.w)}x${round(m.input.h)}`, tapOk: m.input.w >= 44 && m.input.h >= 44,
    // WCAG 2.5.8's own size test (lib/a11y/wcag.ts isUndersized: under 24 px either way). Only an undersized target can be
    // flagged, and only with another target near it — which this one-card page does not have, so the page's finding
    // list is empty here either way; this field is the part of the rule that is the checkbox's own.
    undersizedFor258: m.input.w < 24 || m.input.h < 24,
    textStartsAt: round(m.text.x), textBox: r(m.text), labelBox: r(m.label), cardBox: r(m.card), nextBox: r(m.next), sideways: m.sideways,
    targetSizeFindings: targetFindings, serious: scan.violations.filter((v) => v.severity === 'serious').length,
    cornerHit: hit, patchesAfterCornerTap: after.patches, changed: after.changed,
  };
  if (!row.tapOk || targetFindings.length || after.patches.length !== 1 || m.sideways > 0) bad++;
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
process.exit(bad && process.argv.includes('--gate') ? 1 : 0);
