// MIRROR-COACH P2 (2026-09-25) — LIVE PROOF of the client's Today on the lane's dev server (:3131).
//
// /dev/coach-today renders the production TodayView (app/coach/_components/today-view.tsx) with its reads and saves
// pointed at the real Today server code (lib/coach/todayServer.ts loadToday / saveClientLog) over an in-memory store —
// the lane's database is offline, and the real routes answer 401 without a session. This drives it the way a client
// would, one page at a time, headless chromium:
//   1. the session reads by section in running order; one KEY SET; superset A as one block with A1/A2
//   2. each card shows the catalogue's coaching: cues, faults, the easier version by name (and NOT another coach's
//      row), the band, the set-up picks; the demo plays on tap (YouTube embed / video file)
//   3. the old free-text row on the split squat shows as it was ("Saved earlier: 3×8,8,8 @ 24kg · RPE 7")
//   4. timers: a 5-second hold runs to 0:00; a work run stopped early logs its seconds into set 1
//   5. per-set logging in lb: reps, weight, reps-left chips with their anchor, effort; "same again"
//   6. a bad set (250 reps) is refused with its row and its own line, and nothing is stored
//   7. a good save lands in kg per set, the ExerciseLog summary is derived, the untouched old row keeps its numbers
//   8. reload: the sets come back in lb; the kg switch converts them
//   9. Done → "Program complete"
// Frames at phone (390) and desktop (900). Console errors are collected.
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_coach-today-p2.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/coach-today-p2';
mkdirSync(OUT, { recursive: true });
const out: Record<string, unknown> = { base: BASE, date: new Date().toISOString(), steps: [] as unknown[], checks: [] as unknown[] };
const step = (name: string, data: Record<string, unknown> = {}) => { (out.steps as unknown[]).push({ name, ...data }); console.log(name, JSON.stringify(data)); };
const check = (name: string, pass: boolean, detail: unknown = null) => { (out.checks as unknown[]).push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, detail === null ? '' : JSON.stringify(detail)); };
async function shot(page: Page, name: string, full = true) { await page.waitForTimeout(250); await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full }); }
const card = (page: Page, name: string) => page.locator('[data-exercise]', { has: page.locator('[data-name]', { hasText: new RegExp(`^${name}$`) }) });
async function store(page: Page) { return page.evaluate(async (b) => (await fetch(`${b}/dev/coach-today/api?op=store`)).json(), BASE); }

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function launch(width: number) {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { browser, page, errors };
}

async function phone() {
  const { browser, page, errors } = await launch(390);
  try {
    await page.goto(`${BASE}/dev/coach-today?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByTestId('today').waitFor({ timeout: 120_000 });
    await page.evaluate(() => { try { localStorage.removeItem('fel.weightUnit'); } catch { /* */ } });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: no horizontal overflow at 390px', overflow <= 0, { overflow });
    await shot(page, 'phone-0-today', false);

    // 1. structure
    const sections = await page.locator('[data-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    check('sections in running order', JSON.stringify(sections) === JSON.stringify(['prep', 'prime', 'key', 'assist', 'finish', 'cooldown']), sections);
    const keys = await page.locator('[data-key-badge]').count();
    const keyName = await page.locator('[data-key-set="true"] [data-name]').first().textContent();
    check('exactly one KEY SET, on the goblet squat', keys === 1 && keyName === 'Goblet squat', { keys, keyName });
    const ss = page.locator('[data-superset="A"]');
    const ssLabels = await ss.locator('[data-label]').allTextContents();
    const ssNames = await ss.locator('[data-exercise] [data-name]').allTextContents();
    check('superset A is one block: A1 Split squat, A2 Half-kneeling row', JSON.stringify(ssLabels) === '["A1","A2"]' && JSON.stringify(ssNames) === '["Split squat","Half-kneeling row"]', { ssLabels, ssNames });

    // 2. the coaching
    const g = card(page, 'Goblet squat');
    await g.scrollIntoViewIfNeeded();
    const gCues = await g.locator('[data-cues] > div.text-sm').allTextContents();
    const gFaults = await g.locator('[data-faults] > div.text-sm').allTextContents();
    const gEasier = await g.locator('[data-easier]').textContent();
    const gBand = await g.locator('[data-band]').getAttribute('data-band');
    const gSetup = await g.locator('[data-setup] > div.text-sm').allTextContents();
    check('goblet: three cues, two faults with fixes, set-up picks, the Surge band', gCues.length === 3 && gFaults.length === 2 && gFaults.every((f) => f.includes('→')) && gSetup.length === 2 && gBand === 'surge', { gCues, gFaults, gSetup, gBand });
    check('goblet: the easier version by name', !!gEasier && gEasier.startsWith('Easier version: Box squat.'), gEasier);
    await shot(page, 'phone-1-key-card', false);
    const s = card(page, 'Split squat');
    const sEasier = await s.locator('[data-easier]').count();
    const body = await page.locator('body').textContent();
    check('split squat: another coach\'s row is never named as its easier version', sEasier === 0 && !body!.includes('ANOTHER COACH PRIVATE DRILL'), { sEasier });
    const legacy = await s.locator('[data-legacy-log]').textContent();
    check('the old free-text row shows as it was', legacy?.trim() === 'Saved earlier: 3×8,8,8 @ 24kg · RPE 7', legacy);
    check('split squat: a video-file demo', (await s.locator('[data-demo="file"]').count()) === 1);
    await ss.scrollIntoViewIfNeeded();
    await shot(page, 'phone-2-superset', false);
    const pogo = card(page, 'Pogo hops');
    await pogo.getByRole('button', { name: 'Watch the demo' }).click();
    const src = await pogo.locator('iframe').getAttribute('src');
    check('pogo hops: the demo plays in a privacy-mode YouTube embed on tap', !!src && src.startsWith('https://www.youtube-nocookie.com/embed/q1HLjLbhS2s'), src);

    // 4. timers
    const flow = card(page, '90/90 hip switch');
    await flow.locator('[data-timer="hold"]').click();
    await page.waitForTimeout(1200);
    const mid = await flow.getByTestId(/timer-.*-clock/).textContent();
    await page.waitForTimeout(5000);
    const end = await flow.getByTestId(/timer-.*-clock/).textContent();
    const endLabel = await flow.locator('[data-testid^="timer-"] .uppercase').first().textContent();
    check('a 5-second hold counts down and ends at 0:00', (mid === '0:04' || mid === '0:03') && end === '0:00' && /done/.test(endLabel ?? ''), { mid, end, endLabel });
    const carry = card(page, 'Suitcase carry');
    await carry.scrollIntoViewIfNeeded();
    await carry.locator('[data-timer="work"]').click();
    await page.waitForTimeout(3300);
    await shot(page, 'phone-3-carry-timer', false);
    await carry.getByRole('button', { name: 'Stop and log the time' }).click();
    const worked = await carry.getByLabel('Set 1 seconds', { exact: true }).inputValue();
    check('a work run stopped at ~3 s logs its seconds into set 1', worked === '3' || worked === '4', worked);

    // 5. per-set logging, in pounds
    await page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'lb' }).click();
    await g.scrollIntoViewIfNeeded();
    await g.getByLabel('Set 1 reps', { exact: true }).fill('5');
    await g.getByLabel('Set 1 weight in lb', { exact: true }).fill('135');
    await g.getByRole('button', { name: 'Set 1 reps left 2' }).click();
    await g.getByLabel('Set 1 effort', { exact: true }).selectOption('8');
    const anchor = await g.locator('[data-set-row="0"] [data-rir-hint]').textContent();
    check('the reps-left chip shows its plain anchor', anchor === '2 = two more clean reps left', anchor);
    await g.getByRole('button', { name: 'Set 2: same as set 1' }).click();
    const copied = [await g.getByLabel('Set 2 reps', { exact: true }).inputValue(), await g.getByLabel('Set 2 weight in lb', { exact: true }).inputValue()];
    check('"same again" copies reps and weight', JSON.stringify(copied) === '["5","135"]', copied);
    await g.getByRole('button', { name: 'Set 2 reps left 1' }).click();
    await g.getByLabel('Set 2 effort', { exact: true }).selectOption('9');
    await carry.getByLabel('Set 1 weight in lb', { exact: true }).fill('53');
    // 6. a bad set: 250 reps
    await g.getByLabel('Set 3 reps', { exact: true }).fill('250');
    await shot(page, 'phone-4-logging', false);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const err = g.locator('[data-set-error]');
    await err.waitFor({ timeout: 15_000 });
    const errText = await err.textContent();
    const afterBad = await store(page);
    check('250 reps is refused with its row and its own line, and nothing is stored', errText === 'Set 3: Reps are a whole number from 0 to 100.' && afterBad.setLogs.length === 0 && afterBad.logs.length === 2, { errText, setLogs: afterBad.setLogs.length, logs: afterBad.logs.length });
    await shot(page, 'phone-5-refused', false);

    // 7. the good save
    await g.getByLabel('Set 3 reps', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1500);
    const st = await store(page);
    const gLog = st.logs.find((l: Row) => l.actualReps === '5,5');
    const gSets = gLog ? st.setLogs.filter((x: Row) => x.exerciseLogId === gLog.id).sort((a: Row, b: Row) => a.setIndex - b.setIndex) : [];
    check('goblet: two sets stored in kg with reps left and effort; summary derived (a weight, never RPE)', gSets.length === 2 && gSets.every((x: Row) => x.weightKg === 61.235 && x.reps === 5) && JSON.stringify(gSets.map((x: Row) => [x.rir, x.effort])) === '[[2,8],[1,9]]' && gLog.actualLoad === '61.2 kg' && gLog.rpe === 9,
      { gLog: gLog && { actualSets: gLog.actualSets, actualReps: gLog.actualReps, actualLoad: gLog.actualLoad, rpe: gLog.rpe }, gSets: gSets.map((x: Row) => ({ reps: x.reps, weightKg: x.weightKg, rir: x.rir, effort: x.effort })) });
    const cLog = st.logs.find((l: Row) => l.actualLoad === '24 kg');
    const cSets = cLog ? st.setLogs.filter((x: Row) => x.exerciseLogId === cLog.id) : [];
    check('carry: the timed set stored its seconds and 53 lb as 24.04 kg', cSets.length === 1 && cSets[0].workSeconds === Number(worked) && cSets[0].weightKg === 24.04, cSets);
    const old = st.logs.find((l: Row) => l.id === 'log-day2-split');
    check('the untouched old row keeps its numbers', old && old.actualLoad === '24kg' && old.actualReps === '8,8,8' && old.rpe === 7, old);
    const untouched = st.logs.filter((l: Row) => l.clientSessionId === 'cs-day2' && l.id !== 'log-day2-split' && l.actualSets === null);
    check('untouched exercises logged nothing (no prescription copied in as a log)', untouched.length === 4 && untouched.every((l: Row) => l.actualLoad === null && l.actualReps === null), untouched.length);
    out.store = st;

    // 8. reload: back in lb; kg converts
    // a fresh load WITHOUT ?reset=1 (a plain reload would re-seed the store)
    await page.goto(`${BASE}/dev/coach-today`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByTestId('today').waitFor({ timeout: 60_000 });
    const g2 = card(page, 'Goblet squat');
    const back = [await g2.getByLabel('Set 1 weight in lb', { exact: true }).inputValue(), await g2.getByLabel('Set 2 weight in lb', { exact: true }).inputValue(), await g2.getByRole('button', { name: 'Set 2 reps left 1' }).getAttribute('aria-pressed')];
    check('reload: the sets come back in lb, reps-left chips pressed', JSON.stringify(back) === '["135","135","true"]', back);
    await page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'kg' }).click();
    const kg = await g2.getByLabel('Set 1 weight in kg', { exact: true }).inputValue();
    check('the kg switch converts what is shown', kg === '61.24', kg);
    await g2.scrollIntoViewIfNeeded();
    await shot(page, 'phone-6-reloaded-kg', false);

    // 9. Done
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByText('Program complete').waitFor({ timeout: 15_000 });
    const fin = await store(page);
    check('Done: the session is stamped and Today says the program is complete', fin.clientSessions.find((c: Row) => c.id === 'cs-day2')?.completedAt !== null, null);
    await shot(page, 'phone-7-done', false);
    const serious = errors.filter((e) => !/Failed to load resource: the server responded with a status of 400/.test(e) && !/youtube|googlevideo|ERR_NAME_NOT_RESOLVED|fel\.local|ERR_INTERNET|ERR_CONNECTION/i.test(e));
    step('phone: console errors', { all: errors, serious });
    check('phone: no console errors beyond the deliberate 400 and the offline demo hosts', serious.length === 0, serious);
  } finally { await browser.close(); }
}

/** /training's step-through (ClientSessionView) over the same store: the coach's cues instead of three hard-coded lines, per-set logging. */
async function training() {
  const { browser, page, errors } = await launch(390);
  let todayFetches = 0;
  page.on('request', (r) => { if (r.url().includes('/dev/coach-today/api?op=today')) todayFetches++; });
  try {
    await page.goto(`${BASE}/dev/coach-today?reset=1&view=training`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByText('Ready to Train?').waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2000);
    // React's development double-mount runs the load effect twice; a refetch loop would be dozens
    check('training: the view loads once or twice and then stops (no refetch loop)', todayFetches >= 1 && todayFetches <= 2, { todayFetches });
    await page.getByRole('button', { name: 'Start Workout' }).click();
    const t = page.getByTestId('training');
    const first = await t.textContent();
    check('training: exercise 1 is the Prep item, with the coach\'s cues (not the hard-coded three) and no weight box',
      /Exercise 1 of 7 · Prep/.test(first ?? '') && first!.includes('Both knees stay on the floor') && !first!.includes('Hit the prescribed tempo') && (await t.getByLabel('Set 1 weight in kg', { exact: true }).count()) === 0, null);
    await shot(page, 'training-1-prep', true);
    await page.getByRole('button', { name: /Next/ }).click();
    await page.getByRole('button', { name: /Next/ }).click();
    const g = await t.textContent();
    check('training: the key set names itself and carries set-up, cues, faults and the easier version',
      /Exercise 3 of 7 · Key/.test(g ?? '') && g!.includes('KEY SET') && g!.includes('Heel, big toe, little toe') && g!.includes('Elbows inside the knees') && g!.includes('Knees drift in on the way up') && g!.includes('Easier version: Box squat.'), null);
    await t.getByLabel('Set 1 reps', { exact: true }).fill('5');
    await t.getByLabel('Set 1 weight in kg', { exact: true }).fill('60');
    await t.getByRole('button', { name: 'Set 1 reps left 2' }).click();
    await t.getByLabel('Set 1 effort', { exact: true }).selectOption('8');
    await shot(page, 'training-2-key-set', true);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Next/ }).click();
    await page.getByRole('button', { name: 'Complete Session' }).click();
    await page.getByText('Program Complete').waitFor({ timeout: 15_000 });
    const st = await store(page);
    const gLog = st.logs.find((l: Row) => l.actualReps === '5');
    const gSets = gLog ? st.setLogs.filter((x: Row) => x.exerciseLogId === gLog.id) : [];
    const old = st.logs.find((l: Row) => l.id === 'log-day2-split');
    check('training: the set is stored per set in kg; the untouched old row keeps its numbers; the session is done',
      gSets.length === 1 && gSets[0].weightKg === 60 && gSets[0].rir === 2 && gSets[0].effort === 8 && gLog.actualLoad === '60 kg' && old?.actualLoad === '24kg' && !!st.clientSessions.find((c: Row) => c.id === 'cs-day2')?.completedAt,
      { gLog: gLog && { actualSets: gLog.actualSets, actualReps: gLog.actualReps, actualLoad: gLog.actualLoad, rpe: gLog.rpe }, gSets, old: old && old.actualLoad });
    await shot(page, 'training-3-complete', true);
    step('training: console errors', { errors });
    check('training: no console errors', errors.length === 0, errors);
  } finally { await browser.close(); }
}

async function desktop() {
  const { browser, page, errors } = await launch(900);
  try {
    await page.goto(`${BASE}/dev/coach-today?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByTestId('today').waitFor({ timeout: 120_000 });
    await page.waitForTimeout(600);
    await shot(page, 'desktop-today', true);
    step('desktop: console errors', { errors });
  } finally { await browser.close(); }
}

await phone();
await training();
await desktop();
const checks = out.checks as { pass: boolean }[];
out.summary = `${checks.filter((c) => c.pass).length}/${checks.length}`;
writeFileSync(join(OUT, 'coach-today-p2.json'), JSON.stringify(out, null, 2));
console.log('SUMMARY', out.summary);
