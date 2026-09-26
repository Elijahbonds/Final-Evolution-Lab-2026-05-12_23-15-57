// MIRROR-COACH P2 (2026-09-25) — LIVE PROOF of the session structure on the lane's dev server (:3131).
//
// /dev/program-builder renders the production ProgramBuilder (components/coach/program-builder.tsx) with its saves
// pointed at the real builder service (lib/coach/builderServer.ts) over an in-memory store — the lane's database is
// offline, and the real routes answer 401 without a session. This drives it the way a coach would, one page,
// headless chromium:
//   1. add seven exercises to Day 1 through the add row, each into its section
//   2. open each one and set its structure in the edit panel: section, superset letter, key set, dose, the timer and
//      hold, an effort band, set-up cues from the pick-list, a note — then Save
//   3. "Reload from server" and compare what a fresh load returns with what was typed, field by field
//   4. the screen: sections in running order, A1/A2 labels, one KEY badge, the timer in the dose line
//   5. refusals: a work time of 0 is refused with its own line; another coach's catalogue row is refused
//   6. move A2 above A1; a lone superset on Day 2 shows its warning
//   7. the production Clients tab (/dev/mirror-shots → CoachView) mounts the builder and saves through it
// Frames at desktop (900) and phone width (390). Console errors are collected.
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_program-builder-p2.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/program-builder-p2';
mkdirSync(OUT, { recursive: true });
const out: Record<string, unknown> = { base: BASE, date: new Date().toISOString(), steps: [] as unknown[], checks: [] as unknown[] };
const step = (name: string, data: Record<string, unknown> = {}) => { (out.steps as unknown[]).push({ name, ...data }); console.log(name, JSON.stringify(data)); };
const check = (name: string, pass: boolean, detail: unknown = null) => { (out.checks as unknown[]).push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, detail === null ? '' : JSON.stringify(detail)); };
async function shot(page: Page, name: string) { await page.waitForTimeout(250); await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }); }

interface Plan { name: string; id: string; section: string; superset?: string; key?: boolean; sets: string; reps?: string; load: string; work?: string; hold?: string; band?: string; cues: string[]; note?: string }
/** What the coach types, in the order they add it (not running order). Cue buttons are found by their text. */
const PLAN: Plan[] = [
  { name: 'Trap-bar deadlift', id: 'pe-tbdl', section: 'key', key: true, sets: '4', reps: '5', load: 'RPE8', band: 'Surge', cues: ['Heel, big toe, little toe: press all three into the floor.', 'Push the wall behind you with your hips.'], note: 'Own the lockout.' },
  { name: 'Split squat', id: 'pe-split', section: 'assist', superset: 'A', sets: '3', reps: '8 each', load: 'RPE7', band: 'Drive', cues: ['Drive the floor down through your front heel.'] },
  { name: 'Half-kneeling row', id: 'pe-row', section: 'assist', superset: 'A', sets: '3', reps: '10 each', load: 'RPE7', hold: '2', cues: ['Drive your elbows toward your back pockets.'] },
  { name: '90/90 hip switch', id: 'pe-flow', section: 'prep', sets: '2', reps: '6 each side', load: 'body', hold: '3', band: 'Idle', cues: [] },
  { name: 'Suitcase carry', id: 'pe-carry', section: 'finish', sets: '3', load: '24kg', work: '30', cues: ['Crush the handle.', 'Grow tall toward the ceiling.'] },
  { name: 'Pogo hops', id: 'pe-pogo', section: 'prime', sets: '2', reps: '10', load: 'body', band: 'Cruise', cues: ['Land quiet: as little sound as you can.'] },
  { name: 'Crocodile breathing', id: 'pe-breath', section: 'cooldown', sets: '1', load: 'body', work: '120', cues: ['Let the air out longer than it came in.'] },
];
const SECTION_LABEL: Record<string, string> = { prep: 'Prep', prime: 'Prime', key: 'Key', assist: 'Assist', finish: 'Finish', cooldown: 'Cool-down' };
const BAND_ID: Record<string, string> = { Idle: 'idle', Cruise: 'cruise', Drive: 'drive', Surge: 'surge', 'Full throttle': 'full' };

async function day1(page: Page): Promise<Locator> { return page.locator('[data-session]').first(); }

async function run(width: number, tag: string, drive: boolean) {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/dev/program-builder${drive ? '?reset=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByTestId('program-builder').getByText('Day 1 — lower').waitFor({ timeout: 120_000 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    step(`${tag}: loaded`, { horizontalOverflowPx: overflow });
    if (!drive) {
      check(`${tag}: no horizontal overflow at ${width}px`, overflow <= 0, { overflow });
      await shot(page, `${tag}-builder`);
      const first = page.getByRole('button', { name: 'Edit Trap-bar deadlift' });
      if (await first.count()) { await first.click(); await page.getByTestId('exercise-editor').waitFor(); await shot(page, `${tag}-editor`); }
      return;
    }
    await shot(page, `${tag}-0-empty`);

    // 1. add every exercise into its section through the add row
    for (const p of PLAN) {
      const d = await day1(page);
      await d.getByLabel('Exercise to add').selectOption(p.id);
      await d.getByLabel('Section to add into').selectOption(p.section);
      await d.getByRole('button', { name: 'Add exercise' }).click();
      await page.getByRole('button', { name: `Edit ${p.name}` }).waitFor({ timeout: 20_000 });
    }
    step(`${tag}: added`, { count: PLAN.length });
    await shot(page, `${tag}-1-added`);

    // 2. set each one's structure in the edit panel
    for (const p of PLAN) {
      await page.getByRole('button', { name: `Edit ${p.name}` }).click();
      const ed = page.getByTestId('exercise-editor');
      await ed.waitFor();
      if (p.superset) await ed.locator('select').nth(1).selectOption(p.superset);
      if (p.key) await ed.getByRole('checkbox').first().check();
      const box = (label: string) => ed.locator('label', { hasText: label }).locator('input').first();
      await box('Sets').fill(p.sets);
      if (p.work) { await ed.locator('label', { hasText: 'Timed' }).locator('input').check(); await box('Work s / set').fill(p.work); }
      else if (p.reps) await box('Reps').fill(p.reps);
      await box('Load').fill(p.load);
      if (p.hold) await box('Hold s').fill(p.hold);
      if (p.band) await ed.getByRole('radio', { name: new RegExp(`^${p.band} `) }).click();
      for (const c of p.cues) await ed.getByRole('button', { name: c }).click();
      if (p.note) await ed.locator('label', { hasText: 'Note to your athlete' }).locator('input').fill(p.note);
      if (p.name === 'Trap-bar deadlift') await shot(page, `${tag}-2-editor-key-set`);
      if (p.name === 'Suitcase carry') await shot(page, `${tag}-2-editor-timed`);
      await ed.getByRole('button', { name: 'Save' }).click();
      await page.getByTestId('exercise-editor').waitFor({ state: 'detached', timeout: 20_000 });
    }
    step(`${tag}: structured`, {});

    // 3. reload from the server and compare, field by field
    await page.getByTestId('reload').click();
    await page.waitForTimeout(800);
    const stored = JSON.parse((await page.getByTestId('stored').textContent()) ?? '{}');
    const ex = stored.program.tree.blocks[0].sessions[0].exercises as Record<string, unknown>[];
    out.storedDay1 = ex;
    for (const p of PLAN) {
      const got = ex.find((e) => e.exerciseId === p.id)!;
      const want: Record<string, unknown> = {
        section: p.section, isKeySet: !!p.key, supersetGroup: p.superset ?? null, sets: Number(p.sets), load: p.load,
        workSeconds: p.work ? Number(p.work) : null, holdSeconds: p.hold ? Number(p.hold) : null,
        effortBand: p.band ? BAND_ID[p.band] : null, coachNote: p.note ?? null, reps: p.work ? `${p.work} s` : p.reps,
      };
      const diff = Object.entries(want).filter(([k, v]) => JSON.stringify(got?.[k]) !== JSON.stringify(v)).map(([k, v]) => ({ field: k, want: v, got: got?.[k] }));
      const cueCount = (got?.setupCues as string[] | undefined)?.length ?? -1;
      check(`${tag}: round trip — ${p.name}`, diff.length === 0 && cueCount === p.cues.length, { diff, cues: got?.setupCues });
    }
    check(`${tag}: stored order is running order`, JSON.stringify(ex.map((e) => e.section)) === JSON.stringify(['prep', 'prime', 'key', 'assist', 'assist', 'finish', 'cooldown']), ex.map((e) => e.section));
    check(`${tag}: no builder warnings on a finished session`, JSON.stringify(stored.warnings) === '{}', stored.warnings);

    // 4. the screen after the reload
    const d = await day1(page);
    const headers = await d.locator('[data-section] > div:first-child').allTextContents();
    check(`${tag}: sections render in running order`, JSON.stringify(headers.map((h) => h.trim())) === JSON.stringify(['Prep', 'Prime', 'Key', 'Assist', 'Finish', 'Cool-down']), headers);
    const rows = await d.locator('[data-section] button[aria-expanded]').allTextContents();
    out.rowsDay1 = rows;
    check(`${tag}: A1/A2 labels on the superset`, rows.some((r) => r.startsWith('A1') && r.includes('Split squat')) && rows.some((r) => r.startsWith('A2') && r.includes('Half-kneeling row')), rows);
    check(`${tag}: exactly one KEY badge, on the deadlift`, rows.filter((r) => r.includes('KEY')).length === 1 && rows.find((r) => r.includes('KEY'))!.includes('Trap-bar deadlift'), rows.filter((r) => r.includes('KEY')));
    check(`${tag}: the carry reads as a timer`, rows.some((r) => r.includes('Suitcase carry') && r.includes('3 × 30 s @ 24kg')), rows.find((r) => r.includes('Suitcase carry')));
    check(`${tag}: band + hold in the dose line`, rows.some((r) => r.includes('Trap-bar deadlift') && r.includes('Surge')) && rows.some((r) => r.includes('90/90') && r.includes('hold 3 s')), rows);
    await shot(page, `${tag}-3-structured`);

    // 5. refusals
    await page.getByRole('button', { name: 'Edit Suitcase carry' }).click();
    const ed = page.getByTestId('exercise-editor');
    await ed.locator('label', { hasText: 'Work s / set' }).locator('input').fill('0');
    await ed.getByRole('button', { name: 'Save' }).click();
    const toast = page.getByText(/Work time is 1–1800 seconds per set/);
    await toast.waitFor({ timeout: 10_000 }).catch(() => {});
    check(`${tag}: a work time of 0 is refused with its own line`, await toast.count() > 0);
    await shot(page, `${tag}-4-refused`);
    await ed.getByRole('button', { name: 'Cancel' }).click();
    const theirs = await page.evaluate(async () => {
      const load = await (await fetch('/dev/program-builder/api?op=load')).json();
      const sid = load.program.tree.blocks[0].sessions[0].id;
      const r = await fetch('/dev/program-builder/api?op=action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', sessionId: sid, exerciseId: 'pe-theirs' }) });
      return { status: r.status, body: await r.json() };
    });
    check(`${tag}: another coach's catalogue row is refused (was accepted before P2)`, theirs.status === 404 && theirs.body.error === 'exercise_not_found', theirs);

    // 6. move A2 above A1; a lone superset on Day 2 warns
    await page.getByRole('button', { name: 'Move Half-kneeling row up' }).click();
    await page.waitForTimeout(600);
    const moved = await (await day1(page)).locator('[data-section="assist"] button[aria-expanded]').allTextContents();
    check(`${tag}: moved within Assist, labels follow the order`, moved[0]?.startsWith('A1') && moved[0].includes('Half-kneeling row') && moved[1]?.includes('Split squat'), moved);
    const d2 = page.locator('[data-session]').nth(1);
    await d2.getByLabel('Exercise to add').selectOption('pe-row');
    await d2.getByLabel('Section to add into').selectOption('assist');
    await d2.getByRole('button', { name: 'Add exercise' }).click();
    await d2.getByRole('button', { name: 'Edit Half-kneeling row' }).click();
    await page.getByTestId('exercise-editor').locator('select').nth(1).selectOption('B');
    await page.getByTestId('exercise-editor').getByRole('button', { name: 'Save' }).click();
    const warn = d2.getByText(/Superset B has one exercise/);
    await warn.waitFor({ timeout: 10_000 }).catch(() => {});
    check(`${tag}: a lone superset shows its warning`, await warn.count() > 0);
    await shot(page, `${tag}-5-warning`);
  } finally {
    out[`${tag}ConsoleErrors`] = errors.filter((e) => !/Download the React DevTools|favicon/.test(e));
    await browser.close();
  }
}

/**
 * 7. THE REAL CLIENTS TAB. /dev/mirror-shots mounts the production CoachView (the same component /coach renders). Its
 * /api/coach/* reads are answered with what the harness's store holds (the program the steps above built), and the
 * builder's saves are forwarded to the harness's action endpoint — so the Clients tab edits the same store through
 * the same service. Proves the builder is mounted where coaches work, not only on a harness page.
 */
async function clientsTab() {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const harness = async (q: string, init?: RequestInit) => (await fetch(`${BASE}/dev/program-builder/api?${q}`, init)).json();
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const method = route.request().method();
    if (u.pathname === '/api/coach/programs' && method === 'GET') {
      const l = await harness('op=load');
      return route.fulfill({ json: { coachCertified: true, programs: [{ tree: l.program.tree, role: 'coach', coachName: 'Dev Coach', clientName: 'Dev Client', clientId: 'dev-client', isActive: true, startDate: l.program.startDate, completedSessionIds: [], next: null, plan: null }] } });
    }
    if (u.pathname === '/api/coach/programs/exercises') return route.fulfill({ json: await harness('op=catalogue') });
    if (/^\/api\/coach\/programs\/[^/]+\/exercises$/.test(u.pathname) && method === 'POST') {
      const r = await fetch(`${BASE}/dev/program-builder/api?op=action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: route.request().postData() ?? '{}' });
      return route.fulfill({ status: r.status, json: await r.json() });
    }
    if (u.pathname === '/api/coach/inbox') return route.fulfill({ json: { items: [], needsReview: 0 } });
    if (u.pathname === '/api/coach/roster') return route.fulfill({ json: { roster: [] } });
    if (u.pathname === '/api/coach/messages') return route.fulfill({ json: { messages: [] } });
    return route.fulfill({ status: 404, json: { error: 'not in the fixture' } });
  });
  try {
    await page.goto(`${BASE}/dev/mirror-shots`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    const tab = page.getByRole('button', { name: 'Clients' });
    await tab.waitFor({ timeout: 300_000 });
    for (let i = 0; i < 60; i++) { await tab.click(); if (await page.getByTestId('program-builder').count()) break; await page.waitForTimeout(1000); }
    const builder = page.getByTestId('program-builder');
    await builder.waitFor({ timeout: 60_000 });
    const rows = await builder.locator('[data-session]').first().locator('[data-section] button[aria-expanded]').allTextContents();
    check('clients tab: the production Clients tab mounts the builder with the stored structure', rows.length === 7 && rows.some((r) => r.includes('KEY') && r.includes('Trap-bar deadlift')), rows);
    await builder.getByRole('button', { name: 'Edit Pogo hops' }).click();
    const ed = page.getByTestId('exercise-editor');
    await ed.getByRole('radio', { name: /^Drive / }).click();
    await ed.getByRole('button', { name: 'Save' }).click();
    await ed.waitFor({ state: 'detached', timeout: 20_000 });
    const stored = await harness('op=load');
    const pogo = stored.program.tree.blocks[0].sessions[0].exercises.find((e: { exerciseId: string }) => e.exerciseId === 'pe-pogo');
    check('clients tab: an edit saved from the Clients tab reaches the store', pogo?.effortBand === 'drive', pogo);
    await page.screenshot({ path: join(OUT, 'clients-tab-builder.png'), fullPage: true });
  } finally {
    out.clientsTabPageErrors = errors;
    await browser.close();
  }
}

await run(900, 'desktop', true);
await run(390, 'phone', false);
await clientsTab();
const fails = (out.checks as { pass: boolean }[]).filter((c) => !c.pass).length;
out.summary = { checks: (out.checks as unknown[]).length, fails };
writeFileSync(join(OUT, 'program-builder-p2.json'), JSON.stringify(out, null, 2));
console.log(`\n${(out.checks as unknown[]).length - fails}/${(out.checks as unknown[]).length} checks pass → ${join(OUT, 'program-builder-p2.json')}`);
process.exit(fails ? 1 : 0);
