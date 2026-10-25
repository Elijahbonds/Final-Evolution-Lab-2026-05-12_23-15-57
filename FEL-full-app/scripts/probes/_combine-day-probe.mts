// Combine day on the rig (COMBINE-DAY, 2026-10-25): setup → run → report in headless Chromium at a phone width (390). No
// server: scripts/probes/_combine-day-entry.tsx is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI.
// The jump station's camera is the pose service's own feed, pushed a take JUMP-PRO's bench films in the page.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_combine-day-probe.mts <outDir>
//
// Checked and printed: no sideways scroll, no page error, the held teen cannot be picked, three camera jumps recorded
// from the live take, hand-timed sprint times typed and timed, the report ranked, and what was sent (numbers only).
// Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.combine-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, 'combine.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_combine-day-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'combine.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="combine.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const attr = (page: Page, sel: string, a: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`) as Promise<string | null>;
const text = (page: Page, sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`) as Promise<string | null>;
const scrollWidth = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: join(OUT, `${name}-390.png`), fullPage: full });

async function open(scene: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  return { page, errors };
}

async function typeTime(page: Page, s: string) {
  await page.fill('[data-combine-typed]', s);
  await page.press('[data-combine-typed]', 'Enter');
  await page.waitForTimeout(60);
}

// ── the coach, the account saving ─────────────────────────────────────────────────────────────────────────────────
{
  const { page, errors } = await open('coach');
  await page.waitForSelector('[data-combine-new]');
  await shot(page, '1-home');
  await page.click('[data-combine-new]');
  await page.waitForSelector('[data-combine-setup]');
  const teenDisabled = await page.evaluate(`document.querySelector('[data-combine-athlete="t1"] input')?.disabled ?? null`);
  const picked = await attr(page, '[data-combine-picked]', 'data-combine-picked');
  check(teenDisabled === true, 'setup: the held teen cannot be picked');
  check(picked === '4', `setup: 4 adults picked (got ${picked})`);
  report.setup = { teenDisabled, picked, held: await attr(page, '[data-combine-athlete="t1"]', 'data-held'), scrollWidth: await scrollWidth(page) };
  await shot(page, '2-setup');
  await page.click('[data-combine-begin]');
  await page.waitForSelector('[data-combine-run]');

  // the jump station: every athlete in turn, three jumps each from a live take (each athlete their own height)
  const JUMPERS: [string, number, number][] = [['a1', 1, 7], ['a2', 0.86, 11], ['a3', 1.12, 13], ['a4', 0.95, 17]];
  const jumpSlots: Record<string, string[]> = {};
  for (const [id, k, seed] of JUMPERS) {
    await page.waitForSelector(`[data-combine-current="${id}"] [data-combine-start-camera]`);
    await page.evaluate('window.__feedBegin()');
    await page.click('[data-combine-start-camera]');
    await page.waitForSelector('[data-combine-caption]');
    const n = await page.evaluate(`(window.__F = window.__frames(${k}, ${seed})).length`) as number;
    let liveShot = id !== 'a1';
    for (let i = 0; i < n; i += 40) {
      const done = await page.evaluate(`(() => { window.__F.slice(${i}, ${i + 40}).forEach((f) => window.__feedPush(f)); return !document.querySelector('[data-combine-caption]'); })()`);
      if (done) break;
      if (!liveShot && i > n * 0.5) { await page.waitForTimeout(100); await shot(page, '3-run-jump-live', false); liveShot = true; }
      await page.waitForTimeout(10);
    }
    // all three taken: the camera is gone and the card says so
    await page.waitForFunction(`/All 3 attempts taken/.test(document.querySelector('[data-combine-current="${id}"] [data-combine-attempt]')?.textContent ?? '')`, null, { timeout: 20000 });
    await page.waitForTimeout(100);
    jumpSlots[id] = await page.evaluate(`[...document.querySelectorAll('[data-combine-current="${id}"] [data-slot]')].map((s) => s.textContent)`) as string[];
    if (id === 'a1') await shot(page, '4-run-jump-recorded');
    await page.click('[data-combine-next]');
  }
  for (const [id, slots] of Object.entries(jumpSlots)) check(slots.length === 3 && slots.every((t) => /\d+\.\d in/.test(t)), `run: ${id} three camera jumps recorded (got ${JSON.stringify(slots)})`);
  report.jump = jumpSlots;

  // the agility station: typed hand times, two each
  await page.click('[data-combine-tab="agility:pro-agility"]');
  await page.waitForSelector('[data-combine-run="agility:pro-agility"]');
  for (const pair of [['4.62', '4.55'], ['4.48', '4.51'], ['4.71', '4.69'], ['4.58', '4.60']]) {
    for (const t of pair) await typeTime(page, t);
    await page.click('[data-combine-next]');
  }
  check(/8\/8/.test(String(await page.evaluate(`document.querySelector('[data-combine-tab="agility:pro-agility"]')?.textContent`))), 'run: agility 8/8');

  // the sprint station: typed times for four athletes, one no-mark, one redo
  await page.click('[data-combine-tab="sprint:40yd"]');
  await page.waitForSelector('[data-combine-run="sprint:40yd"]');
  for (const t of ['5.02', '4.91']) await typeTime(page, t);
  await page.click('[data-combine-next]');
  await typeTime(page, '4.88');
  await typeTime(page, '4.95');
  await page.click('[data-combine-redo]');
  await typeTime(page, '4.86');
  await page.click('[data-combine-next]');
  await typeTime(page, '5.31');
  await page.click('[data-combine-no-mark]');
  await page.click('[data-combine-next]');
  // the stopwatch itself: start, wait, stop, record
  await page.click('[data-combine-stopwatch]');
  await page.waitForTimeout(4900);   // a 40-yard dash's worth of stopwatch
  await page.click('[data-combine-stopwatch]');
  await shot(page, '5-run-sprint-stopwatch');
  await page.click('[data-combine-keep-time]');
  await page.waitForTimeout(80);
  await typeTime(page, '5.10');
  await page.waitForTimeout(1500);   // the save fires SYNC_DELAY_MS after the last change
  await shot(page, '6-run-sprint-done');
  const progress = await page.evaluate(`document.querySelector('[data-combine-tab="sprint:40yd"]')?.textContent`);
  check(/8\/8/.test(String(progress)), `run: the sprint station 8/8 (got ${progress})`);
  check(!!(await page.$('[data-combine-station-done]')), 'run: the station says done');
  report.sprint = { progress, status: await text(page, '[data-combine-status]') };

  await page.click('[data-combine-to-report]');
  await page.waitForSelector('[data-combine-report]');
  await page.waitForTimeout(100);
  const rows = await page.evaluate(`[...document.querySelectorAll('[data-combine-row]')].map((r) => r.textContent)`) as string[];
  check(rows.length === 4, `report: 4 rows on the composite (got ${rows.length})`);
  check(rows.every((r) => !/incomplete/.test(r)) && rows.every((r) => /^\d/.test(r)), 'report: every athlete complete and ranked');
  check(!!(await page.$('[data-combine-csv]')), 'report: CSV button');
  report.report = { rows, scrollWidth: await scrollWidth(page) };
  await shot(page, '7-report');

  const sent = await page.evaluate('window.__SENT__') as { method: string; url: string; body: string }[];
  const bodies = sent.map((s) => s.body).join('\n');
  check(sent.some((s) => s.method === 'POST' && s.url === '/api/coach/combine'), 'sync: the combine was created on the account once');
  check(sent.filter((s) => s.method === 'POST').length === 1, `sync: exactly one create (got ${sent.filter((s) => s.method === 'POST').length})`);
  check(sent.some((s) => s.method === 'PUT'), 'sync: the numbers were saved');
  check(!/data:image|frames|"image"|video|t1/.test(bodies), 'sync: numbers only, and nothing about the held teen');
  report.sent = sent.map((s) => ({ method: s.method, url: s.url, keys: Object.keys(JSON.parse(s.body || '{}')) }));
  for (const [k, v] of Object.entries(report)) if ((v as { scrollWidth?: number })?.scrollWidth) check((v as { scrollWidth: number }).scrollWidth <= WIDTH, `${k}: no sideways scroll`);
  check(errors.length === 0, `coach: page errors ${errors.join(' | ')}`);
  report.coachErrors = errors;
  await page.close();
}

// ── before the SQL: the combine is a draft on this phone ─────────────────────────────────────────────────────────
{
  const { page, errors } = await open('draft');
  await page.waitForSelector('[data-combine-coming-soon]');
  await page.click('[data-combine-new]');
  await page.click('[data-combine-begin]');
  await page.click('[data-combine-tab="sprint:40yd"]');
  await typeTime(page, '4.99');
  await page.click('[data-combine-to-report]');
  await page.waitForSelector('[data-combine-report]');
  await page.waitForTimeout(1500);
  const kept = await page.evaluate(`localStorage.getItem('fel.combine.drafts.v1')`) as string | null;
  const sent = await page.evaluate('window.__SENT__') as unknown[];
  check(!!kept && kept.includes('4.99'), 'draft: kept on the phone');
  check(sent.length === 0, 'draft: nothing sent before the SQL');
  report.draft = { kept: !!kept, sent: sent.length, errors };
  check(errors.length === 0, `draft: page errors ${errors.join(' | ')}`);
  await shot(page, '8-draft-report');
  await page.close();
}

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ report, fails }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.error(`FAIL:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log('combine-day probe: every check held');
