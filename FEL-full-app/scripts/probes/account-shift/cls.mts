// ACCOUNT-SHIFT (2026-11-12): /account's layout shift, read the way the every-screen scorer (v6) reads it.
//
// The scorer's own load (scripts/every-screen/score.mts loadOnce): a 390 × 844 phone, CPU throttled 4×, the layout-shift
// observer installed before the page's first script (INIT below, copied word for word from score.mts, which does not
// export it), load + network idle + 1 s, then the in-page measure (scripts/every-screen/inpage.ts `__es.measure()`) gives
// the CLS. One fresh browser context per read. The scorer itself takes the lower of two reads only when first content was
// slow; here every read is kept and the median reported.
//
// Before a single /account number is believed, the same load reads two control pages (scripts/every-screen/controls.mts):
// `clean` must read under the 0.02 budget and `fault-fast`, which plants a late banner that pushes the page down, must
// read over it. Run against the rig (scripts/every-screen/rig.mts) on a lane's own throwaway database and port:
//
//   ES_PG_PORT=55451 ES_PG_DIR=/var/lib/postgresql/account-shift-pg ES_PORT=3751 ES_DIST=.next-account-shift \
//   ES_OUT=<scratch>/es-out /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/account-shift/cls.mts [--reads=5] [--seed=optin]
//
// `--seed=optin` first opts the rig's adult (solo) in and gives them two saved jump numbers in that throwaway database, so
// the panel's list is on the page too. `--tz=America/Los_Angeles` reads in that time zone (to see the saved time arrive
// in the person's own zone). The person read is always solo: born 1996, a verified adult, who sees the panel.
//
// Measured 2026-11-12 (lane account-shift): before, the panel's two requests race the first paint, so a read is either
// 0.001 or a full 0.112 shift (5 of 15 reads shifted; opted in with two saved numbers, 4 of 7 shifted, up to 0.156).
// After, 22 of 22 reads 0.001 (10 not opted in, 12 opted in with the list, 5 of those in two other time zones).
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, ROOT, dbUp, people, serve, sql, storageState, STATE } from '../../every-screen/rig.mts';
import { CONTROLS } from '../../every-screen/controls.mts';

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const READS = Number(flag('reads') ?? 5);

const INIT = `window.__esCls = 0; window.__esLong = 0; window.__esShifts = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__esCls += e.value; for (const src of (e.sources || [])) { const n = src.node; window.__esShifts.push(Math.round(e.value * 1000) / 1000 + ' ' + (n && n.nodeType === 1 ? n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') : '#text')); } } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { window.__esLong += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}`;

type State = ReturnType<typeof storageState>;
async function readOnce(browser: Browser, state: State, url: string, inpage: string, html?: string) {
  const ctx = await browser.newContext({ ...(flag('tz') ? { timezoneId: flag('tz') } : {}), viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: state, permissions: ['camera', 'microphone'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 EveryScreenRig' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
  await page.addInitScript(INIT);
  if (html != null) await page.route(ORIGIN + url, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const resp = await page.goto(ORIGIN + url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.evaluate(inpage);
  const m = await page.evaluate('window.__es.measure()') as { cls: number; shifts: string[]; fcp: number | null };
  const panel = await page.locator('[data-testid="scan-save-account"]').count();
  // the first saved number as the person sees it (its time must be their local time, and visible)
  const firstItem = await page.evaluate(`(() => { const li = document.querySelector('[data-testid="scan-save-account"] li'); return li ? li.innerText + (li.querySelector('span[style*="hidden"]') ? ' [time still hidden]' : '') : null; })()`) as string | null;
  const finalPath = new URL(page.url()).pathname;
  await ctx.close();
  return { cls: m.cls, shifts: m.shifts, fcp: m.fcp, status: resp?.status() ?? null, panel, finalPath, errors, firstItem };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

dbUp();
const stop = await serve(join(STATE, 'server.log'));
try {
  const ppl = await people();
  if (flag('seed') === 'optin') {
    const id = ppl.ids.solo;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('unexpected user id');
    sql(`insert into "ScanSaveOptIn" (id, "userId", scope, granted, "grantedAt", "revokedAt", "consentTextVersion", "createdAt", "updatedAt") values ('acct-shift-optin', '${id}', 'jump_numbers', true, now(), null, 'v1', now(), now()) on conflict ("userId") do update set granted = true, "revokedAt" = null, scope = 'jump_numbers'`);
    if (sql(`select count(*) from "WorkoutScan" where "userId" = '${id}' and kind = 'dunk'`) === '0') {
      for (const [n, v] of [['1', 61], ['2', 63]] as const) sql(`insert into "WorkoutScan" (id, "userId", kind, metrics, "createdAt") values ('acct-shift-${n}', '${id}', 'dunk', '{"verticalCm": ${v}, "flightTimeMs": 500}', now() - interval '${n} day')`);
    }
    console.log('seeded: solo opted in, two saved jump numbers');
  }
  const inpage = (await build({ entryPoints: [join(ROOT, 'scripts/every-screen/inpage.ts')], bundle: true, format: 'iife', platform: 'browser', write: false, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' })).outputFiles[0].text;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // the controls first: the probe must see a planted shift, and must not see one on the clean page
    let controlsOk = true;
    for (const name of ['clean', 'fault-fast']) {
      const c = CONTROLS.find((x) => x.name === name)!;
      const r = await readOnce(browser, { cookies: [], origins: [] }, `/__es-control/${name}`, inpage, c.html);
      const ok = name === 'clean' ? r.cls <= 0.02 : r.cls > 0.02;
      controlsOk &&= ok;
      console.log(`control ${name.padEnd(10)} cls ${r.cls.toFixed(3)} ${ok ? 'as expected' : 'WRONG'}  ${r.shifts.join(' | ')}`);
    }
    if (!controlsOk) { console.log('CONTROLS FAILED: the /account reads below are not to be believed'); process.exitCode = 1; }
    const state = storageState(ppl, 'solo');
    const reads: number[] = [];
    for (let i = 0; i < READS; i++) {
      const r = await readOnce(browser, state, '/account', inpage);
      reads.push(r.cls);
      console.log(`/account read ${i + 1}: cls ${r.cls.toFixed(3)} status ${r.status} at ${r.finalPath} panel ${r.panel ? 'shown' : 'NOT SHOWN'} fcp ${r.fcp}${r.firstItem ? ` item "${r.firstItem}"` : ''}  ${r.shifts.join(' | ')}${r.errors.length ? `  errors: ${r.errors.join(' ; ')}` : ''}`);
    }
    console.log(`/account median of ${reads.length}: ${median(reads).toFixed(3)}  reads [${reads.map((x) => x.toFixed(3)).join(', ')}]`);
  } finally { await browser.close(); }
} finally { stop(); }
