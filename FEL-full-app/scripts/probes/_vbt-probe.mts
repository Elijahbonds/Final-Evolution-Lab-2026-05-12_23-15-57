// The bar-speed tool on the rig (VBT, 2026-10-25): every scene of scripts/probes/_vbt-entry.tsx in headless Chromium at a
// phone width (390). No server: the entry is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI. The
// camera is the pose service's own feed, pushed a set the VBT bench films in the page; a barbell's plate is read by the
// real tracker from a grey frame drawn at the bench's plate.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_vbt-probe.mts <outDir>
//
// Checked and printed per scene: no sideways scroll, no page error, the elements the scene promises, and the numbers it
// read against the bench's truth. Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.vbt-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, 'vbt.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_vbt-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'vbt.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="vbt.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, Record<string, unknown>> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const text = (page: Page, sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`) as Promise<string | null>;
const all = (page: Page, sel: string) => page.$$eval(sel, (els) => els.map((e) => e.textContent ?? ''));
const scrollWidth = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;

async function open(scene: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${html}#${scene}`);
  return { page, errors };
}

/** Set up, start, push the bench set through the pose feed (shots on the way), end the set, read the summary. */
async function runSet(scene: string, o: { load?: string; warmup?: boolean; family?: string; lift?: string } = {}) {
  const { page, errors } = await open(scene);
  await page.waitForSelector('[data-vbt-setup]');
  if (o.family) await page.click(`[data-vbt-family="${o.family}"]`);
  if (o.lift) await page.click(`[data-vbt-lift="${o.lift}"]`);
  if (o.load) await page.fill('[data-vbt-load]', o.load);
  await page.fill('[data-vbt-height]', '178');
  if (o.warmup) await page.check('[data-vbt-warmup]');
  const families = await page.$$eval('[data-vbt-family]', (els) => els.map((e) => e.getAttribute('data-vbt-family')));
  const warmupOffered = !!(await page.$('[data-vbt-warmup]'));
  await page.screenshot({ path: join(OUT, `${scene}-1-setup-390.png`), fullPage: true });
  await page.evaluate('window.__feedBegin()');
  await page.click('[data-vbt-start]');
  await page.waitForSelector('[data-vbt-live]');
  const n = await page.evaluate('(window.__F = window.__frames()).length') as number;
  let liveShot = false, stopShot = false;
  const liveSpeeds: string[] = [];
  for (let i = 0; i < n; i += 30) {
    await page.evaluate(`window.__F.slice(${i}, ${i + 30}).forEach((f) => window.__feedPush({ t: f.t, present: true, image: f.image }, f.plateTruth || null))`);
    const sp = await text(page, '[data-vbt-speed]');
    if (sp && liveSpeeds[liveSpeeds.length - 1] !== sp) liveSpeeds.push(sp);
    if (!liveShot && sp && i > n * 0.4) { await page.screenshot({ path: join(OUT, `${scene}-2-live-390.png`) }); liveShot = true; }
    if (!stopShot && await page.$('[data-vbt-stop]')) { await page.screenshot({ path: join(OUT, `${scene}-3-stop-cue-390.png`) }); stopShot = true; }
  }
  const stopLive = !!(await page.$('[data-vbt-stop]'));
  await page.click('[data-vbt-end]');
  await page.waitForSelector('[data-vbt-summary]');
  await page.waitForTimeout(150);
  const r = {
    truth: await page.evaluate('window.__truth'), liveSpeeds, stopLive,
    reps: await all(page, '[data-vbt-rep]'), sumReps: await text(page, '[data-vbt-sum-reps]'), loss: await text(page, '[data-vbt-sum-loss]'),
    source: await text(page, '[data-vbt-source]'), kept: await page.evaluate(`document.querySelector('[data-vbt-kept]')?.getAttribute('data-vbt-kept')`),
    e1rm: await text(page, '[data-vbt-e1rm]'), zoneLoads: await text(page, '[data-vbt-zone-loads]'), profile: await text(page, '[data-vbt-profile]'),
    readiness: await page.evaluate(`document.querySelector('[data-vbt-readiness]')?.getAttribute('data-band') ?? null`),
    milestones: await page.$$eval('[data-vbt-milestone]', (els) => els.map((e) => e.getAttribute('data-vbt-milestone'))),
    teen: await text(page, '[data-vbt-teen]'), families, warmupOffered,
    sent: await page.evaluate('window.__SENT__.map((s) => ({ method: s.method, url: s.url, keys: Object.keys(JSON.parse(s.body || "{}")).sort() }))'),
    scrollWidth: await scrollWidth(page), errors,
  };
  await page.screenshot({ path: join(OUT, `${scene}-4-summary-390.png`), fullPage: true });
  await page.close();
  return r;
}

const mcvs = (reps: string[]) => reps.filter((r) => !/partial/.test(r)).map((r) => Number(/(\d\.\d\d) ±/.exec(r)?.[1] ?? NaN));
const near = (a: number[], b: number[], tol: number) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);

// 1. barbell, read at the plate, saved; the 20 % cue at rep 6
const bb = await runSet('barbell', { load: '100' });
report.barbell = bb;
check(near(mcvs(bb.reps), bb.truth as number[], 0.05), `barbell: 6 reps within 0.05 m/s of the truth (${mcvs(bb.reps)} vs ${bb.truth})`);
check(/plate/.test(String(bb.source)), 'barbell: read at the plate');
check(bb.stopLive, 'barbell: the 20 % stop cue showed live');
check(bb.kept === 'server', 'barbell: saved');
check(JSON.stringify((bb.sent as { keys: string[] }[]).map((s) => s.keys)) === JSON.stringify([['at', 'band', 'bestMcv', 'bestPv', 'day', 'fps', 'lastMcv', 'lift', 'loadKg', 'lossPct', 'meanMcv', 'partials', 'repMcvs', 'reps', 'source', 'stopPct', 'warmup']]), 'barbell: one POST of numbers only');
check(bb.liveSpeeds.length >= 4, 'barbell: the big number changed rep by rep');

// 2. the load-velocity line from two earlier loads + today's 100 kg
const pr = await runSet('profile', { load: '100' });
report.profile = pr;
check(/Estimated max ≈ \d+(\.\d)? ± \d+(\.\d)? kg/.test(String(pr.e1rm)), 'profile: e1RM with its ±');
check(/Accelerative strength today: \d/.test(String(pr.zoneLoads)), 'profile: loads for the coach\'s zone');
check(pr.kept === 'device', 'profile: kept on the phone');

// 3. a warm-up against five normal days: Low
const wu = await runSet('warmup', { load: '100', warmup: true });
report.warmup = wu;
check(wu.readiness === 'low', `warmup: Low (${wu.readiness})`);

// 4. push-ups at the shoulders (pose)
const bo = await runSet('body', { family: 'body', lift: 'push_up' });
report.body = bo;
check(near(mcvs(bo.reps), bo.truth as number[], 0.12), `body: 5 push-ups within 0.12 m/s (${mcvs(bo.reps)} vs ${bo.truth})`);
check(/pose/.test(String(bo.source)), 'body: read from the pose');

// 5. a teen: technique speed only
const te = await runSet('teen', { load: '60' });
report.teen = te;
check(!!te.teen && te.e1rm === null && te.profile === null && te.readiness === null, 'teen: no e1RM, no profile, no readiness');
check(JSON.stringify(te.sent) === '[]', 'teen: nothing sent');
check(JSON.stringify(te.families) === JSON.stringify(['barbell', 'dbkb', 'body']), `teen: no med ball (${te.families})`);
check(!te.warmupOffered, 'teen: no warm-up readiness read offered');
check(JSON.stringify(bb.families) === JSON.stringify(['barbell', 'dbkb', 'body', 'medball']), 'adult: every family');

// 6. a slow-mo clip (240 fps exported at 30): the clock is put back ×8
{
  const { page, errors } = await open('slowmo');
  await page.waitForSelector('[data-vbt-setup]');
  await page.fill('[data-vbt-load]', '100');
  await page.fill('[data-vbt-height]', '178');
  await page.click('[data-vbt-filmed="240"]');
  await page.setInputFiles('[data-vbt-file]', { name: 'squat-slowmo.mov', mimeType: 'video/quicktime', buffer: Buffer.from('not a real video: the rig decodes through the seam') });
  await page.waitForSelector('[data-vbt-summary]');
  const r = { truth: await page.evaluate('window.__truth'), reps: await all(page, '[data-vbt-rep]'), fps: await text(page, '[data-vbt-fps]'), scrollWidth: await scrollWidth(page), errors };
  await page.screenshot({ path: join(OUT, 'slowmo-summary-390.png'), fullPage: true });
  report.slowmo = r;
  check(near(mcvs(r.reps), r.truth as number[], 0.06), `slowmo: 3 reps at the real clock (${mcvs(r.reps)} vs ${r.truth})`);
  check(Number(/[\d.]+/.exec(String(r.fps))?.[0]) > 200, `slowmo: read at the real ~240 fps (${r.fps})`);
  await page.close();
}

// 7. the coach, and 8. under 13
{
  const { page, errors } = await open('coach');
  await page.waitForSelector('[data-vbt-coach]');
  await page.click('[data-vbt-team="t1"]');
  await page.waitForSelector('[data-vbt-team-view]');
  await page.click('[data-vbt-slot="se2"] [data-vbt-zone="strength_speed"]');
  await page.waitForTimeout(150);
  const r = {
    athletes: await page.$$eval('[data-vbt-coach-athlete]', (els) => els.map((e) => e.getAttribute('data-vbt-coach-athlete'))),
    sets: (await all(page, '[data-vbt-coach-set]')).length, loss: await all(page, '[data-vbt-coach-loss]'),
    put: await page.evaluate('window.__SENT__.map((s) => JSON.parse(s.body))'), scrollWidth: await scrollWidth(page), errors,
  };
  await page.screenshot({ path: join(OUT, 'coach-390.png'), fullPage: true });
  report.coach = r;
  check(r.sets === 4, `coach: two sets of the sharing client + two team sets (${r.sets})`);
  check(JSON.stringify(r.put) === JSON.stringify([{ sessionExerciseId: 'se2', zone: 'strength_speed', lossStopPct: 20 }]), 'coach: a zone set on a slot');
  await page.close();
}
{
  const { page, errors } = await open('refused');
  await page.waitForSelector('[data-vbt-refused]');
  await page.screenshot({ path: join(OUT, 'refused-390.png'), fullPage: true });
  report.refused = { text: await text(page, '[data-vbt-refused]'), camera: await page.evaluate('!!document.querySelector("[data-camera-box]")'), scrollWidth: await scrollWidth(page), errors };
  check(report.refused.camera === false, 'refused: no camera');
  await page.close();
}

for (const [k, v] of Object.entries(report)) {
  check((v.scrollWidth as number) <= WIDTH, `${k}: no sideways scroll (${v.scrollWidth})`);
  check((v.errors as string[]).length === 0, `${k}: no page error (${(v.errors as string[]).join(' | ')})`);
}
await browser.close();
rmSync(js); rmSync(css); rmSync(html);
console.log(JSON.stringify({ out: OUT, ok: fails.length === 0, fails, report }, null, 1));
process.exit(fails.length ? 1 : 0);
