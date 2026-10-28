// The daily readiness check on the rig (COACH-READINESS, 2026-10-25): every scene of scripts/probes/_coach-readiness-entry.tsx
// in headless Chromium at a phone width (390). No server: the entry is bundled with esbuild, the app's Tailwind CSS
// compiled with its own CLI. The check's camera is the pose service's own feed, pushed a take JUMP-PRO's bench films in
// the page; the POST is answered by the server's own pure read.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_coach-readiness-probe.mts <outDir>
//
// Checked and printed per scene: no sideways scroll, no page error, the elements the scene promises, and the numbers it
// read. Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

// tsx loads these .ts modules as CommonJS under an .mts entry, so their names are read off the namespace
const load = async <T,>(p: string): Promise<T> => { const m = await import(p) as Record<string, unknown>; return { ...(m.default as object), ...m } as T; };
const { loadToday } = await load<typeof import('../../lib/coach/todayServer.ts')>('../../lib/coach/todayServer.ts');
const { catalogueRow, newTodayStore, seedProgram, todayMemoryDb } = await load<typeof import('../../lib/coach/todayMemoryDb.ts')>('../../lib/coach/todayMemoryDb.ts');
const { DEFAULT_RULE } = await load<typeof import('../../lib/coach/readiness/rules.ts')>('../../lib/coach/readiness/rules.ts');

/** Today for an athlete whose check read Low under the default rule: the real loadToday over the Today harness. */
async function todayPayload() {
  const s = newTodayStore();
  s.user.push({ id: 'coach-1', name: 'Coach Dee', email: 'dee@x.test' }, { id: 'client-1', name: 'Maya', email: 'maya@x.test', dobYear: 1992 });
  s.pe.push(
    catalogueRow({ id: 'pe-squat', coachId: 'coach-1', name: 'Back Squat', pattern: 'squat', primaryCues: ['Brace, then sit between the heels'] }),
    catalogueRow({ id: 'pe-split', coachId: 'coach-1', name: 'Rear-foot Split Squat' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Chest-supported Row' }),
    catalogueRow({ id: 'pe-flow', coachId: 'coach-1', name: '90/90 Hip Switch' }),
  );
  seedProgram(s, { coachId: 'coach-1', clientId: 'client-1', name: 'Off-season strength', blockLabel: 'Week 3', sessions: [{ order: 1, label: 'Lower A', exercises: [
    { exerciseId: 'pe-flow', section: 'prep', sets: 2, reps: '6 each side', load: 'body' },
    { exerciseId: 'pe-squat', section: 'key', isKeySet: true, sets: 4, reps: '5', load: '100 kg', effortBand: 'surge' },
    { exerciseId: 'pe-split', section: 'assist', sets: 3, reps: '8 each', load: '20 kg' },
    { exerciseId: 'pe-row', section: 'assist', sets: 3, reps: '10', load: 'RPE 7' },
  ] }] });
  const day = new Date().toISOString().slice(0, 10);
  return loadToday(todayMemoryDb(s) as never, 'client-1', new Date(), {
    readiness: async () => ({ band: 'low' as const, reason: 'low_drop' as const, ease: true, dropPct: 9.1, feel: 2, baselineN: 6, rule: DEFAULT_RULE, coachTold: true, shared: true, day }),
  });
}
const TODAY_PAYLOAD = JSON.stringify(await todayPayload());

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.readiness-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, 'readiness.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-readiness-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'readiness.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="readiness.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const text = (page: Page, sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`) as Promise<string | null>;
const scrollWidth = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;

async function open(scene: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(`window.__TODAY__ = ${TODAY_PAYLOAD}`);
  await page.goto(`file://${html}#${scene}`);
  return { page, errors };
}

/** Start the check, push the bench take through the pose feed, wait for the result. */
async function runCheck(scene: 'check' | 'solo') {
  const { page, errors } = await open(scene);
  await page.waitForSelector('[data-readiness-start]:not([disabled])');
  await page.click(`[data-feel="${scene === 'check' ? 2 : 4}"]`);
  await page.screenshot({ path: join(OUT, `${scene}-1-intro-390.png`), fullPage: true });
  await page.evaluate('window.__feedBegin()');
  await page.click('[data-readiness-start]');
  await page.waitForSelector('[data-readiness-caption]');
  const n = await page.evaluate('(window.__F = window.__frames()).length') as number;
  let shot = false;
  for (let i = 0; i < n; i += 40) {
    const done = await page.evaluate(`(() => { const fs = window.__F.slice(${i}, ${i + 40}); fs.forEach((f) => window.__feedPush(f)); return !!document.querySelector('[data-readiness-result]'); })()`);
    if (done) break;
    if (!shot && i > n * 0.55) { await page.waitForTimeout(120); await page.screenshot({ path: join(OUT, `${scene}-2-live-390.png`) }); shot = true; }
    await page.waitForTimeout(15);
  }
  await page.waitForSelector('[data-readiness-result]', { timeout: 20000 });
  await page.waitForTimeout(150);
  const r = {
    band: await page.evaluate(`document.querySelector('[data-readiness-result]')?.getAttribute('data-band')`),
    line: await text(page, '[data-readiness-line]'), next: await text(page, '[data-readiness-next]'), best: await text(page, '[data-readiness-best]'),
    kept: await page.evaluate(`document.querySelector('[data-readiness-kept]')?.getAttribute('data-readiness-kept')`),
    trend: await page.evaluate(`!!document.querySelector('[data-readiness-trend]')`),
    sent: await page.evaluate('window.__SENT__.map((s) => ({ method: s.method, url: s.url, keys: Object.keys(JSON.parse(s.body || "{}")) }))'),
    scrollWidth: await scrollWidth(page), errors,
  };
  await page.screenshot({ path: join(OUT, `${scene}-3-result-390.png`), fullPage: true });
  await page.close();
  return r;
}

// 1. a coached adult who saves: today 9 % down → Low, eased, coach told
const coached = await runCheck('check') as Record<string, unknown>;
report.check = coached;
check(coached.band === 'low', 'check: band Low');
check(/eased.*Coach Dee has been told/.test(String(coached.next)), 'check: eased + coach told');
check(coached.kept === 'server', 'check: saved');
check(JSON.stringify(coached.sent) === JSON.stringify([{ method: 'POST', url: '/api/readiness/check', keys: ['day', 'bestCm', 'meanCm', 'teCm', 'jumps', 'poseHz', 'feel'] }]), 'check: one POST of numbers only');

// 2. a solo adult, kept on the phone: today up → Ready
const solo = await runCheck('solo') as Record<string, unknown>;
report.solo = solo;
check(solo.band === 'ready', 'solo: band Ready');
check(/harder session/.test(String(solo.next)), 'solo: a suggestion');
check(solo.kept === 'device', 'solo: kept on the phone');
check(JSON.stringify(solo.sent) === '[]', 'solo: nothing sent');

// 3. the athlete's Today, eased
{
  const { page, errors } = await open('today');
  await page.waitForSelector('[data-readiness-today-note]', { timeout: 20000 });
  await page.waitForTimeout(200);
  const r = {
    note: await text(page, '[data-readiness-today-note]'),
    eased: await page.$$eval('[data-readiness-eased] li', (els) => els.map((e) => e.textContent)),
    dose: await page.$$eval('[data-testid="today"] h3, [data-testid="today"] .fel-heading', (els) => els.map((e) => e.textContent)).catch(() => []),
    scrollWidth: await scrollWidth(page), errors,
  };
  await page.screenshot({ path: join(OUT, 'today-eased-390.png'), fullPage: true });
  report.today = r;
  check(r.eased.length === 3 && /Back Squat: 4 → 3 sets, 100 kg → 90 kg/.test(r.eased[0] ?? ''), 'today: the squat eased');
  await page.close();
}

// 4. the coach's panel, rules open
{
  const { page, errors } = await open('coach');
  await page.waitForSelector('[data-readiness-alert]');
  await page.click('[data-readiness-rules-toggle]');
  await page.waitForSelector('[data-readiness-rules-editor]');
  const r = { alert: await text(page, '[data-readiness-alert]'), rules: await page.$$eval('[data-readiness-rule]', (els) => els.map((e) => e.getAttribute('data-readiness-rule'))), scrollWidth: await scrollWidth(page), errors };
  await page.screenshot({ path: join(OUT, 'coach-panel-390.png'), fullPage: true });
  await page.click('[data-readiness-rule="athlete:a2"] button');
  await page.waitForTimeout(150);
  (r as Record<string, unknown>).put = await page.evaluate('window.__SENT__.map((s) => JSON.parse(s.body))');
  report.coach = r;
  check(r.rules.length === 4, 'coach: a team and three athletes');
  await page.close();
}

// 5. a teen and 6. the trend
for (const scene of ['teen', 'trend']) {
  const { page, errors } = await open(scene);
  await page.waitForSelector(scene === 'teen' ? '[data-readiness-adults-only]' : '[data-readiness-trend]');
  await page.screenshot({ path: join(OUT, `${scene}-390.png`), fullPage: true });
  report[scene] = { text: await text(page, scene === 'teen' ? '[data-readiness-adults-only]' : '[data-readiness-trend]'), cameraBox: await page.evaluate('!!document.querySelector("[data-camera-box]")'), scrollWidth: await scrollWidth(page), errors };
  await page.close();
}

for (const [k, v] of Object.entries(report)) {
  const r = v as { scrollWidth: number; errors: string[] };
  check(r.scrollWidth <= WIDTH, `${k}: no sideways scroll (${r.scrollWidth})`);
  check(r.errors.length === 0, `${k}: no page error (${r.errors.join(' | ')})`);
}
await browser.close();
console.log(JSON.stringify({ out: OUT, ok: fails.length === 0, fails, report }, null, 1));
process.exit(fails.length ? 1 : 0);
