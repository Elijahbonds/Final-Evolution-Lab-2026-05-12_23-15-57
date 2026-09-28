// MIRROR-COACH P2 (2026-09-26) — THE PHASE'S LIVE PROOF, coach side, on the lane's dev server (:3131).
//
// The lane's database is offline on purpose and the real /api/coach/* routes answer 401 without a session, so every
// data-backed page here runs the production component over the SAME server functions the routes call, on an
// in-memory store (the dev harnesses) or on what the REAL route handlers answered over a fixture Prisma in vitest
// (the board). One page at a time, headless chromium. Sections (--only loop,board,catalogue):
//
//   loop       /dev/coach-loop — ONE store under the coach's builder and the client's Today. The coach builds Day 1
//              (a Prep block with a hold, a Prime, a KEY set, superset A, a timed plank hold, a timed cool-down) and a
//              push-heavy Day 2 through the production ProgramBuilder; the pull-over-push suggestion must appear under
//              Week 1. Then, as the client, Today must render exactly that session by section with the catalogue's cues,
//              faults, the easier version and the demo, run a hold timer and a work timer, and save a per-set log with
//              reps-in-reserve that comes back after a reload.
//   board      /dev/mirror-shots (the production CoachView) with its /api/coach/* calls answered by what the REAL routes
//              returned on (a) P1's baseline fixture — one client, six coached sessions, no games — and (b) the
//              compliance fixture roster (tagged / untagged / programmed-not-done). Reads the attention panel, the
//              roster's two numbers, every strip cell's state and the pull-push lines off the DOM.
//              Needs <out>/board-baseline-routes.json and <out>/board-compliance-routes.json (see the run lines).
//   catalogue  /dev/coach-catalogue — the KB bridge ("Add to my catalogue") with FEL's tags, and a coach typing a
//              name ANOTHER coach already owns (the per-coach key is HELD for the owner's go: this records what the
//              live page does under the schema as it is).
//
// Run from FEL-full-app:
//   env MIRROR_BASELINE_OUT=<out>/loop-baseline-measured.json <vitest> run lib/coach/loop-baseline.test.ts
//   env COMPLIANCE_PROOF_OUT=<out>/board-compliance-routes.json <vitest> run lib/coach/compliance-routes.test.ts
//   (board-baseline-routes.json = loop-baseline-measured.json's routes.coach, written by this script when missing)
//   /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_coach-loop-p2-proof.mts <out> [--only loop,board,catalogue]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/coach-loop-p2-proof';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const want = (s: string) => !ONLY || ONLY.includes(s);
mkdirSync(OUT, { recursive: true });

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const RESULT = join(OUT, 'coach-live.json');
const out: Row = existsSync(RESULT) ? JSON.parse(readFileSync(RESULT, 'utf8')) : {};
Object.assign(out, { base: BASE, date: new Date().toISOString() });
const save = () => writeFileSync(RESULT, `${JSON.stringify(out, null, 2)}\n`);
let section = 'none';
const check = (name: string, pass: boolean, detail: unknown = null) => {
  out[section] ??= { checks: [] };
  out[section].checks ??= [];
  out[section].checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${section}] ${name}`, detail === null ? '' : JSON.stringify(detail).slice(0, 400));
};
const note = (k: string, v: unknown) => { out[section] ??= { checks: [] }; out[section][k] = v; };
async function shot(page: Page, name: string, full = true, what = '') {
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  out.frames ??= {};
  out.frames[`${name}.png`] = what;
}
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
async function open(browser: Browser, width: number, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  return { ctx, page, errors };
}
const serious = (errors: string[]) => errors.filter((e) => !/Download the React DevTools|favicon|youtube|googlevideo|ERR_NAME_NOT_RESOLVED|fel\.local|ERR_INTERNET|ERR_CONNECTION|status of 400|status of 409/i.test(e));

// ── loop ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Plan { name: string; id: string; day: 0 | 1; section: string; superset?: string; key?: boolean; sets?: string; reps?: string; load?: string; work?: string; hold?: string; band?: string; cues?: string[]; note?: string }
const PLAN: Plan[] = [
  // Day 1, typed out of running order on purpose: the builder and Today put it in order
  { day: 0, name: 'Goblet squat', id: 'pe-goblet', section: 'key', key: true, sets: '4', reps: '5', load: '24kg', band: 'Surge', cues: ['Heel, big toe, little toe: press all three into the floor.', 'Brace for a light punch, then breathe behind the brace.'], note: 'Own the bottom.' },
  { day: 0, name: '90/90 hip switch', id: 'pe-flow', section: 'prep', sets: '2', reps: '6 each side', load: 'body', hold: '3', band: 'Idle' },
  { day: 0, name: 'Split squat', id: 'pe-split', section: 'assist', superset: 'A', sets: '3', reps: '8 each', load: 'RPE7', band: 'Drive', cues: ['Drive the floor down through your front heel.'] },
  { day: 0, name: 'Half-kneeling row', id: 'pe-row', section: 'assist', superset: 'A', sets: '3', reps: '10 each', load: 'RPE7', band: 'Drive', cues: ['Drive your elbows toward your back pockets.'] },
  { day: 0, name: 'Pogo hops', id: 'pe-pogo', section: 'prime', sets: '2', reps: '10', load: 'body', band: 'Cruise' },
  { day: 0, name: 'Front plank', id: 'pe-plank', section: 'finish', sets: '3', load: 'body', work: '30' },
  { day: 0, name: 'Crocodile breathing', id: 'pe-croc', section: 'cooldown', sets: '1', load: 'body', work: '90', cues: ['Let the air out longer than it came in.'] },
  // Day 2: a push-heavy upper day — 9 pressing sets against Day 1's 3 pulling sets
  { day: 1, name: 'Push-up', id: 'pe-pushup', section: 'key', sets: '3' },
  { day: 1, name: 'Landmine press', id: 'pe-press', section: 'assist', sets: '3' },
  { day: 1, name: 'DB bench press', id: 'pe-bench', section: 'assist', sets: '3' },
];
const BAND_ID: Record<string, string> = { Idle: 'idle', Cruise: 'cruise', Drive: 'drive', Surge: 'surge', 'Full throttle': 'full' };
const API = `${BASE}/dev/coach-loop/api`;
const api = async (q: string) => (await fetch(`${API}?${q}`)).json() as Promise<Row>;

async function loopBuilder(browser: Browser) {
  const { ctx, page, errors } = await open(browser, 900);
  try {
    await page.goto(`${BASE}/dev/coach-loop?reset=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.getByTestId('program-builder').getByText('Day 1 — full').waitFor({ timeout: 240_000 });
    await page.waitForTimeout(500);
    const days = page.locator('[data-session]');
    for (const p of PLAN) {
      const d = days.nth(p.day);
      await d.getByLabel('Exercise to add').selectOption(p.id);
      await d.getByLabel('Section to add into').selectOption(p.section);
      await d.getByRole('button', { name: 'Add exercise' }).click();
      await d.getByRole('button', { name: `Edit ${p.name}` }).waitFor({ timeout: 20_000 });
    }
    for (const p of PLAN.filter((x) => x.day === 0)) {
      await days.nth(0).getByRole('button', { name: `Edit ${p.name}` }).click();
      const ed = page.getByTestId('exercise-editor');
      await ed.waitFor();
      const box = (label: string) => ed.locator('label', { hasText: label }).locator('input').first();
      if (p.superset) await ed.locator('label', { hasText: 'Superset' }).locator('select').selectOption(p.superset);
      if (p.key) await ed.locator('label', { hasText: 'Key set' }).locator('input[type=checkbox]').check();
      if (p.sets) await box('Sets').fill(p.sets);
      if (p.work) { await ed.locator('label', { hasText: 'Timed' }).locator('input').check(); await box('Work s / set').fill(p.work); }
      else if (p.reps) await box('Reps').fill(p.reps);
      if (p.load) await box('Load').fill(p.load);
      if (p.hold) await box('Hold s').fill(p.hold);
      if (p.band) await ed.getByRole('radio', { name: new RegExp(`^${p.band} `) }).click();
      for (const c of p.cues ?? []) await ed.getByRole('button', { name: c }).click();
      if (p.note) await ed.locator('label', { hasText: 'Note to your athlete' }).locator('input').fill(p.note);
      if (p.key) await shot(page, 'proof-builder-editor-key-set', true, 'coach: the edit panel for the key set (section Key, Key set on, 4×5 @ 24kg, Surge, two set-up cues, a note)');
      await ed.getByRole('button', { name: 'Save' }).click();
      await page.getByTestId('exercise-editor').waitFor({ state: 'detached', timeout: 20_000 });
    }
    // what a fresh load returns, field by field
    await page.getByTestId('reload').click();
    await page.waitForTimeout(800);
    const loaded = await api('op=load');
    const d1 = loaded.program.tree.blocks[0].sessions[0].exercises as Row[];
    note('storedDay1', d1.map((e) => ({ name: e.name, section: e.section, isKeySet: e.isKeySet, supersetGroup: e.supersetGroup, sets: e.sets, reps: e.reps, load: e.load, workSeconds: e.workSeconds, holdSeconds: e.holdSeconds, effortBand: e.effortBand, setupCues: e.setupCues, coachNote: e.coachNote })));
    const diffs: Row[] = [];
    for (const p of PLAN.filter((x) => x.day === 0)) {
      const got = d1.find((e) => e.exerciseId === p.id);
      const want: Row = {
        section: p.section, isKeySet: !!p.key, supersetGroup: p.superset ?? null, sets: Number(p.sets), load: p.load,
        workSeconds: p.work ? Number(p.work) : null, holdSeconds: p.hold ? Number(p.hold) : null, effortBand: p.band ? BAND_ID[p.band] : null, coachNote: p.note ?? null,
      };
      for (const [k, v] of Object.entries(want)) if (JSON.stringify(got?.[k]) !== JSON.stringify(v)) diffs.push({ exercise: p.name, field: k, want: v, got: got?.[k] });
      if ((got?.setupCues ?? []).length !== (p.cues ?? []).length) diffs.push({ exercise: p.name, field: 'setupCues', want: (p.cues ?? []).length, got: got?.setupCues });
    }
    check('builder: every structure field typed on Day 1 is what a fresh load returns', diffs.length === 0, diffs);
    check('builder: stored in running order (prep, prime, key, assist ×2, finish, cooldown)', JSON.stringify(d1.map((e) => e.section)) === '["prep","prime","key","assist","assist","finish","cooldown"]', d1.map((e) => e.section));
    const rows = await days.nth(0).locator('[data-section] button[aria-expanded]').allTextContents();
    note('builderRowsDay1', rows);
    check('builder: a Prep block, one KEY set, A1/A2, a timed plank hold, a hold on the prep item', rows[0]?.includes('90/90') && rows[0].includes('hold 3 s')
      && rows.filter((r) => r.includes('KEY')).length === 1 && rows.some((r) => r.startsWith('A1') && r.includes('Split squat')) && rows.some((r) => r.startsWith('A2') && r.includes('Half-kneeling row'))
      && rows.some((r) => r.includes('Front plank') && /3 × 30 s/.test(r)), rows);
    const pp = await page.locator('[data-testid="pull-push"]').allInnerTexts();
    note('pullPush', pp);
    check('builder: the push-heavy week shows the pull-over-push suggestion under Week 1 (9 pressing, 3 pulling)', pp.length === 1 && /9 pressing sets and 3 pulling sets/.test(pp[0]) && /Add 6 pulling sets/.test(pp[0]), pp);
    check('builder: no builder warnings on the finished week', JSON.stringify(loaded.warnings) === '{}', loaded.warnings);
    await days.nth(0).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'proof-builder', true, 'coach: /dev/coach-loop builder after Reload from server — Week 1 with the pull-over-push suggestion, Day 1 by section with KEY, A1/A2, the hold and the timed plank, Day 2 push-heavy');
    check('builder: no console errors', serious(errors).length === 0, serious(errors));
  } finally { await ctx.close(); }
}

async function loopToday(browser: Browser, width: number, tag: string) {
  const { ctx, page, errors } = await open(browser, width);
  const card = (name: string) => page.locator('[data-exercise]', { has: page.locator('[data-name]', { hasText: new RegExp(`^${name}$`) }) });
  try {
    await page.goto(`${BASE}/dev/coach-loop?view=today`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.getByTestId('today').waitFor({ timeout: 240_000 });
    await page.evaluate(() => { try { localStorage.setItem('fel.weightUnit', 'kg'); } catch { /* */ } });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tag}: no horizontal overflow at ${width}px`, overflow <= 0, { overflow });
    const sections = await page.locator('[data-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    check(`${tag}: Today renders the coach's Day 1 by section, in running order`, JSON.stringify(sections) === '["prep","prime","key","assist","finish","cooldown"]', sections);
    const names = await page.locator('[data-exercise] [data-name]').allTextContents();
    note(`${tag}Names`, names);
    check(`${tag}: the same seven exercises the coach saved`, JSON.stringify(names) === JSON.stringify(['90/90 hip switch', 'Pogo hops', 'Goblet squat', 'Split squat', 'Half-kneeling row', 'Front plank', 'Crocodile breathing']), names);
    const keyName = await page.locator('[data-key-set="true"] [data-name]').allTextContents();
    check(`${tag}: one KEY SET, on the goblet squat`, (await page.locator('[data-key-badge]').count()) === 1 && JSON.stringify(keyName) === '["Goblet squat"]', keyName);
    const ss = page.locator('[data-superset="A"]');
    const ssLabels = await ss.locator('[data-label]').allTextContents();
    check(`${tag}: superset A as one block, A1/A2`, JSON.stringify(ssLabels) === '["A1","A2"]', ssLabels);
    const g = card('Goblet squat');
    const coaching = {
      cues: await g.locator('[data-cues] > div.text-sm').allTextContents(),
      faults: await g.locator('[data-faults] > div.text-sm').allTextContents(),
      easier: await g.locator('[data-easier]').textContent().catch(() => null),
      band: await g.locator('[data-band]').getAttribute('data-band').catch(() => null),
      setup: await g.locator('[data-setup] > div.text-sm').allTextContents(),
      demo: await g.locator('[data-demo]').getAttribute('data-demo').catch(() => null),
      dose: await g.locator('[data-dose]').textContent().catch(() => null),
    };
    note(`${tag}GobletCard`, coaching);
    check(`${tag}: the key card carries the catalogue's cues (3), faults with fixes (2), the easier version by name, the band, the coach's set-up picks (2) and the demo video`,
      coaching.cues.length === 3 && coaching.faults.length === 2 && !!coaching.easier?.startsWith('Easier version: Box squat') && coaching.band === 'surge' && coaching.setup.length === 2 && coaching.demo === 'file', coaching);
    await g.evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8); });
    if (tag === 'phone') await shot(page, 'proof-today-key-card-phone', false, 'client (390px): the key set card — KEY SET, dose, cues, faults, easier version, set-up picks, the band');
    // the demo on tap (pogo: a YouTube link → the privacy-mode embed)
    const pogo = card('Pogo hops');
    await pogo.getByRole('button', { name: 'Watch the demo' }).click();
    const src = await pogo.locator('iframe').getAttribute('src').catch(() => null);
    check(`${tag}: the pogo demo plays in a privacy-mode YouTube embed on tap`, !!src && src.startsWith('https://www.youtube-nocookie.com/embed/q1HLjLbhS2s'), src);
    // the hold timer (3 s) runs to 0:00
    const flow = card('90/90 hip switch');
    await flow.locator('[data-timer="hold"]').click();
    await page.waitForTimeout(1_100);
    const mid = await flow.getByTestId(/timer-.*-clock/).textContent();
    await page.waitForTimeout(3_200);
    const end = await flow.getByTestId(/timer-.*-clock/).textContent();
    check(`${tag}: the 3-second hold timer counts down and ends at 0:00`, (mid === '0:02' || mid === '0:01') && end === '0:00', { mid, end });
    // the timed plank hold: a work run, stopped at ~3 s, logs its seconds into set 1
    const plank = card('Front plank');
    await plank.scrollIntoViewIfNeeded();
    // the seconds already on the card (the desktop run follows the phone's save, so set 1 already holds a time)
    const secs = async () => Promise.all([1, 2, 3].map((n) => plank.getByLabel(`Set ${n} seconds`, { exact: true }).inputValue()));
    const before = await secs();
    await plank.locator('[data-timer="work"]').click();
    await page.waitForTimeout(3_300);
    const running = await plank.getByTestId(/timer-.*-clock/).textContent();
    if (tag === 'phone') await shot(page, 'proof-today-plank-timer-phone', false, 'client (390px): the timed plank hold running (30 s work timer)');
    await plank.getByRole('button', { name: 'Stop and log the time' }).click();
    const after = await secs();
    const landed = after.findIndex((v, i) => v !== before[i]);
    const worked = landed >= 0 ? after[landed] : '';
    note(`${tag}PlankSeconds`, { before, after, landedInSet: landed + 1 });
    // "Stop early and the seconds you worked go in the next set": the first set with no time yet
    const nextEmpty = before.findIndex((v) => v === '') + 1;
    check(`${tag}: the 30-second plank timer runs (${running}) and, stopped at ~3 s, logs its seconds into the next empty set (set ${nextEmpty})`,
      (running === '0:27' || running === '0:26') && (worked === '3' || worked === '4') && landed + 1 === nextEmpty, { running, before, after });
    if (tag !== 'phone') {
      check(`${tag}: no console errors`, serious(errors).length === 0, serious(errors));
      await g.screenshot({ path: join(OUT, 'proof-today-key-card-desktop.png') });
      out.frames['proof-today-key-card-desktop.png'] = 'client (900px): the key set card alone — KEY SET, dose + band, set-up picks, coach note, cues, faults, easier version, demo link, the two logged sets';
      await shot(page, 'proof-today-desktop', true, 'client (900px): Today over the coach-built session — full page');
      return;
    }

    // per-set logging with reps-in-reserve, on the key set
    await g.scrollIntoViewIfNeeded();
    await g.getByLabel('Set 1 reps', { exact: true }).fill('5');
    await g.getByLabel('Set 1 weight in kg', { exact: true }).fill('24');
    await g.getByRole('button', { name: 'Set 1 reps left 2' }).click();
    await g.getByLabel('Set 1 effort', { exact: true }).selectOption('8');
    const hint = await g.locator('[data-set-row="0"] [data-rir-hint]').textContent().catch(() => null);
    await g.getByRole('button', { name: 'Set 2: same as set 1' }).click();
    await g.getByRole('button', { name: 'Set 2 reps left 1' }).click();
    await g.getByLabel('Set 2 effort', { exact: true }).selectOption('9');
    note('rirHint', hint);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1_500);
    const st = await api('op=store');
    const goblet = (st.sessionExercises as Row[]).find((e) => e.exerciseId === 'pe-goblet');
    const gLog = (st.logs as Row[]).find((l) => l.sessionExerciseId === goblet?.id);
    const gSets = gLog ? (st.setLogs as Row[]).filter((x) => x.exerciseLogId === gLog.id).sort((a, b) => a.setIndex - b.setIndex) : [];
    const pLog = (st.logs as Row[]).find((l) => l.sessionExerciseId === (st.sessionExercises as Row[]).find((e) => e.exerciseId === 'pe-plank')?.id);
    const pSets = pLog ? (st.setLogs as Row[]).filter((x) => x.exerciseLogId === pLog.id) : [];
    note('storedSetLogs', { goblet: gSets.map((x) => ({ setIndex: x.setIndex, reps: x.reps, weightKg: x.weightKg, rir: x.rir, effort: x.effort })), gobletSummary: gLog && { actualSets: gLog.actualSets, actualReps: gLog.actualReps, actualLoad: gLog.actualLoad, rpe: gLog.rpe }, plank: pSets.map((x) => ({ setIndex: x.setIndex, workSeconds: x.workSeconds })) });
    check('phone: the key set saves as two SetLog rows with reps-in-reserve 2 and 1 (effort 8, 9) on the log of the session exercise the coach built',
      gSets.length === 2 && JSON.stringify(gSets.map((x) => [x.reps, x.weightKg, x.rir, x.effort])) === '[[5,24,2,8],[5,24,1,9]]', gSets);
    check('phone: the plank hold saves its seconds as a SetLog', pSets.length === 1 && pSets[0].workSeconds === Number(worked), pSets);
    // reload: what was saved comes back on screen
    await page.goto(`${BASE}/dev/coach-loop?view=today`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByTestId('today').waitFor({ timeout: 60_000 });
    const g2 = card('Goblet squat');
    const back = {
      reps: [await g2.getByLabel('Set 1 reps', { exact: true }).inputValue(), await g2.getByLabel('Set 2 reps', { exact: true }).inputValue()],
      kg: [await g2.getByLabel('Set 1 weight in kg', { exact: true }).inputValue(), await g2.getByLabel('Set 2 weight in kg', { exact: true }).inputValue()],
      rir2: await g2.getByRole('button', { name: 'Set 1 reps left 2' }).getAttribute('aria-pressed'),
      rir1: await g2.getByRole('button', { name: 'Set 2 reps left 1' }).getAttribute('aria-pressed'),
      effort: [await g2.getByLabel('Set 1 effort', { exact: true }).inputValue(), await g2.getByLabel('Set 2 effort', { exact: true }).inputValue()],
    };
    note('afterReload', back);
    check('phone: after a reload the two sets display again — reps, kg, the reps-left chips pressed, effort', JSON.stringify(back) === JSON.stringify({ reps: ['5', '5'], kg: ['24', '24'], rir2: 'true', rir1: 'true', effort: ['8', '9'] }), back);
    await g2.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -40));
    await shot(page, 'proof-today-logged-phone', false, 'client (390px): after a reload — the key set shows the two saved sets with reps-left chips 2 and 1 pressed');
    await shot(page, 'proof-today-phone-full', true, 'client (390px): Today, full page, after the save and a reload');
    check('phone: no console errors', serious(errors).length === 0, serious(errors));
  } finally { await ctx.close(); }
}

// ── board ────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function board(browser: Browser, routesFile: string, tag: string) {
  const routes = JSON.parse(readFileSync(routesFile, 'utf8')) as Row;
  const { ctx, page, errors } = await open(browser, 900, 1000);
  const served: string[] = [];
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    const body = routes[u.pathname + u.search] ?? routes[u.pathname];
    served.push(`${body !== undefined ? 200 : u.pathname === '/api/coach/messages' ? 200 : 404} ${u.pathname}${u.search}`);
    if (body !== undefined) return route.fulfill({ json: body });
    if (u.pathname === '/api/coach/messages') return route.fulfill({ json: { messages: [] } });
    return route.fulfill({ status: 404, json: { error: 'not in the fixture' } });
  });
  try {
    await page.goto(`${BASE}/dev/mirror-shots`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    const tab = page.getByRole('button', { name: 'Clients' });
    await tab.waitFor({ timeout: 300_000 });
    for (let i = 0; i < 60; i++) { await tab.click(); if (await page.getByText('Needs you today').count()) break; await page.waitForTimeout(1000); }
    await page.locator('[data-roster-row]').first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(800);
    const panel = page.locator('section[aria-labelledby="attention-heading"]');
    note(`${tag}Panel`, (await panel.innerText().catch(() => '')).split('\n').filter(Boolean));
    note(`${tag}Drifting`, await page.locator('[data-testid="drifting"] li').allInnerTexts().catch(() => []));
    const rows = await page.locator('[data-roster-row]').evaluateAll((els) => els.map((row) => ({
      client: row.getAttribute('data-roster-row'),
      head: (row.querySelector('.text-sm') as HTMLElement | null)?.innerText ?? '',
      text: (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 300),
      cells: Object.fromEntries([...row.querySelectorAll('[data-pattern]')].map((c) => [c.getAttribute('data-pattern'), c.getAttribute('data-state')])),
      line: (row.querySelector('[data-testid="coverage-strip"] > div') as HTMLElement | null)?.innerText ?? null,
    })));
    note(`${tag}Roster`, rows);
    note(`${tag}Legend`, await page.locator('[data-testid="coverage-legend"]').innerText().catch(() => null));
    note(`${tag}PullPush`, await page.locator('[data-testid="pull-push"]').allInnerTexts());
    await panel.evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, `proof-board-${tag}`, false, `coach: Clients tab on the ${tag} fixture — "Needs you today" and the top of the roster`);
    const roster = page.locator('[data-roster-row]').first().locator('xpath=..');
    await roster.screenshot({ path: join(OUT, `proof-roster-strip-${tag}.png`) });
    out.frames ??= {}; out.frames[`proof-roster-strip-${tag}.png`] = `coach: the roster on the ${tag} fixture — two numbers per client and the six-pattern strip`;
    note(`${tag}Served`, [...new Set(served)]);
    note(`${tag}Errors`, serious(errors));
  } finally { await ctx.close(); }
}

// ── catalogue ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function catalogue(browser: Browser) {
  const { ctx, page, errors } = await open(browser, 900);
  const all = async () => (await (await fetch(`${BASE}/dev/coach-catalogue/api?op=all`)).json()) as Row[];
  const mine = async () => (await (await fetch(`${BASE}/dev/coach-catalogue/api?op=list`)).json()) as Row;
  const close = () => page.locator('button:has(svg.lucide-x)').first().click().catch(() => {});
  try {
    await page.goto(`${BASE}/dev/coach-catalogue?reset=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.getByText('Single-Leg Pogo Hops').first().waitFor({ timeout: 240_000 });
    // 1. the bridge: a KB drill nobody has copied
    await page.getByText('Single-Leg Pogo Hops').first().click();
    const add = page.getByRole('button', { name: /Add to my catalogue/ });
    await add.waitFor({ timeout: 20_000 });
    const kbTags = await page.locator('[role="dialog"]').innerText().catch(() => '');
    note('kbDetailText', kbTags.replace(/\s+/g, ' ').slice(0, 600));
    await add.click();
    const added = await page.getByRole('button', { name: /In your catalogue/ }).waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    await shot(page, 'proof-catalogue-kb-added', true, 'coach: the KB detail for Single-Leg Pogo Hops after "Add to my catalogue" — the button reads "In your catalogue"');
    await close();
    const list = await mine();
    const items = (Array.isArray(list) ? list : (list.items ?? list.exercises ?? [])) as Row[];
    const pogo = items.find((r) => /Pogo/.test(String(r.name)));
    note('bridgedRow', pogo ? { name: pogo.name, pattern: pogo.pattern, braceMode: pogo.braceMode, skillLayer: pogo.skillLayer, primaryCues: (pogo.primaryCues ?? []).length, category: pogo.category } : null);
    check('KB bridge: "Add to my catalogue" makes a prescribable row with FEL\'s tags (pattern, brace mode, skill layer)', added && !!pogo && !!pogo.pattern && !!pogo.braceMode && !!pogo.skillLayer, pogo && { pattern: pogo.pattern, braceMode: pogo.braceMode, skillLayer: pogo.skillLayer });
    // 2. a KB drill ANOTHER coach already copied (Crocodile Breathing): under the FEL-wide name key it is refused
    await page.getByText('Crocodile Breathing').first().click();
    await page.getByRole('button', { name: /Add to my catalogue/ }).click();
    await page.waitForTimeout(1_500);
    const crocDialog = (await page.locator('[role="dialog"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const toast = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
    const crocAdded = await page.getByRole('button', { name: /In your catalogue/ }).count();
    note('crocSecondCoach', { toast, inYourCatalogue: crocAdded, owners: (await all()).filter((r) => r.name === 'Crocodile Breathing').map((r) => r.coachId) });
    await shot(page, 'proof-catalogue-croc-second-coach', true, 'coach: Crocodile Breathing, which another coach already copied — what the page says under the FEL-wide name key');
    await close();
    // 3. typing a name another coach owns: "Goblet Squat"
    await page.getByRole('tab', { name: /My catalogue/ }).click();
    await page.getByRole('button', { name: /New exercise/ }).click();
    await page.getByPlaceholder('e.g. Goblet Squat').fill('Goblet Squat');
    const selects = page.locator('select');
    await selects.nth(0).selectOption('lower-body');
    await selects.nth(1).selectOption('squat');
    await selects.nth(2).selectOption('set');
    await selects.nth(3).selectOption('strength');
    await page.getByRole('button', { name: 'Add to catalogue' }).click();
    await page.waitForTimeout(2_000);
    const form = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const msg = /[^.]*(another coach|already|taken)[^.]*\./i.exec(form)?.[0] ?? null;
    const owners = (await all()).filter((r) => String(r.name).toLowerCase() === 'goblet squat').map((r) => r.coachId);
    note('gobletSecondCoach', { owners, message: msg });
    check('two coaches\' same-named exercises coexist ("Goblet Squat" owned by dev-other-coach AND dev-coach)', owners.includes('dev-coach') && owners.includes('dev-other-coach'), { owners, message: msg });
    await shot(page, 'proof-catalogue-goblet-second-coach', true, 'coach: New exercise "Goblet Squat" (another coach owns that name) — the answer under the schema as it is');
    note('errors', serious(errors));
  } finally { await ctx.close(); }
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
try {
  if (want('loop')) {
    section = 'loop'; out.loop = { checks: [] };
    try { await loopBuilder(browser); } catch (e) { note('builderError', String(e).slice(0, 600)); }
    save();
    try { await loopToday(browser, 390, 'phone'); } catch (e) { note('todayPhoneError', String(e).slice(0, 600)); }
    save();
    try { await loopToday(browser, 900, 'desktop'); } catch (e) { note('todayDesktopError', String(e).slice(0, 600)); }
    save();
  }
  if (want('board')) {
    section = 'board'; out.board = { checks: [] };
    const baseRoutes = join(OUT, 'board-baseline-routes.json');
    if (!existsSync(baseRoutes) && existsSync(join(OUT, 'loop-baseline-measured.json'))) {
      writeFileSync(baseRoutes, JSON.stringify(JSON.parse(readFileSync(join(OUT, 'loop-baseline-measured.json'), 'utf8')).routes.coach, null, 1));
    }
    for (const [file, tag] of [[baseRoutes, 'baseline'], [join(OUT, 'board-compliance-routes.json'), 'compliance']] as const) {
      if (!existsSync(file)) { note(`${tag}Missing`, file); continue; }
      try { await board(browser, file, tag); } catch (e) { note(`${tag}Error`, String(e).slice(0, 600)); }
      save();
    }
  }
  if (want('catalogue')) {
    section = 'catalogue'; out.catalogue = { checks: [] };
    try { await catalogue(browser); } catch (e) { note('error', String(e).slice(0, 600)); }
    save();
  }
} finally {
  await browser.close();
  save();
  console.log(`wrote ${RESULT}`);
}
