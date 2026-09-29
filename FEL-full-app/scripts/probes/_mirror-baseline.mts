// MIRROR-COACH P1 (2026-09-25) — the baseline harness: what the Mirror, the coach loop and /workout say TODAY, measured,
// so phases 2-10 have a number to beat and a before to show.
//
//   --write    regenerate lib/mirror/fixtures/<name>.json from lib/mirror/fixtures/build.ts, then re-record
//              lib/mirror/fixtures/baseline.json (what lib/mirror/fixtures.test.ts compares against)
//   --check    exit 1 if the fixture files or the recorded baseline no longer match the code
//   --out DIR  write DIR/baseline.json (everything below) — the outbox copy
//   --frames   also take frames from the lane's dev server (MIRROR_BASE, default http://127.0.0.1:3131)
//   --seeds N  seeds for the jitter runs (default 20)
//   --tmp DIR  where the pre-P1 (git HEAD) copies of the Mirror modules are written to be loaded (default: os tmpdir)
//
// What it measures:
//   1. MIRROR — every fixture through the live squat audit / cue engine / stage step, the unmounted lunge audit, the
//      framing check, and both screens end to end (lib/mirror/fixtures/measure.ts, the same code the test runs).
//   2. BEFORE — the squat audit and cue engine as they were at git HEAD (before mirror-truth), through the SAME
//      measurement, plus what the pre-P1 screen scored, paid, stored and told the coach for an ungraded run.
//   3. JITTER — the squat and lunge fixtures re-filmed with lib/pose/synth.ts's default noise over N seeds; how often a
//      side-on body passes the side (and front) framing check; both screens walked on jittered bodies.
//   4. COACH — lib/coach/loop-baseline.test.ts run with MIRROR_BASELINE_OUT: the real attention, Today, roster, inbox,
//      programs and prescribe routes on a fixture database, and whether any served page can write the catalogue.
//   5. WORKOUT — what /workout sold a new user (git HEAD's generator, week 1), every focus × tier's early depth drops
//      then and now, whether the plans are on sale now, and what a stored plan looks like before and after revision.
//   6. FRAMES — the coach's Clients tab and the client's Today card (served the routes' real output from 4 through
//      page.route), and /dev/workout-plans.
//
// Synthetic bodies only: nothing here is a recording of a person. Pose detection on Chromium's fake camera finds no
// body (the mirror-truth probe measured every row "Not in view"), so the Mirror is driven through its pure code.
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-baseline.mts --out <dir> [--frames]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as buildNs from '../../lib/mirror/fixtures/build.ts';
import * as indexNs from '../../lib/mirror/fixtures/index.ts';
import * as loadNs from '../../lib/mirror/fixtures/load.ts';
import * as measureNs from '../../lib/mirror/fixtures/measure.ts';
import * as synthNs from '../../lib/pose/synth.ts';
import * as graphNs from './_import-graph.ts';
import * as screenNs from '../../lib/mirror/screen.ts';
import * as prescNs from '../../components/coach/screen-prescriptions.tsx';
import * as moveNs from '../../lib/workout/movement-screen.ts';
import * as genNs from '../../lib/workout/plan-generator.ts';
import * as revNs from '../../lib/workout/plan-revision.ts';
import * as saleNs from '../../lib/workout/plan-sale.ts';
import * as catNs from '../../lib/wallet/catalog.ts';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (scripts/body/seam.mts)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const B = unwrap(buildNs), I = unwrap(indexNs), L = unwrap(loadNs), M = unwrap(measureNs), S = unwrap(synthNs), Gr = unwrap(graphNs);
const Scr = unwrap(screenNs), Pr = unwrap(prescNs), Mv = unwrap(moveNs), Gen = unwrap(genNs), Rev = unwrap(revNs), Sale = unwrap(saleNs), Cat = unwrap(catNs);

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const WRITE = flag('--write'), CHECK = flag('--check'), FRAMES = flag('--frames');
const OUT = opt('--out');
const SEEDS = Number(opt('--seeds') ?? 20);
const TMP = opt('--tmp') ?? join(tmpdir(), 'fel-mirror-baseline-head');
const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const ROOT = process.cwd();
const GIT = existsSync('/Library/Developer/CommandLineTools/usr/bin/git') ? '/Library/Developer/CommandLineTools/usr/bin/git' : 'git';
if (!existsSync(join(ROOT, 'lib/mirror/fixtures/build.ts'))) throw new Error('run from FEL-full-app (the app root)');

const git = (...a: string[]) => execFileSync(GIT, ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const PREFIX = git('rev-parse', '--show-prefix').trim();
const HEAD = git('rev-parse', '--short', 'HEAD').trim();
const r2 = (x: number) => Math.round(x * 100) / 100;
const log = (...a: unknown[]) => console.log(...a);
type Json = Record<string, unknown>;

// ── 0. fixtures: write / check ───────────────────────────────────────────────────────────────────────────────────

/** One frame per line, so a changed frame is a one-line diff. */
function fixtureText(fx: ReturnType<typeof I.fixtureFile>): string {
  const { frames, ...head } = fx;
  const top = JSON.stringify(head);
  return `${top.slice(0, -1)},"frames":[\n${frames.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

const NAMES = [...B.FIXTURE_NAMES];
let drift = 0;
if (WRITE) {
  for (const n of NAMES) writeFileSync(L.fixturePath(n), fixtureText(I.fixtureFile(n)));
  log(`wrote ${NAMES.length} fixtures to lib/mirror/fixtures/`);
}
if (CHECK) {
  for (const n of NAMES) {
    const want = fixtureText(I.fixtureFile(n));
    const have = existsSync(L.fixturePath(n)) ? readFileSync(L.fixturePath(n), 'utf8') : '';
    if (want !== have) { drift++; log(`DRIFT  ${n}.json no longer matches build.ts`); }
  }
}
const disk = new Map(NAMES.map((n) => [n, L.readFixture(n)]));
const load = (n: string) => disk.get(n)!;
const mirror = M.recordBaseline(NAMES, load);
if (WRITE) { writeFileSync(L.BASELINE_PATH, `${JSON.stringify(mirror, null, 2)}\n`); log('recorded lib/mirror/fixtures/baseline.json'); }
if (CHECK) {
  const rec = existsSync(L.BASELINE_PATH) ? readFileSync(L.BASELINE_PATH, 'utf8') : '';
  if (rec !== `${JSON.stringify(mirror, null, 2)}\n`) { drift++; log('DRIFT  lib/mirror/fixtures/baseline.json no longer matches what the Mirror says'); }
  log(drift ? `check: ${drift} drift(s)` : 'check: fixtures and baseline match the code');
  if (!OUT) process.exit(drift ? 1 : 0);
}
if (!OUT) process.exit(0);
mkdirSync(OUT, { recursive: true });

// ── 1. the pre-P1 modules, from git HEAD ─────────────────────────────────────────────────────────────────────────

/**
 * Load files as they are at git HEAD. Each is written under TMP at its own relative path; an import of another file in
 * the set stays relative (so HEAD talks to HEAD), anything else is pointed at the working tree's file.
 */
async function loadHead(rels: string[]): Promise<Record<string, Json>> {
  const set = new Set(rels);
  const out: Record<string, Json> = {};
  for (const rel of rels) {
    const src = git('show', `HEAD:${PREFIX}${rel}`);
    const from = join(ROOT, rel), to = join(TMP, rel);
    const fix = (spec: string) => {
      const abs = Gr.resolveSpecifier(spec, from, ROOT);
      if (!abs) return spec;                                              // a package
      const r = relative(ROOT, abs);
      if (set.has(r)) { let p = relative(dirname(to), join(TMP, r)); if (!p.startsWith('.')) p = `./${p}`; return p; }
      return abs;
    };
    const code = src
      .replace(/(\bfrom\s+['"])([^'"]+)(['"])/g, (_, a, s, b) => `${a}${fix(s)}${b}`)
      .replace(/(\bimport\(\s*['"])([^'"]+)(['"]\s*\))/g, (_, a, s, b) => `${a}${fix(s)}${b}`)
      .replace(/(^|\n)(\s*import\s+['"])([^'"]+)(['"])/g, (_, n, a, s, b) => `${n}${a}${fix(s)}${b}`);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, code);
  }
  for (const rel of rels) out[rel] = unwrap(await import(pathToFileURL(join(TMP, rel)).href)) as Json;
  return out;
}

const H = await loadHead([
  'lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts', 'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts',
  'lib/mirror/screen.ts', 'lib/mirror/screenReward.ts', 'lib/mirror/screenStore.ts', 'lib/workout/plan-generator.ts',
]);
type Ctor<T> = new () => T;
const HeadSquatAudit = H['lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts'].SquatAudit as Ctor<measureNs.SquatAuditLike>;
const HeadCueEngine = H['lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts'].CueEngine as Ctor<measureNs.CueEngineLike>;

// ── 2. mirror now vs before ──────────────────────────────────────────────────────────────────────────────────────
const frontReps = B.FIXTURES.filter((f) => f.pattern === 'squat' || f.pattern === 'lunge').map((f) => f.name);
const beforeAfter: Json = {};
for (const n of frontReps) {
  const frames = I.toAdapterFrames(load(n));
  const before = M.measureSquat(frames, { audit: new HeadSquatAudit(), cues: new HeadCueEngine(), shown: (f) => f, stage: false });
  const after = mirror.fixtures[n].squat;
  beforeAfter[n] = {
    truth: load(n).truth,
    before: { kneeValgusFrames: before.faultFrames.kneeValgus ?? 0, faultFrames: before.faultFrames, maxValgusRatio: before.maxValgusRatio, painted: before.shown, coach: before.coach.map((c) => `${c.level}: ${c.text}`) },
    after: { kneeValgusFrames: after.faultFrames.kneeValgus ?? 0, faultFrames: after.faultFrames, worstInward: after.worstInward, leastInward: after.leastInward, shown: after.shown, checkFindings: after.checkFindings, coach: after.coach.map((c) => `${c.level}: ${c.text}`) },
  };
}

// the screen before P1, for the same ungraded run (framing.ts is unchanged since HEAD, so the walk is the same walk)
const hScreen = H['lib/mirror/screen.ts'] as { scoreScreen: (s: string, r: unknown[]) => Json };
const hReward = H['lib/mirror/screenReward.ts'] as { decideScreenReward: (i: Json) => Json };
const hStore = H['lib/mirror/screenStore.ts'] as { storedScreen: (...a: unknown[]) => Json; readStoredScreen: (m: unknown) => unknown };
const headHarness = git('show', `HEAD:${PREFIX}app/play/mirror/_components/mirror-harness.tsx`);
const headPanel = git('show', `HEAD:${PREFIX}components/coach/screen-prescriptions.tsx`);
const screenBefore: Json = {};
for (const s of ['modified', 'full'] as const) {
  const summary = hScreen.scoreScreen(s, []);
  const stored = hStore.storedScreen(`fixture-${s}`, s, [], summary);
  const readable = hStore.readStoredScreen(JSON.parse(JSON.stringify(stored)));
  screenBefore[s] = {
    athletePanel: `Score ${summary.score} · Red flags ${summary.redFlags} · One-sided ${summary.asymmetries} · Checks 0`,
    headline: summary.headline, triage: summary.triage, programming: summary.programming,
    // the pre-P1 harness sent provisional = results.length === 0 (mirror-harness.tsx at HEAD)
    reward: hReward.decideScreenReward({ screenId: `fixture-${s}`, athleteId: 'fixture-athlete', provisional: true, checksTaken: 0 }),
    stored,
    prescribeReason: readable ? null : 'unreadable_screen',
    coachPanel: readable ? null : (/:\s*'(Their last screen came back clear\.)'/.exec(headPanel)?.[1] ?? '?'),
  };
}
const headProvisional = /const provisional = runner\.results\.length === 0;/.test(headHarness);
const headLabels = [...headHarness.matchAll(/<Figure label="([^"]+)"/g)].map((m) => m[1]).filter((l) => ['Score', 'Red flags', 'One-sided', 'Checks'].includes(l));

// ── 3. jitter ────────────────────────────────────────────────────────────────────────────────────────────────────
/** A fixture's clip, looped to at least `sec` seconds (a still held longer; a rep repeated). */
function clipFor(name: string, sec: number) {
  const c = B.fixtureDef(name).clip();
  const need = Math.ceil(sec * c.fps);
  const frames = [];
  while (frames.length < need) frames.push(...c.frames);
  return { fps: c.fps, frames: frames.slice(0, Math.max(need, c.frames.length)) };
}
const noisy = (name: string, seed: number, sec = 0) => I.adapterFromPose(S.synthesize(sec ? clipFor(name, sec) : B.fixtureDef(name).clip(), { seed }).frames);
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? r2(s[Math.floor(s.length / 2)]) : null; };

const jitter: Json = { seeds: SEEDS, noise: { ...S.DEFAULT_NOISE, dropRate: 0.02, missRate: 0.01 } };
const reps: Json = {};
for (const n of frontReps) {
  let seedsFlagged = 0, framesFlagged = 0, moving = 0;
  const wl: number[] = [], wr: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = M.measureSquat(noisy(n, seed));
    const k = r.faultFrames.kneeValgus ?? 0;
    if (k) seedsFlagged++;
    framesFlagged += k;
    moving += (r.phases.descending ?? 0) + (r.phases.bottom ?? 0) + (r.phases.ascending ?? 0);
    if (r.worstInward) { wl.push(r.worstInward.left); wr.push(r.worstInward.right); }
  }
  reps[n] = { truth: { left: load(n).truth.kneeInwardCmLeft ?? null, right: load(n).truth.kneeInwardCmRight ?? null, front: load(n).truth.frontKneeInwardCm ?? null }, seedsWithKneeValgus: `${seedsFlagged}/${SEEDS}`, kneeValgusFrames: `${framesFlagged}/${moving}`, medianWorstInward: { left: med(wl), right: med(wr) } };
}
jitter.squatAudit = reps;
// a side-on body: does it pass the SIDE framing check (the screen's head-float station) — and the FRONT one?
const sideOk: Json = {};
for (const view of ['side', 'front'] as const) {
  let ok = 0, all = 0;
  const worst: Record<string, number> = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const fr = M.measureFraming(noisy('stand_side', seed, 10), view);
    ok += fr.ok; all += fr.frames;
    for (const [k, v] of Object.entries(fr.worst)) worst[k] = (worst[k] ?? 0) + (v as number);
  }
  sideOk[view] = { okFrames: `${ok}/${all}`, share: r2(ok / all), worst };
}
jitter.sideOnBodyFraming = sideOk;
// both screens on jittered bodies (each station's fixture re-filmed per seed, 10 s loops)
const noisyScreens: Json[] = [];
for (let seed = 1; seed <= Math.min(5, SEEDS); seed++) {
  for (const screen of ['modified', 'full'] as const) {
    const cache = new Map<string, ReturnType<typeof noisy>>();
    const run = M.runScreen(screen, (st) => {
      const fixture = M.stationFixture(st);
      if (!cache.has(fixture)) cache.set(fixture, noisy(fixture, seed * 100 + fixture.length, 10));
      return { fixture, frames: cache.get(fixture)! };
    }, { stallSec: 300 });
    noisyScreens.push({ seed, screen, completed: run.completed, stalledAt: run.stalledAt, poseClockSec: run.poseClockSec, stations: run.stations.map((s) => ({ id: s.id, seconds: s.seconds, heldBy: s.heldBy })), resultsRecorded: run.resultsRecorded, posted: run.onComplete.posted, athletePanel: run.onComplete.athletePanel, rewardPay: run.onComplete.reward.pay, storedGraded: run.onComplete.stored.graded, prescribeReason: run.onComplete.prescribeReason });
  }
}
jitter.screens = noisyScreens;

// ── 4. coach ─────────────────────────────────────────────────────────────────────────────────────────────────────
mkdirSync(TMP, { recursive: true });
const coachOut = join(TMP, 'coach-baseline.json');
const vitest = spawnSync('/opt/homebrew/Cellar/node@22/22.22.2_2/bin/node', ['node_modules/vitest/vitest.mjs', 'run', 'lib/coach/loop-baseline.test.ts'], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, DYLD_LIBRARY_PATH: '/opt/homebrew/Cellar/simdutf/9.0.0/lib', MIRROR_BASELINE_OUT: coachOut },
});
const coachPassed = vitest.status === 0;
const coach = existsSync(coachOut) ? JSON.parse(readFileSync(coachOut, 'utf8')) as Json : { error: (vitest.stdout + vitest.stderr).slice(-2000) };
const coachSummary = {
  test: coachPassed ? 'lib/coach/loop-baseline.test.ts passed' : 'lib/coach/loop-baseline.test.ts FAILED',
  catalogue: coach.catalogue, attention: coach.attention, today: coach.today,
  rosterSessionsSource: 'lib/camp/profile.ts composeProfile: history.sessions = gameSession rows (the roster row shows "0 sessions" for coached-only work)',
};

// ── 5. workout ───────────────────────────────────────────────────────────────────────────────────────────────────
const hGen = H['lib/workout/plan-generator.ts'] as { generatePlan: (s: unknown, t: string) => { focus: string; focusLabel: string; weeks: { week: number; theme: string; days: { day: string; block: string; exercises: { name: string; sets: number; reps: string }[] }[] }[] } };
const newUser = Mv.analyzeMovement(Mv.defaultMetrics());
const pillars = Object.keys(Mv.PILLAR_LABELS) as moveNs.Pillar[];
const drops = (weeks: { week: number; days: { exercises: { name: string }[] }[] }[], upTo = Gen.EARLY_WEEKS) =>
  weeks.filter((w) => w.week <= upTo).reduce((n, w) => n + w.days.reduce((k, d) => k + d.exercises.filter((e) => Gen.isDepthDrop(e)).length, 0), 0);
const week1 = (p: ReturnType<typeof hGen.generatePlan>) => p.weeks[0].days.map((d) => ({ day: d.day, block: d.block, exercises: d.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`) }));
const byFocus: Json = {};
for (const p of pillars) for (const tier of ['plan_4w', 'program_12w'] as const) {
  const sr = { ...newUser, weakest: p };
  const before = hGen.generatePlan(sr, tier), after = Gen.generatePlan(sr as never, tier);
  byFocus[`${p}/${tier}`] = { depthDropsWeeks1to4: { before: drops(before.weeks), after: drops(after.weeks) }, depthDropWeek1: { before: drops(before.weeks, 1), after: drops(after.weeks, 1) } };
}
const flatDose = (p: ReturnType<typeof hGen.generatePlan>) => {
  const doses = new Map<string, Set<string>>();
  for (const w of p.weeks) for (const d of w.days) for (const e of d.exercises) (doses.get(e.name) ?? doses.set(e.name, new Set()).get(e.name)!).add(`${e.sets}x${e.reps}`);
  return [...doses.values()].every((s) => s.size === 1);
};
const bought = hGen.generatePlan(newUser, 'program_12w');
const revised = Rev.reviseEarlyDepthDrops(JSON.parse(JSON.stringify(bought.weeks)));
const headWorkoutView = git('show', `HEAD:${PREFIX}components/workout-view.tsx`);
const headCatalog = git('show', `HEAD:${PREFIX}lib/wallet/catalog.ts`);
const nowWorkoutView = readFileSync(join(ROOT, 'components/workout-view.tsx'), 'utf8');
const workout = {
  newUserFocus: { pillar: newUser.weakest, label: Mv.PILLAR_LABELS[newUser.weakest], why: 'the page plans from defaultMetrics() (no camera on /workout), so every buyer got this focus' },
  soldBefore: {
    skus: [...headCatalog.matchAll(/(workout_(?:plan_4w|program_12w)):\s*\{[^}]*unitPrice:\s*(\d+)/g)].map((m) => ({ sku: m[1], shards: Number(m[2]) })),
    cards: [...headWorkoutView.matchAll(/<PlanCard title="([^"]+)" price="([^"]+)" blurb="([^"]+)"/g)].map((m) => ({ title: m[1], price: m[2], blurb: m[3] })),
    consent: /I consent to on-device movement analysis[^<]*/.exec(headWorkoutView)?.[0].trim() ?? null,
    week1_plan_4w: week1(hGen.generatePlan(newUser, 'plan_4w')),
    week1_program_12w: week1(bought),
    setsRepsNeverChange: flatDose(bought),
    themes: [...new Set(bought.weeks.map((w) => w.theme))],
  },
  now: {
    onSale: Object.fromEntries(Sale.WORKOUT_PLAN_SKUS.map((s) => [s, Cat.skuOnSale(s)])),
    purchaseAnswer: Sale.PLAN_SALE_PAUSED,
    week1_program_12w: week1(Gen.generatePlan(newUser as never, 'program_12w') as never),
    pageSaysPeriodized: /periodized/i.test(nowWorkoutView),
  },
  byFocus,
  storedRows: {
    shape: 'WorkoutPlan { userId, scanId, tier, focus: plan.focusLabel, weeks: plan.weeks } (app/api/v1/workout/plan/route.ts at HEAD: prisma.workoutPlan.create)',
    headDefault12w: { depthDropsWeeks1to4: drops(bought.weeks), depthDropWeek1: drops(bought.weeks, 1) },
    afterRevisionOnRead: { changed: revised.changed, depthDropsWeeks1to4: drops(revised.weeks as never), note: Rev.planRevisionNote(revised.weeks) },
    dbOffline: 'the lane database is offline, so existing rows are described from the route that wrote them, not read',
  },
};

// ── 6. frames ────────────────────────────────────────────────────────────────────────────────────────────────────
const frames: Json = {};
if (FRAMES && coachPassed && coach.routes) {
  const { chromium } = await import('playwright-core');
  const { chromiumExe } = await import('./_chromium.mts');
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shot = async (name: string, url: string, routes: Record<string, unknown> | null, act: (p: import('playwright-core').Page) => Promise<string>) => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1500 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (routes) {
      await page.route('**/api/**', (route) => {
        const u = new URL(route.request().url());
        const key = u.pathname + u.search;
        const body = routes[key] ?? routes[u.pathname];
        if (body !== undefined) return route.fulfill({ json: body });
        if (u.pathname === '/api/coach/messages') return route.fulfill({ json: { messages: [] } });   // no ProgramMessage rows in the fixture
        return route.fulfill({ status: 404, json: { error: 'not in the fixture' } });
      });
    }
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      const note = await act(page);
      await page.screenshot({ path: join(OUT, name), fullPage: true });
      frames[name] = { url, note, errors };
      log(`frame  ${name} — ${note}`);
    } catch (e) {
      frames[name] = { url, error: (e as Error).message.slice(0, 300), errors };
      log(`frame  ${name} FAILED — ${(e as Error).message.slice(0, 200)}`);
    } finally { await ctx.close(); }
  };
  const routes = coach.routes as { coach: Record<string, unknown>; client: Record<string, unknown> };
  // the client's Today card
  await shot('coach-today-card.png', '/dev/mirror-shots', routes.client, async (p) => {
    await p.getByText('Goblet Squat').first().waitFor({ timeout: 300_000 });
    return (await p.locator('main').innerText()).split('\n').slice(0, 14).join(' | ');
  });
  // the coach's Clients tab
  await shot('coach-clients-tab.png', '/dev/mirror-shots', routes.coach, async (p) => {
    const tab = p.getByRole('button', { name: 'Clients' });
    await tab.waitFor({ timeout: 300_000 });
    for (let i = 0; i < 60; i++) { await tab.click(); if (await p.getByText('Needs you today', { exact: false }).count() || await p.getByText('Roster').count()) break; await p.waitForTimeout(1000); }
    await p.getByText('Sam Fixture').first().waitFor({ timeout: 60_000 });
    await p.waitForTimeout(1500);
    return (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600);
  });
  // /workout as a buyer sees it now (the sale pulled)
  await shot('workout-not-on-sale.png', '/dev/workout-plans', null, async (p) => {
    await p.getByText(Sale.PLAN_SALE_PAUSED).first().waitFor({ timeout: 300_000 });
    // the saved plan fades in once React hydrates (framer-motion, opacity 0 → 1): wait for it, or the frame shows none
    const shown = await p.waitForFunction(() => {
      const note = document.querySelector('[role=note]');
      return !!note?.parentElement && getComputedStyle(note.parentElement).opacity === '1';
    }, undefined, { timeout: 120_000 }).then(() => true).catch(() => false);
    const note = shown ? await p.getByRole('note').first().innerText() : '(the saved plan never faded in)';
    return `the sale-paused line is on the page; the stored plan's note: ${note}`;
  });
  await browser.close();
}

// ── write ────────────────────────────────────────────────────────────────────────────────────────────────────────
const report = {
  format: 'fel-mirror-coach-baseline/1', date: '2026-09-25', head: HEAD, worktree: ROOT,
  node: process.version, camera: B.FIXTURE_CAMERA,
  mirror: {
    fixtures: Object.fromEntries(Object.entries(mirror.fixtures).map(([n, f]) => [n, { view: f.view, pattern: f.pattern, truth: f.truth, squat: f.squat, lunge: f.lunge, framing: Object.fromEntries(Object.entries(f.framing).map(([v, r]) => [v, { ok: `${r.ok}/${r.frames}`, worst: r.worst, bodyFill: r.bodyFill }])) }])),
    screens: mirror.screens,
    coachPanelLine: Object.fromEntries((['modified', 'full'] as const).map((s) => [s, Pr.emptyDraftLine(mirror.screens[s].onComplete.prescribeReason ?? undefined)])),
    notGradedLine: Scr.NOT_GRADED_LINE,
  },
  before: { squat: beforeAfter, screen: screenBefore, headHarnessSentProvisionalForZeroResults: headProvisional, headPanelLabels: headLabels },
  jitter,
  coach: coachSummary,
  workout,
  frames,
  fakeCamera: 'not used for the Mirror: Chromium\'s fake device shows a test pattern with no person, and the pose model finds no body in it (mirror-truth probe: every check row "Not in view")',
};
writeFileSync(join(OUT, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`);
if (coach.routes) writeFileSync(join(OUT, 'coach-routes.json'), `${JSON.stringify(coach.routes, null, 2)}\n`);
log(`wrote ${join(OUT, 'baseline.json')}`);

// a compact read-out
log('\nSQUAT AUDIT (kneeValgus frames: before → after; coach before → after)');
for (const [n, v] of Object.entries(beforeAfter) as [string, { before: Json; after: Json }][]) {
  log(`  ${n.padEnd(28)} ${String(v.before.kneeValgusFrames).padStart(3)} → ${String(v.after.kneeValgusFrames).padStart(3)}   coach: ${(v.before.coach as string[]).join(' / ') || '—'}  →  ${(v.after.coach as string[]).join(' / ') || '—'}`);
}
log('\nJITTER squat audit:'); for (const [n, v] of Object.entries(reps)) log(`  ${n.padEnd(28)} ${JSON.stringify(v)}`);
log('side-on body framing:', JSON.stringify(sideOk));
log('noisy screens:'); for (const s of noisyScreens) log(`  ${JSON.stringify(s)}`);
log('\nSCREENS clean:'); for (const s of ['modified', 'full'] as const) log(`  ${s}: completed ${mirror.screens[s].completed}, stalled at ${mirror.screens[s].stalledAt}, stations ${JSON.stringify(mirror.screens[s].stations.map((x) => [x.id, x.seconds, x.heldBy]))}`);
log('\nCOACH:', coachSummary.test);
log('\nWORKOUT week 1 (HEAD, new user, 12w):', JSON.stringify(workout.soldBefore.week1_program_12w));
if (drift) process.exit(1);
