// Check-ins, habits and "paste a program" on the rig (COACH-PARITY, 2026-10-26): every scene of
// scripts/probes/_coach-parity-entry.tsx in headless Chromium at a phone width (390). No server: the payloads are the real
// server functions' answers, computed here in Node over the in-memory tables (tests/helpers/fakeParityDb.ts), the real
// library index and the Today harness. The import scene's confirmed body (what the browser POSTs) is then run through
// the REAL builder action over the in-memory builder store, so the grid's output is proven to write.
//
//   NODE_PATH=<dir holding a stub server-only package> CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     npx tsx scripts/probes/_coach-parity-probe.mts <outDir>
//
// Checked per scene: no sideways scroll, no page error, the elements the scene promises. Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const load = async <T,>(p: string): Promise<T> => { const m = await import(p) as Record<string, unknown>; return { ...(m.default as object), ...m } as T; };
const C = await load<typeof import('../../lib/coach/checkins/server.ts')>('../../lib/coach/checkins/server.ts');
const Hb = await load<typeof import('../../lib/coach/habits/server.ts')>('../../lib/coach/habits/server.ts');
const R = await load<typeof import('../../lib/coach/checkins/rules.ts')>('../../lib/coach/checkins/rules.ts');
const HR = await load<typeof import('../../lib/coach/habits/rules.ts')>('../../lib/coach/habits/rules.ts');
const F = await load<typeof import('../../tests/helpers/fakeParityDb.ts')>('../../tests/helpers/fakeParityDb.ts');
const P = await load<typeof import('../../lib/coach/import/preview.ts')>('../../lib/coach/import/preview.ts');
const L = await load<typeof import('../../lib/library/files.ts')>('../../lib/library/files.ts');
const E = await load<typeof import('../../lib/library/search/engine.ts')>('../../lib/library/search/engine.ts');
const B = await load<typeof import('../../lib/coach/builderServer.ts')>('../../lib/coach/builderServer.ts');
const BM = await load<typeof import('../../lib/coach/builderMemoryDb.ts')>('../../lib/coach/builderMemoryDb.ts');
const T = await load<typeof import('../../lib/coach/todayServer.ts')>('../../lib/coach/todayServer.ts');
const TM = await load<typeof import('../../lib/coach/todayMemoryDb.ts')>('../../lib/coach/todayMemoryDb.ts');

const ON = { COACH_PARITY_HEALTH_ENABLED: 'true' };
const now = new Date();
const DAY = 86_400_000;
const ago = (d: number) => new Date(now.getTime() - d * DAY);

// ── the coach's world ────────────────────────────────────────────────────────────────────────────────────────────────
const db = F.fakeParityDb({ now: now.toISOString() });
F.seedPerson(db, 'maya', 'adult', 'Maya Okafor'); F.seedPerson(db, 'jordan', 'adult', 'Jordan Reyes'); F.seedPerson(db, 'riley', 'teen', 'Riley Chen');
F.coach(db, 'c1', 'maya', 'jordan', 'riley');
db.users.find((u) => u.id === 'c1')!.name = 'Coach Dee';
db.groups.push({ id: 't1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'maya', role: 'member' }, { userId: 'jordan', role: 'member' }, { userId: 'riley', role: 'member' }] });
F.grant(db, 'maya', 'health_data'); F.grant(db, 'maya', 'coach_view', 'c1');
const anyDb = db as never;

db.clock = ago(40).getTime();
const weekly = String((await C.coachAct(anyDb, 'c1', { action: 'create', title: 'Weekly check-in', cadence: 'weekly', painCheck: true, questions: [
  { kind: 'scale', prompt: 'How hard did training feel?' },
  { kind: 'yesno', prompt: 'Did you do every session?' },
  { kind: 'number', prompt: 'Free throws made (of 100)', unit: 'shots' },
  { kind: 'choice', prompt: 'Best session', choices: ['Mon', 'Wed', 'Fri'] },
  { kind: 'text', prompt: 'Anything I should know?' },
  { kind: 'number', prompt: 'Hours slept on average', unit: 'h' },
] }, ago(40), ON)).body.id);
await C.coachAct(anyDb, 'c1', { action: 'create', title: 'Pre-season goals', cadence: 'once', questions: [{ kind: 'text', prompt: 'Your one goal this season?' }, { kind: 'choice', prompt: 'Position', choices: ['Guard', 'Wing', 'Big'] }] }, ago(40), ON);
await C.coachAct(anyDb, 'c1', { action: 'assign', formId: weekly, scope: 'team', scopeId: 't1' }, ago(40));
const qid = (i: number) => db.forms.find((f) => f.id === weekly)!.questions[i].id as string;
for (const [w, eff, ft, sl] of [[4, 6, 62, 6.5], [3, 7, 66, 7], [2, 8, 71, 7.5], [1, 7, 74, 7]] as const) {
  db.clock = ago(w * 7).getTime();
  await C.submit(anyDb, 'maya', { formId: weekly, answers: { [qid(0)]: eff, [qid(1)]: w !== 3, [qid(2)]: ft, [qid(3)]: 'Wed', [qid(4)]: w === 1 ? 'Left ankle felt tight Friday' : '' }, health: { [qid(5)]: sl } }, ago(w * 7), ON);
  await C.submit(anyDb, 'jordan', { formId: weekly, answers: { [qid(0)]: eff + 1, [qid(1)]: true, [qid(2)]: ft - 10 } }, ago(w * 7), ON);
}
db.clock = now.getTime();
const checkinsBoard = (await C.coachBoard(anyDb, 'c1', {}, now, ON)).body;
const checkinsDetail = (await C.coachBoard(anyDb, 'c1', { formId: weekly }, now, ON)).body;

db.clock = ago(21).getTime();
for (const b of [
  { preset: 'steps', scope: 'team', scopeId: 't1' },
  { preset: 'water', scope: 'athlete', scopeId: 'maya' },
  { preset: 'practice', scope: 'team', scopeId: 't1', frequency: 'weekly', perWeek: 3, label: 'Shooting practice', target: 30 },
  { preset: 'sleep', scope: 'athlete', scopeId: 'maya' },
]) await Hb.coachHabitAct(anyDb, 'c1', { action: 'create', ...b }, ago(21), ON);
const hid = (p: string) => db.habits.find((h) => h.preset === p)!.id as string;
for (let d = 12; d >= 1; d -= 1) {
  if (d !== 9) await Hb.tickHabit(anyDb, 'maya', { habitId: hid('steps'), done: true, value: 10_500 + d * 100 }, ago(d), ON);
  if (d % 3 !== 0) await Hb.tickHabit(anyDb, 'jordan', { habitId: hid('steps'), done: true, value: d % 2 ? 11_000 : 7_500 }, ago(d), ON);
  await Hb.tickHabit(anyDb, 'maya', { habitId: hid('water'), done: true, value: 2.2 }, ago(d), ON);
  if (d % 2) await Hb.tickHabit(anyDb, 'maya', { habitId: hid('practice'), done: true, value: 35 }, ago(d), ON);
  await Hb.tickHabit(anyDb, 'maya', { habitId: hid('sleep'), done: true, value: d % 4 ? 8 : 6.5 }, ago(d), ON);
}
db.clock = now.getTime();
const habitsBoard = (await Hb.coachHabitBoard(anyDb, 'c1', now, ON)).body;
const mayaHabits = (await Hb.myHabits(anyDb, 'maya', now, ON)).body;
const mayaForms = (await C.myForms(anyDb, 'maya', now, ON)).body as { forms: Record<string, unknown>[] };

// the teen AFTER the coach-training wording is live (today every teen fails closed): the same payload, cut by the real
// rules for band 'teen' (questionsFor, offersPainCheck, habitReaches)
const teenForms = { available: true, band: 'teen', forms: mayaForms.forms.map((f) => {
  const form = db.forms.find((x) => x.id === f.id)!;
  const qs = R.questionsFor(form.questions, { band: 'teen', healthShown: false, healthConsent: false });
  return { ...f, questions: qs.training, health: null, painCheck: R.offersPainCheck(form, { band: 'teen' }), answers: {}, healthAnswers: {}, due: true, lines: { seen: (f.lines as { seen: string }).seen, skipped: form.questions.length > qs.training.length ? 'Some of your coach’s questions are for adults only, so they are not shown here.' : null } };
}) };
const teenHabits = { ...(mayaHabits as object), habits: ((mayaHabits as { habits: { topic: string; preset: string; label: string }[] }).habits).filter((h) => HR.habitReaches(h as never, { adult: false, healthShown: false })) };

// ── the importer ─────────────────────────────────────────────────────────────────────────────────────────────────────
const index = E.buildIndex(L.loadLibraryFiles());
const PASTE = readFileSync(resolve(import.meta.dirname, '../../tests/coach-parity/samples/typed-week.txt'), 'utf8');
const catalogue = [{ id: 'pe-own', name: 'Back Squat' }];
const preview = await P.previewImport({ text: PASTE }, { index, catalogue, youth: false }, null);
if (!preview.ok) throw new Error('preview failed');
const store = BM.newBuilderStore();
store.fac = [{ userId: 'c1', certificationStatus: 'certified' }];
store.user = [{ id: 'maya', dobYear: 1992 }];
store.pe = [{ id: 'pe-own', coachId: 'c1', name: 'Back Squat', category: 'lower-body', primaryCues: [], progressionOfId: null, regressionOfId: null }];
const PID = BM.createProgram(store, { coachId: 'c1', clientId: 'maya', name: 'Off-season block', durationWeeks: 4, blocks: { create: Array.from({ length: 4 }, (_, b) => ({ order: b + 1, label: `Week ${b + 1}`, sessions: { create: [{ order: 1, label: 'Session 1' }] } })) } }).id;

// what "Add to …" answers in the browser: the same preview's default picks written into a copy of the store
const copy = JSON.parse(JSON.stringify(store)) as typeof store;
const pv = preview.preview;
const defaultGrid = pv.parsed.weeks.map((w, wi) => ({ label: w.label, days: w.days.map((d, di) => ({ label: d.label, items: d.items.map((it, ii) => {
  const m = pv.matches[wi][di][ii];
  return { pick: m.kind === 'none' ? { kind: 'new', name: it.name } : { kind: m.kind, id: m.id }, sets: it.sets, reps: it.reps, load: it.load, restSeconds: it.restSeconds, workSeconds: it.workSeconds, tempo: it.tempo, superset: it.superset, section: it.section ?? (ii === 0 ? 'key' : 'assist'), isKeySet: ii === 0 && !it.section, note: it.note };
}) })) }));
const pre = await B.builderAction(BM.builderMemoryDb(copy) as never, 'c1', PID, { action: 'import_program', weeks: defaultGrid, repeat: 4 }, { index: async () => index });
const PREVIEW_TREE = pre.ok ? pre.tree : null;

// ── Today ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ts = TM.newTodayStore();
ts.user.push({ id: 'c1', name: 'Coach Dee', email: 'dee@x.test' }, { id: 'maya', name: 'Maya', email: 'maya@x.test', dobYear: 1992 });
ts.pe.push(TM.catalogueRow({ id: 'pe-squat', coachId: 'c1', name: 'Back Squat', pattern: 'squat', primaryCues: ['Brace, then sit between the heels'] }), TM.catalogueRow({ id: 'pe-row', coachId: 'c1', name: 'Chest-supported Row' }));
TM.seedProgram(ts, { coachId: 'c1', clientId: 'maya', name: 'Off-season strength', blockLabel: 'Week 3', sessions: [{ order: 1, label: 'Lower A', exercises: [
  { exerciseId: 'pe-squat', section: 'key', isKeySet: true, sets: 4, reps: '5', load: '100 kg' }, { exerciseId: 'pe-row', section: 'assist', sets: 3, reps: '10', load: 'RPE 7' },
] }] });
const TODAY = await T.loadToday(TM.todayMemoryDb(ts) as never, 'maya', now);

const DATA = {
  'coach-checkins': { '/api/coach/checkins': checkinsBoard },
  'coach-answers': { '/api/coach/checkins': checkinsBoard, [`/api/coach/checkins?formId=${encodeURIComponent(weekly)}`]: checkinsDetail },
  'coach-habits': { '/api/coach/habits': habitsBoard },
  'coach-import': { 'POST /api/coach/import': { ...preview.preview, youth: false } },
  'coach-soon': { '/api/coach/checkins': { available: false }, '/api/coach/habits': { available: false } },
  'client-today': { '/api/coach/me/habits': mayaHabits, '/api/coach/me/checkins': mayaForms },
  'client-teen': { '/api/coach/me/habits': teenHabits, '/api/coach/me/checkins': teenForms },
};

// ── the rig ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.parity-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;
const js = join(OUT, 'parity.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-parity-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  external: ['@mediapipe/tasks-vision'],
});
const css = join(OUT, 'parity.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="parity.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, Record<string, unknown>> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const scrollWidth = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;
const count = (page: Page, sel: string) => page.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`) as Promise<number>;

async function open(scene: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const today = scene === 'client-today' ? TODAY : null;
  const tree = scene === 'coach-import' ? PREVIEW_TREE : null;
  await page.addInitScript(`window.__DATA__ = ${JSON.stringify(DATA)}; window.__TODAY__ = ${JSON.stringify(today)}; window.__TREE__ = ${JSON.stringify(tree)};`);
  await page.goto(`file://${html}#${scene}`);
  return { page, errors };
}
const done = async (scene: string, page: Page, errors: string[], extra: Record<string, unknown> = {}) => {
  report[scene] = { ...extra, scrollWidth: await scrollWidth(page), errors };
  await page.close();
};

// 1. the coach builds a check-in
{
  const { page, errors } = await open('coach-checkins');
  await page.waitForSelector('[data-checkins-panel]');
  await page.screenshot({ path: join(OUT, 'coach-1-checkins-390.png'), fullPage: true });
  await page.click('[data-checkin-new]');
  await page.click('text=Add a question');
  await page.selectOption('[data-checkin-question="1"] select', 'yesno');
  await page.fill('[data-checkin-question="1"] input[aria-label="Question 2"]', 'Did you do every session?');
  await page.check('[data-checkin-pain]');
  await page.screenshot({ path: join(OUT, 'coach-2-checkin-builder-390.png'), fullPage: true });
  await page.click('[data-checkin-save]');
  await page.waitForTimeout(150);
  const sent = await page.evaluate('window.__SENT__.map((s) => JSON.parse(s.body))') as Record<string, unknown>[];
  const forms = await count(page, '[data-checkin-form]');
  check(forms === 2, 'checkins: two forms listed');
  check(sent[0]?.action === 'create' && (sent[0]?.questions as unknown[]).length === 2 && sent[0]?.painCheck === true, 'checkins: create sent with 2 questions + pain check');
  await done('coach-checkins', page, errors, { forms, sent });
}
// 2. answers over time
{
  const { page, errors } = await open('coach-answers');
  await page.waitForSelector('[data-checkin-open]');
  await page.click(`[data-checkin-form="${weekly}"] [data-checkin-open]`);
  await page.waitForSelector('[data-checkin-detail]');
  await page.waitForTimeout(100);
  const r = { athletes: await count(page, '[data-checkin-athlete]'), rows: await count(page, '[data-checkin-athlete="maya"] tbody tr'), sparks: await count(page, '[data-checkin-athlete="maya"] svg'), mayaHealthCol: await page.evaluate(`document.querySelector('[data-checkin-athlete="maya"] thead')?.textContent?.includes('Hours slept')`), jordanHealthCol: await page.evaluate(`document.querySelector('[data-checkin-athlete="jordan"] thead')?.textContent?.includes('Hours slept') ?? false`) };
  await page.screenshot({ path: join(OUT, 'coach-3-checkin-answers-390.png'), fullPage: true });
  check(r.rows === 4, 'answers: four weeks for Maya');
  check(r.sparks >= 2, 'answers: spark lines');
  check(r.mayaHealthCol === true && r.jordanHealthCol === false, 'answers: health column only for the athlete who shares');
  await done('coach-answers', page, errors, r);
}
// 3. habits
{
  const { page, errors } = await open('coach-habits');
  await page.waitForSelector('[data-habits-panel]');
  const r = { habits: await count(page, '[data-habit]'), streaks: await count(page, '[data-habit-athlete] .text-\\[\\#FFB020\\]') };
  await page.screenshot({ path: join(OUT, 'coach-4-habits-390.png'), fullPage: true });
  await page.click('[data-habit-new]');
  await page.waitForSelector('[data-habit-form]');
  await page.screenshot({ path: join(OUT, 'coach-5-habit-form-390.png'), fullPage: true });
  check(r.habits === 4, 'habits: four listed');
  await done('coach-habits', page, errors, r);
}
// 4. paste a program
let importBody: Record<string, unknown> | null = null;
{
  const { page, errors } = await open('coach-import');
  await page.click('[data-import-open]');
  await page.fill('[data-import-text]', PASTE);
  await page.screenshot({ path: join(OUT, 'coach-6-import-paste-390.png'), fullPage: true });
  await page.click('[data-import-read]');
  await page.waitForSelector('[data-import-review]');
  const r = { summary: await page.textContent('[data-import-summary]'), rows: await count(page, '[data-import-row]'), flagged: await count(page, '[data-import-flag]') };
  await page.screenshot({ path: join(OUT, 'coach-7-import-review-390.png'), fullPage: true });
  await page.click('[data-import-confirm]');
  await page.waitForTimeout(150);
  importBody = JSON.parse((await page.evaluate('window.__SENT__.filter((s) => s.url.endsWith("/exercises"))[0]?.body')) as string ?? 'null');
  check(r.rows === 13, `import: 13 lines in the grid (${r.rows})`);
  check(importBody?.action === 'import_program', 'import: the confirm posts import_program');
  await done('coach-import', page, errors, r);
}
// 5. coming soon
{
  const { page, errors } = await open('coach-soon');
  await page.waitForSelector('[data-checkins-soon]');
  await page.waitForSelector('[data-habits-soon]');
  await page.screenshot({ path: join(OUT, 'coach-8-coming-soon-390.png'), fullPage: true });
  await done('coach-soon', page, errors);
}
// 6. the athlete's Today
{
  const { page, errors } = await open('client-today');
  await page.waitForSelector('[data-habits-today]');
  await page.waitForSelector('[data-checkins-today]');
  await page.waitForSelector('[data-testid="today"]');
  await page.screenshot({ path: join(OUT, 'client-1-today-390.png'), fullPage: true });
  const shown = { habits: await count(page, '[data-habit-today]'), health: await count(page, '[data-checkin-health]'), pain: await count(page, '[data-checkin-pain]') };
  await page.click(`[data-checkin-card="${weekly}"] [data-checkin-field="${qid(0)}"] button[aria-label="7"]`);
  await page.click(`[data-checkin-card="${weekly}"] [data-checkin-field="${qid(1)}"] button:has-text("Yes")`);
  await page.screenshot({ path: join(OUT, 'client-2-checkin-answering-390.png'), fullPage: true });
  await page.click(`[data-checkin-card="${weekly}"] [data-checkin-send]`);
  await page.waitForTimeout(150);
  const sent = await page.evaluate('window.__SENT__.filter((s) => s.url === "/api/coach/me/checkins").map((s) => JSON.parse(s.body))') as Record<string, unknown>[];
  const r = { ...shown, sent };
  check(r.habits === 4, 'today: four habits');
  check(r.health === 1 && r.pain === 1, 'today: the health section and the pain check for an adult');
  check((sent[0]?.answers as Record<string, unknown>)?.[qid(0)] === 7, 'today: answers sent');
  await done('client-today', page, errors, r);
}
// 7. a teen
{
  const { page, errors } = await open('client-teen');
  await page.waitForSelector('[data-checkins-today]');
  await page.screenshot({ path: join(OUT, 'client-3-teen-390.png'), fullPage: true });
  const r = { fields: await count(page, '[data-checkin-field]'), text: await count(page, '[data-checkins-today] textarea'), health: await count(page, '[data-checkin-health]'), pain: await count(page, '[data-checkin-pain]'), skipped: await count(page, '[data-checkin-skipped]'), habits: await count(page, '[data-habit-today]') };
  check(r.text === 0 && r.health === 0 && r.pain === 0, 'teen: no free text, no health, no pain check');
  check(r.skipped >= 1, 'teen: told some questions are adults only');
  check(r.habits === 3, 'teen: the health habit is not there');
  await done('client-teen', page, errors, r);
}
await browser.close();

// the browser's confirmed grid, through the REAL builder action
if (importBody) {
  const r = await B.builderAction(BM.builderMemoryDb(store) as never, 'c1', PID, importBody, { index: async () => index });
  report.importWrite = r.ok ? { ok: true, weeks: r.tree.blocks.length, sessions: r.tree.blocks[0].sessions.map((s) => s.label), exercises: r.tree.blocks.reduce((n, b) => n + b.sessions.reduce((m, s) => m + s.exercises.length, 0), 0), firstDay: r.tree.blocks[0].sessions[0].exercises.map((e) => `${e.name} ${e.sets}x${e.reps}${e.load ? ` @ ${e.load}` : ''}`) } : { ok: false, error: (r as { error: string }).error };
  check(r.ok, `import write: ${JSON.stringify(report.importWrite)}`);
}

for (const [k, v] of Object.entries(report)) {
  if (!('scrollWidth' in v)) continue;
  check((v.scrollWidth as number) <= WIDTH, `${k}: no sideways scroll (${v.scrollWidth})`);
  check((v.errors as string[]).length === 0, `${k}: no page error (${(v.errors as string[]).join(' | ')})`);
}
console.log(JSON.stringify({ out: OUT, ok: fails.length === 0, fails, report }, null, 1));
process.exit(fails.length ? 1 : 0);
