// /train/speed on the rig (SPRINT-SPEED, 2026-10-25): scripts/probes/_sprint-speed-entry.tsx in headless Chromium at a
// phone width (390). No server: the entry is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI. The
// camera is the pose service's feed, pushed synthetic sprinters; every time shown is a real read of those frames.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_sprint-speed-probe.mts <outDir>
//
// Runs, in one browser context (so the history builds up): a 40 yd on the phone's Go (centre line), a flying 10 (four
// taps), a speed trace (two marker taps, the profile), a 5-10-5 (three cone taps), then the history and its CSV, and the
// adults-only line. Checked per run: no sideways scroll, no page error, the read within its own ± of the truth, nothing
// sent (fetch is replaced and must stay unused). Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.sprint-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, 'sprint.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_sprint-speed-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'sprint.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script>window.__FETCHED__=[];window.fetch=function(u){window.__FETCHED__.push(String(u));return Promise.reject(new Error('no network in the rig'))};</script><script src="sprint.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const text = (page: Page, sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`) as Promise<string | null>;
const scrollWidth = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;
const errors: string[] = [];

const page = await context.newPage();
/** On a timeout: a shot and the runner's state, so a failing probe says why. */
async function waitFor(sel: string, timeout = 15000) {
  try { await page.waitForSelector(sel, { timeout }); } catch (e) {
    await page.screenshot({ path: join(OUT, 'FAIL-390.png'), fullPage: true }).catch(() => {});
    const st = await page.evaluate(`(() => { const r = document.querySelector('[data-sprint-runner]'); return { phase: r?.getAttribute('data-sprint-phase'), taps: r?.getAttribute('data-sprint-taps'), why: document.querySelector('[data-sprint-why]')?.textContent ?? null }; })()`).catch(() => null);
    console.log(JSON.stringify({ waitingFor: sel, state: st, errors }));
    throw e;
  }
}
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`file://${html}#app`);
await page.waitForSelector('[data-speed-app]');
await page.evaluate('window.__sprint.begin()');
await page.screenshot({ path: join(OUT, '1-setup-gate-390.png'), fullPage: true });

/** Tap normalised points on the camera overlay. */
async function tapAll(kind: string) {
  const pts = await page.evaluate(`window.__sprint.taps.${kind}`) as { x: number; y: number }[];
  await page.locator('[data-sprint-overlay]').scrollIntoViewIfNeeded();   // a mouse click off the viewport lands nowhere
  const box = (await page.locator('[data-sprint-overlay]').boundingBox())!;
  for (const p of pts) { await page.mouse.click(box.x + p.x * box.width, box.y + p.y * box.height); await page.waitForTimeout(60); }
}
/** Push the loaded frames in chunks until a result shows. */
async function pushUntilResult(shotAt?: { frac: number; name: string }) {
  const total = await page.evaluate('window.__sprint.push(0)') as number;
  let shot = false;
  for (;;) {
    const left = await page.evaluate('window.__sprint.push(20)') as number;
    if (shotAt && !shot && left < total * (1 - shotAt.frac)) { await page.waitForTimeout(80); await page.screenshot({ path: join(OUT, shotAt.name) }); shot = true; }
    if (await page.$('[data-sprint-result]')) break;
    if (left === 0) { await page.waitForTimeout(400); if (!(await page.$('[data-sprint-result]'))) await page.click('[data-sprint-stop]').catch(() => {}); break; }
    await page.waitForTimeout(20);
  }
  await page.waitForSelector('[data-sprint-result]', { timeout: 20000 });
  await page.waitForTimeout(200);
}
const secs = (s: string | null) => Number(/([\d.]+) s ± ([\d.]+)/.exec(s ?? '')?.[1] ?? NaN);
const band = (s: string | null) => Number(/± ([\d.]+)/.exec(s ?? '')?.[1] ?? NaN);

// 1. a 40 yd on the phone's Go, the centre line
{
  await page.click('[data-sprint-camera]');
  await waitFor('[data-sprint-phase="calibrate"]');
  await page.click('[data-sprint-centre]');
  await waitFor('[data-sprint-phase="ready"]');
  await page.screenshot({ path: join(OUT, '2-gate-ready-390.png'), fullPage: true });
  await page.click('[data-sprint-arm]');
  await page.waitForSelector('[data-sprint-call="set"]', { timeout: 8000 });
  await page.screenshot({ path: join(OUT, '3-gate-set-390.png') });
  await page.waitForSelector('[data-sprint-go-at]', { timeout: 10000 });
  const goAt = Number(await page.evaluate(`document.querySelector('[data-sprint-go-at]').getAttribute('data-sprint-go-at')`));
  const { truthS } = await page.evaluate(`window.__sprint.load('gate', ${goAt})`) as { truthS: number };
  await pushUntilResult({ frac: 0.45, name: '4-gate-running-390.png' });
  const t = await text(page, '[data-sprint-time]');
  const r = { time: t, truthS: Math.round(truthS * 1000) / 1000, reaction: !!(await page.$('[data-sprint-reaction]')), estimate: await text(page, '[data-sprint-estimate]'), kept: await page.evaluate(`document.querySelector('[data-sprint-kept]')?.getAttribute('data-sprint-kept')`) };
  await page.screenshot({ path: join(OUT, '5-gate-result-390.png'), fullPage: true });
  report.gate = r;
  // data-sprint-go-at is the start the timer uses (the Go as heard); the frames were filmed from it
  check(Math.abs(secs(t) - truthS) <= Math.max(band(t), 0.02), `gate: ${t} vs truth ${truthS.toFixed(3)} s`);
  check(r.reaction, 'gate: says the reaction is included');
  check(r.kept === 'device', 'gate: kept on the phone');
}

// 2. a flying 10: four taps
{
  await page.click('[data-sprint-chip="test:flying"]');
  await page.waitForSelector('[data-sprint-diagram="flying"]');
  await waitFor('[data-sprint-phase="calibrate"]');
  await tapAll('flying');
  await waitFor('[data-sprint-phase="ready"]');
  await page.screenshot({ path: join(OUT, '6-flying-ready-390.png'), fullPage: true });
  await page.click('[data-sprint-arm]');
  const { truthS } = await page.evaluate(`window.__sprint.load('flying', performance.now() + 1500)`) as { truthS: number };
  await pushUntilResult();
  const t = await text(page, '[data-sprint-time]');
  report.flying = { time: t, truthS: Math.round(truthS * 1000) / 1000, splits: await text(page, '[data-sprint-splits]') };
  await page.screenshot({ path: join(OUT, '7-flying-result-390.png'), fullPage: true });
  check(Math.abs(secs(t) - truthS) <= Math.max(band(t), 0.02), `flying: ${t} vs truth ${truthS.toFixed(3)} s`);
}

// 3. a speed trace: two markers 28 m apart, start from still in view
{
  await page.click('[data-sprint-chip="test:trace"]');
  await page.fill('[data-sprint-marker-m]', '28');
  await page.fill('[data-sprint-height]', '180');
  await page.fill('[data-sprint-mass]', '78');
  await waitFor('[data-sprint-phase="calibrate"]');
  await tapAll('trace');
  await waitFor('[data-sprint-phase="ready"]');
  await page.click('[data-sprint-arm]');
  await page.evaluate(`window.__sprint.load('trace', performance.now() + 1500)`);
  await pushUntilResult();
  const r = { top: await text(page, '[data-sprint-top]'), vmax: await text(page, '[data-sprint-vmax]'), chart: !!(await page.$('[data-sprint-chart]')), profile: !!(await page.$('[data-sprint-profile]')), splits: await text(page, '[data-sprint-splits]') };
  await page.screenshot({ path: join(OUT, '8-trace-result-390.png'), fullPage: true });
  report.trace = r;
  const vm = Number(/([\d.]+) m\/s ± ([\d.]+)/.exec(r.vmax ?? '')?.[1]);
  check(Math.abs(vm - 9.2) <= Math.max(band(r.vmax), 0.15), `trace: v_max ${r.vmax} vs 9.2`);
  check(r.chart && r.profile, 'trace: the chart and the profile');
}

// 4. the 5-10-5: three cones, first movement
{
  await page.click('[data-sprint-chip="test:agility"]');
  await page.click('[data-sprint-chip="start:movement"]');
  await waitFor('[data-sprint-phase="calibrate"]');
  await tapAll('agility');
  await waitFor('[data-sprint-phase="ready"]');
  await page.screenshot({ path: join(OUT, '9-agility-ready-390.png'), fullPage: true });
  await page.click('[data-sprint-arm]');
  const { truthS } = await page.evaluate(`window.__sprint.load('agility', performance.now() + 1500)`) as { truthS: number };
  await pushUntilResult();
  const t = await text(page, '[data-sprint-time]');
  report.agility = { time: t, truthS: Math.round(truthS * 1000) / 1000, splits: await text(page, '[data-sprint-splits]') };
  await page.screenshot({ path: join(OUT, '10-agility-result-390.png'), fullPage: true });
  check(Math.abs(secs(t) - truthS) <= Math.max(band(t), 0.03), `agility: ${t} vs truth ${truthS.toFixed(3)} s`);
}

// 5. the history and its CSV
{
  const rows = await page.$$eval('[data-sprint-history-list] li', (els) => els.map((e) => e.textContent));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-sprint-csv]')]);
  const p = join(OUT, 'sprint-times.csv');
  await dl.saveAs(p);
  const csv = readFileSync(p, 'utf8').trim().split('\n');
  await page.locator('[data-sprint-history]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, '11-history-390.png'), fullPage: true });
  report.history = { rows, csvLines: csv.length, csvHead: csv[0] };
  check(rows.length === 4, `history: four runs (${rows.length})`);
  check(csv.length === 5 && csv.slice(1).every((l) => l.includes('camera estimate')), 'csv: a header and four camera rows');
}
report.app = { scrollWidth: await scrollWidth(page), errors: [...errors], fetched: await page.evaluate('window.__FETCHED__') };
check((report.app as { scrollWidth: number }).scrollWidth <= WIDTH, 'app: no sideways scroll');
check(errors.length === 0, `app: no page error (${errors.join(' | ')})`);
check(JSON.stringify((report.app as { fetched: unknown }).fetched) === '[]', 'app: nothing fetched');
await page.close();

// 6. a non-adult
{
  const p2 = await context.newPage();
  await p2.goto(`file://${html}#teen`);
  await p2.waitForSelector('[data-sprint-adults-only]');
  await p2.screenshot({ path: join(OUT, '12-teen-390.png'), fullPage: true });
  report.teen = { text: await text(p2, '[data-sprint-adults-only]'), camera: !!(await p2.$('[data-camera-box]')) };
  check(!(report.teen as { camera: boolean }).camera, 'teen: no camera');
  await p2.close();
}

// 7. combine day: a sprint station set to the camera
{
  const p3 = await context.newPage();
  const errs: string[] = [];
  p3.on('pageerror', (e) => errs.push(String(e)));
  await p3.goto(`file://${html}#combine`);
  await p3.waitForSelector('[data-combine-camera-timer]');
  await p3.screenshot({ path: join(OUT, '13-combine-camera-station-390.png'), fullPage: true });
  report.combine = { name: await text(p3, 'h2'), slotCamera: !!(await p3.$('[data-slot-camera]')), stopwatchFallback: !!(await p3.$('[data-combine-use-stopwatch]')), scrollWidth: await p3.evaluate('document.documentElement.scrollWidth'), errors: errs };
  check((report.combine as { name: string }).name === 'Sprint · 40 yd (camera)', 'combine: the station says camera');
  check((report.combine as { slotCamera: boolean }).slotCamera, 'combine: the camera attempt is marked');
  check(errs.length === 0, `combine: no page error (${errs.join(' | ')})`);
  check(((report.combine as { scrollWidth: number }).scrollWidth) <= WIDTH, 'combine: no sideways scroll');
  await p3.close();
}

await browser.close();
console.log(JSON.stringify({ out: OUT, ok: fails.length === 0, fails, report }, null, 1));
process.exit(fails.length ? 1 : 0);
