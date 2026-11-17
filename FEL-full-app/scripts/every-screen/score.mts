// THE EVERY-SCREEN SCORECARD (lane/every-screen-p01, 2026-11-10; docs/PLAN-EVERY-SCREEN-10PHASE.md).
// Owner: "To improve the total quality of the product from improving every screen."
//
// Every reachable screen (scripts/every-screen/routes.mts) is opened on the REAL app (scripts/every-screen/rig.mts: a
// production build against a local throwaway database) at 390 × 844 with the CPU throttled 4×, as the least-privileged
// person who can see it, and the measurable parts of the plan's four checks are recorded:
//
//   1 clear and quick       words before scrolling; bright filled buttons competing; tap targets under 44 px; dead end
//   2 looks finished        "coming soon" / placeholder text / an empty state with no next step / a spinner with no words;
//                           sideways scroll and cut-off text at 390 px, at 200 % zoom and with 150 % text; text sizes and
//                           button looks; READABLE.md size misses (scripts/readable/inpage.ts collects the text runs)
//   3 fast and smooth       first content, layout shift, and the main action's tap response (the browser's own event
//                           timing) against the plan's budgets: 2.5 s, 0.02, 200 ms
//   4 right and trustworthy every link fetched (a 404 or a 5xx is broken), links to nowhere, a main action that does
//                           nothing, uncaught errors, critical and serious accessibility findings (scripts/a11y/inpage.ts);
//                           and, flagged for a person, a measured number with no method or confidence line
//
// The rules are lib/every-screen/judge.ts (unit tested). The scorer is checked against control pages with planted
// faults (scripts/every-screen/controls.mts) before it is believed: `--plant` exits 1 unless every planted fault is
// flagged and the clean page passes.
//
//   /home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts --plant
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts [--budget=780] [--routes=/train,/coach] [--tc] [--redo]
//   npx tsx scripts/every-screen/score.mts --report          writes docs/EVERY-SCREEN-SCORECARD.md and docs/every-screen/scorecard.json
//
// The crawl resumes: each screen is written to <ES_OUT>/routes/<screen>.json when it finishes, and a run stops starting
// new screens after --budget seconds, so a crawl is several ≤ 15-minute lock holds. ES_OUT defaults to /tmp/every-screen.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../probes/_chromium.mts';
import { discover, type Screen } from './routes.mts';
import { ORIGIN, PEOPLE, ROOT, STATE, dbUp, people as makePeople, seedCoaching, serve, storageState, type People, type Person } from './rig.mts';
import { CONTROLS } from './controls.mts';
import { fixtureFor } from './fixtures.mts';
import * as judgeNs from '../../lib/every-screen/judge.ts';
import type { ScreenFacts, Verdict } from '../../lib/every-screen/judge.ts';
import * as rulesNs from '../../lib/readable/rules.ts';
import type { Measure } from './inpage.ts';
import type { Run } from '../readable/inpage.ts';
import { ROUTES_DIR, SCORER, readResults, slug, type Got, type Result } from './results.mts';
export { readResults, slug, SCORER, type Got, type Result };

const { judge, kindOf, BUDGET } = ((judgeNs as { default?: unknown }).default ?? judgeNs) as typeof judgeNs;
const { sizeMiss } = ((rulesNs as { default?: unknown }).default ?? rulesNs) as typeof rulesNs;

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => args.includes(`--${n}`);
const T0 = Date.now();
const BUDGET_S = Number(flag('budget') ?? 780);
const OUT = STATE;
const SHOTS_DIR = join(OUT, (flag('label') ?? 'routes').replace('routes', 'shots'));
// ── who gets what: every screen fetched as six people ────────────────────────────────────────────────────────────────
async function fetchAs(p: People, who: Person, url: string): Promise<{ got: Got; status: number }> {
  const r = await fetch(ORIGIN + url, { redirect: 'manual', headers: p.cookies[who] ? { cookie: p.cookies[who] } : {} });
  if (r.status >= 300 && r.status < 400) {
    const to = new URL(r.headers.get('location') ?? '/', ORIGIN);
    return { got: to.pathname === '/login' ? 'sign-in' : `to:${to.pathname}`, status: r.status };
  }
  if (r.status === 404) return { got: 'not-found', status: 404 };
  if (r.status >= 500) return { got: 'error', status: r.status };
  const body = await r.text();
  if (body.includes('data-testid="fel-not-found"')) return { got: 'not-found', status: r.status };
  return { got: 'page', status: r.status };
}
export function audienceOf(probe: Record<Person, Got>): string {
  if (probe.anon === 'page') return 'anyone';
  const adultOnly = probe.teen !== 'page' && probe.solo === 'page';
  if (probe.solo === 'page') return adultOnly ? 'signed-in, adults only' : 'signed-in';
  if (probe.client === 'page') return 'signed-in (coached client)';
  if (probe.coach === 'page') return 'coach';
  if (probe.admin === 'page') return 'admin';
  if (PEOPLE.every((w) => probe[w] === 'not-found' || probe[w] === 'sign-in')) return 'nobody (a 404 for everyone)';
  return 'nobody (redirects away)';
}
/** Who the screen is scored as: the least-privileged person who gets the page, except where the screen is for a role. */
function scoredAs(s: Screen, probe: Record<Person, Got>): Person | null {
  const prefer: Person[] = /^\/coach(\/|$)/.test(s.route) && !/^\/coach\/(join|\[slug\])/.test(s.route) ? ['coach', 'solo', 'anon']
    : /^\/(account\/coaching|training)(\/|$)/.test(s.route) ? ['client', 'solo'] : ['anon', 'solo', 'client', 'coach', 'admin'];
  return prefer.find((w) => probe[w] === 'page') ?? (['anon', 'solo', 'client', 'coach', 'admin'] as Person[]).find((w) => probe[w] === 'page') ?? null;
}

// ── the page side ────────────────────────────────────────────────────────────────────────────────────────────────────
async function bundleInpage(): Promise<string> {
  const one = async (entry: string) => (await build({ entryPoints: [join(ROOT, entry)], bundle: true, format: 'iife', platform: 'browser', write: false, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' })).outputFiles[0].text;
  return [await one('scripts/every-screen/inpage.ts'), await one('scripts/readable/inpage.ts'), await one('scripts/a11y/inpage.ts')].join('\n;\n');
}
const INIT = `window.__esCls = 0; window.__esLong = 0; window.__esShifts = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__esCls += e.value; for (const src of (e.sources || [])) { const n = src.node; window.__esShifts.push(Math.round(e.value * 1000) / 1000 + ' ' + (n && n.nodeType === 1 ? n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') : '#text')); } } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { window.__esLong += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}`;

interface Clip { phone: string[]; zoom200: string[]; font150: string[] }
const squeeze = async (page: Page, phone: boolean) => {
  const runs = await page.evaluate('window.__readable.collect()') as Run[];
  // READABLE.md's clip rule (key text, or anything but a line clamp), with two things left out: an ellipsis (the app's own
  // "there is more" mark), and an overflow box that trims a line by under a fifth of its font size. The collector measures
  // the font's full line box, so a tight heading in an overflow-hidden row reads as 2–4 px "over" with no ink lost
  // (seen on /screen's "Quick Screen", 2026-11-10: whole on the screenshot).
  const clipped = runs.filter((r) => r.clip && !r.ariaHidden && (r.key || r.clip.how !== 'line-clamp') && r.clip.how !== 'ellipsis' && (r.clip.how !== 'overflow' || r.clip.px > Math.max(3, 0.2 * r.px)))
    .map((r) => `${r.text.slice(0, 44)} [${r.clip!.how} ${r.clip!.px}px]`);
  const hs = await page.evaluate('window.__readable.hScroll()') as number;
  let tiny = 0, bodySmall = 0; const samples: { rule: string; text: string; px: number; path: string }[] = [];
  if (phone) for (const r of runs) {
    if (r.ariaHidden || r.disabled) continue;
    const m = sizeMiss(r.px, { words: r.words, phone: true, hud: r.hud ? 'phone' : null });
    if (m === 'tiny' || m === 'hud-small') tiny++; else if (m === 'body-small') bodySmall++;
    if (m && samples.length < 8) samples.push({ rule: m, text: r.text.slice(0, 40), px: r.px, path: r.path.slice(-110) });
  }
  const covered = await page.evaluate('window.scrollTo(0, 0), window.__es.covered()').catch(() => []) as string[];
  return { clipped: [...new Set(clipped)].slice(0, 6), hs, tiny, bodySmall, samples, covered, culprits: hs > 2 ? await page.evaluate('window.__readable.hScrollCulprits()').catch(() => []) as string[] : [] };
};

async function loadOnce(browser: Browser, state: ReturnType<typeof storageState>, url: string, inpage: string, routeHtml?: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: state, permissions: ['camera', 'microphone'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 EveryScreenRig' });
  const page = await ctx.newPage();
  const errors: string[] = []; let dialogs = 0, popups = 0;
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => { dialogs++; void d.dismiss().catch(() => {}); });
  page.on('popup', (p) => { popups++; void p.close().catch(() => {}); });
  const apis = new Map<string, number>();
  page.on('response', (r) => { try { const u = new URL(r.url()); if (u.origin === ORIGIN && u.pathname.startsWith('/api/') && r.request().method() === 'GET' && !u.pathname.startsWith('/api/auth/')) apis.set(u.pathname + u.search, r.status()); } catch { /* not a URL */ } });
  await page.addInitScript(INIT);
  if (routeHtml != null) await page.route(ORIGIN + url, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: routeHtml }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t = Date.now();
  const resp = await page.goto(ORIGIN + url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const ms = Date.now() - t;
  await page.evaluate(inpage);
  return { ctx, page, cdp, errors, apis, status: resp?.status() ?? null, ms, counts: () => ({ dialogs, popups }) };
}

/** One screen, measured. `attempt` 2 re-reads the speed numbers when the first read missed a budget (a busy machine). */
async function scoreUrl(browser: Browser, state: ReturnType<typeof storageState>, cookie: string, url: string, kind: ScreenFacts['kind'], inpage: string, shot: string | null, routeHtml?: string) {
  let L = await loadOnce(browser, state, url, inpage, routeHtml);
  let m = await L.page.evaluate('window.__es.measure()') as Measure;
  let attempts = 1;
  if (m.fcp != null && m.fcp > BUDGET.fcpMs && m.fcp < 2 * BUDGET.fcpMs && routeHtml == null) {
    // the machine is shared: a second read, and the better of the two speed numbers stands
    const first = { fcp: m.fcp, cls: m.cls };
    await L.ctx.close();
    L = await loadOnce(browser, state, url, inpage, routeHtml);
    m = await L.page.evaluate('window.__es.measure()') as Measure;
    attempts = 2;
    if (first.fcp != null && (m.fcp == null || first.fcp < m.fcp)) m.fcp = first.fcp;
    m.cls = Math.min(m.cls, first.cls);
  }
  const { page } = L;
  await L.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });      // the reading itself runs at full speed; the tap below is throttled again
  const finalPath = new URL(page.url()).pathname;
  const webgl = await page.evaluate(`(() => { for (const c of document.querySelectorAll('canvas')) { const r = c.getBoundingClientRect(); if (r.width * r.height > 0.3 * innerWidth * innerHeight) return true; } return false; })()`) as boolean;
  const text = await page.evaluate('document.body.innerText') as string;
  if (shot) { const png = await page.screenshot(); await sharp(png).resize({ width: 390 }).jpeg({ quality: 72 }).toFile(shot); }
  const a11y = await page.evaluate('window.__a11y.staticScan()').catch(() => ({ violations: [] })) as { violations: { rule: string; severity: string; target?: string; detail?: string }[] };
  const sq: Record<string, Awaited<ReturnType<typeof squeeze>> | null> = { phone: await squeeze(page, true).catch(() => null), font150: null, zoom200: null };
  // 150 % text (iOS larger text): the root font, as READABLE.md does
  await page.evaluate(`document.documentElement.style.fontSize = '150%'`);
  await page.waitForTimeout(250);
  sq.font150 = await squeeze(page, false).catch(() => null);
  await page.evaluate(`document.documentElement.style.fontSize = ''`);
  // 200 % zoom: 1280 × 800 at 200 % is a 640 × 400 CSS viewport
  await page.setViewportSize({ width: 640, height: 400 });
  await page.waitForTimeout(250);
  sq.zoom200 = await squeeze(page, false).catch(() => null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.evaluate('window.scrollTo(0, 0)');

  // the main action's tap
  let tapMs: number | null = null, tapDidNothing = false, tapLabel: string | null = null;
  const main = await page.evaluate('window.__es.mainAction()').catch(() => null) as { label: string; tag: string; href: string | null } | null;
  if (main && !webgl) {
    tapLabel = main.label;
    await L.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // THE SCORER NEVER WRITES. The tap is real, but anything it would send that is not a read (a join, a nudge, a
    // sign-out, a save) is stopped at the browser's door, so one screen's tap cannot change what the next screen shows.
    // (Found the hard way, 2026-11-10: tapping "Join Coach Riley" on the invite screen put the rig's lone athlete on a
    // roster, and /train/readiness then showed a coach's rule to someone with no coach.) A stopped write still counts
    // as the button doing something.
    let writes = 0;
    // answered, not dropped: a dropped request is "Failed to fetch" in the page, an error the rig made, not the app (seen
    // on /admin/metrics' Recompute); 503 is what the app's own routes answer when a feature is off
    await page.route('**/*', (route) => { if (route.request().method() === 'GET') return route.continue(); writes++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"every_screen_rig","message":"The scorer does not send writes."}' }); });
    const errorsBeforeTap = L.errors.length;
    await page.evaluate('window.__es.armTap()');
    const before = L.counts();
    let navigated = false;
    page.once('framenavigated', () => { navigated = true; });
    const ok = await page.locator('[data-es-main]').first().tap({ timeout: 4000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1000);
    const after = L.counts();
    const tap = await page.evaluate('window.__es.readTap()').catch(() => null) as { dur: number; mutations: number; urlChanged: boolean; requests: number } | null;
    // an error the stopped write caused is the rig's, not the screen's
    if (writes) L.errors.splice(errorsBeforeTap, L.errors.length - errorsBeforeTap, ...L.errors.slice(errorsBeforeTap).filter((e) => !/Failed to fetch|every_screen_rig|503/.test(e)));
    if (ok && tap) {
      tapMs = Math.max(16, tap.dur);
      tapDidNothing = !tap.urlChanged && tap.mutations === 0 && tap.requests === 0 && writes === 0 && !navigated && after.dialogs === before.dialogs && after.popups === before.popups;
    }
  }
  // every link, fetched as the same person
  const hrefs = new Map<string, string>();
  for (const l of m.links) { try { const u = new URL(l.href); if (u.origin === ORIGIN && !hrefs.has(u.pathname + u.search)) hrefs.set(u.pathname + u.search, l.label); } catch { /* not a URL */ } }
  const broken: ScreenFacts['brokenLinks'] = [];      // filled by checkLinks(), after the timed part of the run
  void cookie;

  const crit = a11y.violations.filter((v) => v.severity === 'critical'), ser = a11y.violations.filter((v) => v.severity === 'serious');
  const facts: ScreenFacts = {
    kind, wordsFold: m.wordsFold, noticeWordsFold: m.noticeFold ?? 0, wordsAll: m.wordsAll, primaryFold: m.primaryFold, actionsAll: m.actionsAll, actionsMain: m.actionsMain,
    smallTargets: m.smallTargets, unfinished: m.unfinished, emptyNoNext: m.emptyNoNext, spinnersNoWords: m.spinnersNoWords, blank: m.blank,
    textSizes: m.textSizes, buttonLooks: m.buttonLooks,
    hscroll: { phone: sq.phone?.hs ?? null, zoom200: sq.zoom200?.hs ?? null, font150: sq.font150?.hs ?? null },
    clipped: { phone: sq.phone?.clipped ?? [], zoom200: sq.zoom200?.clipped ?? [], font150: sq.font150?.clipped ?? [] } as Clip,
    covered: { phone: sq.phone?.covered ?? [], font150: sq.font150?.covered ?? [] },
    tiny: sq.phone?.tiny ?? 0, bodySmall: sq.phone?.bodySmall ?? 0,
    fcpMs: m.fcp, cls: m.cls, tapMs, tapDidNothing, tapLabel,
    brokenLinks: broken, nowhereLinks: m.nowhere, pageErrors: L.errors,
    a11yCritical: crit.length, a11ySerious: ser.length, a11yRules: [...new Set([...crit, ...ser].map((v) => v.rule))],
    numbers: m.numbers, methodLine: m.methodLine,
    cannot: webgl ? { fast: 'a 3D screen: the rig has no real GPU, so the tap response is not timed' } : undefined,
  };
  await L.ctx.close();
  return { facts, m, status: L.status, finalPath, text, webgl, attempts, ms: L.ms, detail: { sizeSamples: sq.phone?.samples ?? [], hscrollCulprits: { phone: sq.phone?.culprits ?? [], zoom200: sq.zoom200?.culprits ?? [], font150: sq.font150?.culprits ?? [] }, a11y: [...crit, ...ser].slice(0, 10) }, hrefs: [...hrefs].map(([href, label]) => ({ href, label })), apis: [...L.apis].map(([url, status]) => ({ url, status })) };
}

/** the machine's 1-minute load when a screen was read: other lanes share it, and a busy machine slows the speed numbers */
const machineLoad = (): number | null => { try { return Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]); } catch { return null; } };

const linkCache = new Map<string, number>();
async function linkStatus(cookie: string, href: string): Promise<number> {
  const k = `${cookie.slice(-12)} ${href}`;
  if (linkCache.has(k)) return linkCache.get(k)!;
  let st = 0;
  try {
    const r = await fetch(ORIGIN + href, { redirect: 'manual', headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(20000) });
    st = r.status;
    if (st === 200 && (r.headers.get('content-type') ?? '').includes('text/html') && (await r.text()).includes('data-testid="fel-not-found"')) st = 404;
  } catch { st = 599; }
  linkCache.set(k, st);
  return st;
}

// ── --plant: the controls ────────────────────────────────────────────────────────────────────────────────────────────
async function plant(browser: Browser, inpage: string): Promise<boolean> {
  let ok = true;
  for (const c of CONTROLS) {
    const r = await scoreUrl(browser, { cookies: [], origins: [] }, '', `/__es-control/${c.name}`, c.kind, inpage, join(OUT, `control-${c.name}.jpg`), c.html);
    // the crawl fetches links after its timed part (checkLinks); a control is one page, so here it is done at once
    for (const l of r.hrefs) { const st = await linkStatus('', l.href); if (st === 404 || st >= 500) r.facts.brokenLinks.push({ href: l.href, status: st, label: l.label }); }
    const v = judge(r.facts);
    const found = new Set([...v.faults.map((f) => f.id), ...(v.review.length ? ['review:number-no-method'] : [])]);
    const failed = Object.entries(v.checks).filter(([, s]) => s !== 'pass').map(([k]) => k).sort();
    const missing = c.expectFaults.filter((id) => !found.has(id));
    const wrongChecks = JSON.stringify(failed) !== JSON.stringify([...c.expectFail].sort());
    const good = !missing.length && !wrongChecks;
    ok &&= good;
    console.log(`${good ? 'ok  ' : 'MISS'} ${c.name.padEnd(16)} fails [${failed.join(', ')}] expected [${[...c.expectFail].sort().join(', ')}]${missing.length ? `  NOT FLAGGED: ${missing.join(', ')}` : ''}`);
    console.log(`     found: ${[...found].join(', ') || '(nothing)'}   fcp ${r.facts.fcpMs} cls ${r.facts.cls} tap ${r.facts.tapMs}`);
  }
  return ok;
}

// ── the crawl ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Fetch every link the scored screens carry, as the person each was scored as; a 404 or a 5xx is a broken link. Runs
 *  after the timed part of a run (a pool of fetches would disturb the speed numbers), then the screens are judged again. */
async function checkLinks(ppl: People): Promise<void> {
  const todo = readResults().filter((r) => r.state === 'scored' && r.facts && r.linksPending && r.persona);
  const jobs: { cookie: string; href: string }[] = [];
  for (const r of todo) for (const l of r.hrefs ?? []) jobs.push({ cookie: ppl.cookies[r.persona!], href: l.href });
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) { const j = jobs[i++]; await linkStatus(j.cookie, j.href); } }));
  for (const r of todo) {
    const cookie = ppl.cookies[r.persona!];
    r.facts!.brokenLinks = [];
    for (const l of r.hrefs ?? []) { const st = await linkStatus(cookie, l.href); if (st === 404 || st >= 500) r.facts!.brokenLinks.push({ href: l.href, status: st, label: l.label }); }
    r.linksPending = false;
    r.verdict = judge(r.facts!);
    writeFileSync(join(ROUTES_DIR, `${slug(r.route)}.json`), JSON.stringify(r, null, 1));
  }
  console.log(`links: ${linkCache.size} fetched for ${todo.length} screens`);
}

async function crawl(): Promise<void> {
  mkdirSync(ROUTES_DIR, { recursive: true }); mkdirSync(SHOTS_DIR, { recursive: true });
  dbUp();
  const stop = await serve(join(OUT, 'server.log'));
  try {
    const ppl = await makePeople();
    console.log(await seedCoaching(ppl).catch((e) => `coached pair: failed (${String(e).slice(0, 160)})`));
    const inpage = await bundleInpage();
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    // The controls run at the start of EVERY hold (about 40 s): the scorer is re-proved on the build it is about to read.
    // `--plant` runs them alone; `--no-plant` skips them. The result is kept for the report (plant.json).
    if (!has('no-plant')) {
      const lines: string[] = [];
      const log = console.log; console.log = (...a: unknown[]) => { lines.push(a.join(' ')); log(...a); };
      const ok = await plant(browser, inpage).catch((e) => { console.log(`plant crashed: ${String(e).slice(0, 300)}`); return false; });
      console.log = log;
      console.log(ok ? 'PLANT OK: every planted fault flagged, the clean page passes' : 'PLANT FAILED');
      writeFileSync(join(OUT, 'plant.json'), JSON.stringify({ ok, when: new Date().toISOString(), scorer: SCORER, lines }, null, 1));
      if (has('plant') && !has('then-crawl')) { await browser.close(); process.exitCode = ok ? 0 : 1; return; }
    }
    const only = flag('routes')?.split(',');
    // training and coaching first: the phases that start first get their baseline in the first lock hold
    const versionOf = (route: string): number => { const f = join(ROUTES_DIR, `${slug(route)}.json`); if (!existsSync(f)) return -1; try { return (JSON.parse(readFileSync(f, 'utf8')) as Result).v ?? 1; } catch { return -1; } };
    // never read first, then read by an older scorer, each training and coaching first
    const screens = discover().filter((s) => (!only || only.includes(s.route)) && (!has('tc') || s.tc)).sort((a, b) => versionOf(a.route) - versionOf(b.route) || Number(b.tc) - Number(a.tc));
    let done = 0, skipped = 0;
    for (const s of screens) {
      const file = join(ROUTES_DIR, `${slug(s.route)}.json`);
      if (versionOf(s.route) === SCORER && !has('redo')) { skipped++; continue; }
      if ((Date.now() - T0) / 1000 > BUDGET_S - 70) { console.log(`budget reached: ${done} read this run, ${screens.length - done - skipped} left`); break; }
      const base: Result = { route: s.route, url: s.route, file: s.file, area: s.area, phase: s.phase, tc: s.tc, kind: kindOf(s.route), audience: '', persona: null, probe: {} as Record<Person, Got>, state: 'not-scored', when: new Date().toISOString(), v: SCORER };
      try {
        const fx = await fixtureFor(s, ppl);
        if (!fx.url) { base.reason = `not scored: ${fx.why}`; base.audience = 'unknown (no fixture)'; if (fx.offWhy) base.reason += `; ${fx.offWhy}`; }
        else {
          base.url = fx.url;
          for (const w of PEOPLE) base.probe[w] = (await fetchAs(ppl, w, fx.url)).got;
          base.audience = audienceOf(base.probe);
          base.persona = fx.as && base.probe[fx.as] === 'page' ? fx.as : scoredAs(s, base.probe);
          if (!base.persona) {
            const to = [...new Set(Object.values(base.probe))].find((g) => g.startsWith('to:'));
            if (to) { base.state = 'alias'; base.reason = `redirects to ${to.slice(3)} for everyone who is signed in`; }
            else { base.state = 'off'; base.reason = fx.offWhy ?? 'a 404 for every person on the rig'; }
          } else {
            const shot = join(SHOTS_DIR, `${slug(s.route)}.jpg`);
            const r = await scoreUrl(browser, storageState(ppl, base.persona), ppl.cookies[base.persona], fx.url, base.kind as ScreenFacts['kind'], inpage, shot);
            base.final = { status: r.status, path: r.finalPath };
            base.text = r.text.slice(0, 6000);
            base.load = { ms: r.ms, webgl: r.webgl, attempts: r.attempts, jsKb: r.m.jsKb, longTasks: r.m.longTasks, machineLoad: machineLoad() };
            base.measure = { title: r.m.title, h1: r.m.h1, shifts: r.m.shifts, buttonLookList: r.m.buttonLookList };
            base.hrefs = r.hrefs; base.apis = r.apis; base.shot = shot; base.detail = r.detail;
            const want = new URL(ORIGIN + fx.url).pathname;
            if (r.finalPath !== want) { base.state = 'alias'; base.reason = `redirects to ${r.finalPath} in the browser`; }
            else if (r.m.notFound) { base.state = 'off'; base.reason = fx.offWhy ?? 'the app\'s own 404 page'; }
            else { base.state = 'scored'; base.facts = r.facts; base.linksPending = true; base.verdict = judge(r.facts); if (fx.note) base.reason = fx.note; }
          }
        }
      } catch (e) { base.state = 'not-scored'; base.reason = `not scored: the rig could not read it (${String(e).slice(0, 160)})`; }
      writeFileSync(file, JSON.stringify(base, null, 1));
      const v = base.verdict;
      console.log(`${s.route.padEnd(38)} ${(base.persona ?? '-').padEnd(6)} ${base.state.padEnd(10)} ${v ? `${v.checks.clear[0]}${v.checks.finished[0]}${v.checks.fast[0]}${v.checks.right[0]} fcp ${base.facts?.fcpMs} cls ${base.facts?.cls} tap ${base.facts?.tapMs} ${base.load?.ms}ms  ${v.worst?.say.slice(0, 70) ?? 'clean'}` : base.reason}`);
      done++;
    }
    await browser.close();
    await checkLinks(ppl);
    const left = discover().filter((s) => versionOf(s.route) !== SCORER).length;
    console.log(`${done} read this run in ${Math.round((Date.now() - T0) / 1000)} s; ${left} screens left`);
  } finally { stop(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (has('left')) { console.log(discover().filter((sc) => !readResults().some((r) => r.route === sc.route && (r.v ?? 1) === SCORER)).length); process.exit(0); }
  if (has('report')) { const { report } = await import('./report.mts'); await report(); }
  else await crawl();
}
