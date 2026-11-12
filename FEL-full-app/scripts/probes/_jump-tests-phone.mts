// The jump tests at 390 px (JUMP-TESTS, 2026-10-25). No server: scripts/probes/_jump-tests-entry.tsx is bundled with
// esbuild, the app's Tailwind CSS compiled with its own CLI, both loaded into headless Chromium from a file URL.
// Per scene: the flow driven by taps and a picked "video" (its name picks the ground-truth take), no sideways scroll, no
// page error, the elements the scene promises; a full-page screenshot each.
//   npx tsx scripts/probes/_jump-tests-phone.mts [outDir]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'jump-tests-'));
const WIDTH = 390;
const js = join(OUT, 'jt.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_jump-tests-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'jt.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#05070d;color:#fff"><div id="root"></div><script src="jt.js"></script></body></html>`);

const video = (name: string) => ({ name, mimeType: 'video/quicktime', buffer: Buffer.from('stand-in') });
const T = 120_000;
const run = async (page: Page, id: string, name: string, want: string) => {
  await page.click(`[data-test-pick="${id}"]`);
  await page.setInputFiles(`[data-test-file="${id}"]`, video(name));
  return page.waitForSelector(want, { timeout: T }).then(() => true, () => false);
};

const SCENES = ['menu', 'sj', 'sjcheat', 'arms', 'single', 'rj', 'review', 'history', 'fv', 'pilot', 'slowmo', 'kid'] as const;
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const results: Record<string, unknown> = {};
let ok = true;
for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  let found = true;
  if (scene !== 'kid' && scene !== 'slowmo') await page.click('[data-tests-open]');
  if (scene === 'menu') found = await page.isVisible('[data-test-pick="rj105"]');
  if (scene === 'sj') found = await run(page, 'sj', 'sj.mov', '[data-sj-ok]');
  if (scene === 'sjcheat') found = await run(page, 'sj', 'sj-cheat.mov', '[data-test-reasons]');
  if (scene === 'arms') found = await run(page, 'cmjArms', 'cmjArms.mov', '[data-arms-gain]');
  if (scene === 'single') {
    await page.click('[data-test-pick="single"]');
    await page.setInputFiles('[data-test-file="singleLeft"]', video('singleLeft.mov'));
    await page.waitForSelector('[data-test-result="singleLeft"]', { timeout: T });
    await page.setInputFiles('[data-test-file="singleRight"]', video('singleRight.mov'));
    found = await page.waitForSelector('[data-asym]', { timeout: T }).then(() => true, () => false);
  }
  if (scene === 'rj') found = await run(page, 'rj105', 'rj105.mov', '[data-rj-best]');
  if (scene === 'review') {
    found = await run(page, 'cmjHips', 'cmjHips.mov', '[data-review-open]');
    await page.click('[data-review-open]');
    await page.click('[data-edge="land"]');
    await page.click('[data-step="1"]');
    await page.click('[data-step="1"]');
    await page.click('[data-manual-apply]');
    found = found && await page.waitForFunction(() => /manual frames/.test(document.querySelector('[data-test-result]')?.textContent ?? ''), null, { timeout: T }).then(() => true, () => false);
  }
  if (scene === 'history') {
    found = await run(page, 'sj', 'sj.mov', '[data-test-keep]');
    await page.click('[data-test-keep]');
    await page.click('[data-history-open]');
    await page.click('[data-history-keep-live]');
    await page.click('[data-history-export]');
    await page.waitForSelector('[data-history-note]');
    await page.locator('[data-history]').scrollIntoViewIfNeeded();
  }
  if (scene === 'fv') {
    found = await run(page, 'cmjHips', 'cmjHips.mov', '[data-test-result="cmjHips"]');
    for (const load of [20, 40]) {
      await page.click('[data-test-run="cmjHips"] >> text=Read another video');
      await page.fill('[data-test-load]', String(load));
      await page.setInputFiles('[data-test-file="cmjHips"]', video(`cmjHips-${load}.mov`));
      await page.waitForSelector('[data-test-result="cmjHips"]', { timeout: T });
    }
    await page.fill('[data-fv-weight]', '180');
    found = found && await page.waitForSelector('[data-fv-profile]', { timeout: 10_000 }).then(() => true, () => false);
    await page.locator('[data-fv]').scrollIntoViewIfNeeded();
  }
  if (scene === 'pilot') {
    found = await run(page, 'sj', 'sj.mov', '[data-test-result="sj"]');
    await page.fill('[data-pilot-participant]', 'P01');
    await page.fill('[data-pilot-session]', '1');
    await page.fill('[data-pilot-mass]', '80');
    await page.click('[data-pilot-export]');
  }
  if (scene === 'slowmo') {
    await page.click('[data-slowmo-open]');
    await page.setInputFiles('[data-slowmo-file]', video('cmjHips.mov'));
    found = await page.waitForSelector('[data-review-open]', { timeout: T }).then(() => true, () => false);
    await page.click('[data-review-open]');
    await page.click('[data-step="-1"]');
    await page.click('[data-manual-apply]');
    found = found && await page.waitForFunction(() => /manual frames/.test(document.body.textContent ?? ''), null, { timeout: T }).then(() => true, () => false);
  }
  await page.waitForTimeout(200);
  const r = await page.evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    panel: !!document.querySelector('[data-jump-more],[data-slowmo]'),
    best: document.querySelector('[data-test-best],[data-rj-best],[data-slowmo-best]')?.textContent ?? null,
    rows: Array.from(document.querySelectorAll('[data-jump-row]')).map((e) => e.textContent).slice(0, 10),
    velocity: Array.from(document.querySelectorAll('[data-velocity-row]')).map((e) => e.textContent).slice(0, 4),
    extra: document.querySelector('[data-asym],[data-arms-gain],[data-fv-profile],[data-manual-read],[data-history-list],[data-pilot-count]')?.textContent ?? null,
    csv: (window.__csv || []).map((c) => ({ name: c.name, lines: c.text.split('\\r\\n').length - 1, head: c.text.split('\\r\\n').slice(0, 2) })),
  }))()`) as { scrollWidth: number; panel: boolean; csv: { lines: number }[] };
  await page.screenshot({ path: join(OUT, `jump-tests-${scene}-390.png`), fullPage: true });
  const csvOk = scene === 'history' ? r.csv.length === 1 && r.csv[0].lines >= 3 : scene === 'pilot' ? r.csv.length === 1 && r.csv[0].lines >= 7 : true;
  const pass = found && csvOk && r.scrollWidth <= WIDTH && !errors.length && (scene === 'kid' ? !r.panel : r.panel);
  results[scene] = { ...r, found, errors, pass };
  if (!pass) ok = false;
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ out: OUT, ok, results }, null, 1));
process.exit(ok ? 0 : 1);
