// R-HEALTH-CLIENT (2026-09-30), item 5f: what /play/mirror SENDS, per user, on the real stack — next dev, real Prisma, a real
// Postgres — in a real Chromium with a fake camera. Every request is logged; the database is counted before and after.
//
// SAFETY. Runs only against a throwaway database on 127.0.0.1 whose name contains "throwaway" (PROBE_DB), and only against a
// local server (PROBE_BASE, default http://127.0.0.1:3331). Accounts are seeded straight into that database (never
// /api/signup, which sends a real welcome email) with a random password made for this run and never printed.
//
// PASSES (a fresh browser context each):
//   unknown            dobYear null, no intake: the document is 200 (not 500), no error boundary, the browser-only intake
//                      (no red flag) → the Mirror mounts → a session (press/row, Movement Screen, Vertical Jump: Start, End)
//   fifteen            the same, born thisYear − 15
//   seventeen-guardian the same, born thisYear − 17 WITH an accepted GuardianConsent (it unlocks nothing)
//   seventeen-redflag  the same user shape, answering a red flag: RED_FLAG_COPY shows and the Mirror does not mount
//   adult-agree        1990, not opted in (nobody can be yet): the consent screen, "I agree", the intake SAVES (GET + POST
//                      2xx, 1 HealthIntake, 1 health_data HealthConsent), then a session that sends nothing to /api/mirror/*
//   adult-decline      1990, not opted in: "No thanks, continue without saving", the browser-only intake, the Mirror, a
//                      session; from the click on, nothing to /api/health/* or /api/mirror/*, and 0 rows
// FORBIDDEN (the non-savers; adult-decline from its click): any request to /api/health/* or /api/mirror/*, any POST to
// /api/v1/workout/scan. adult-agree may send its intake GET/POST and nothing else of these.
// Browser storage: Storage.setItem, indexedDB.open and document.cookie writes are recorded (keys only) and reported.
// Report mode writes <out>/probe.json and screenshots; --expect-zero exits 1 on any forbidden request or a row mismatch.
// A fake camera shows no body, so no jump and no graded station is ever detected: the jump POST and the screen POST are not
// reachable from here (tests/mirror-no-save/mirror-save.test.ts covers them); End's session POST is.
//
// Run from FEL-full-app (Node 26), server already up on PROBE_BASE:
//   PROBE_DB=postgresql://…@127.0.0.1:5432/fel_…_throwaway node node_modules/tsx/dist/cli.mjs \
//     scripts/probes/_r-health-client-probe.mts <outDir> [--expect-zero]
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import { PrismaClient } from '../../public/_prisma/client/index.js';
// lib/health/intake.ts is transpiled to CommonJS under tsx, whose named exports Node's ESM loader can't see statically:
// read it through a dynamic import (the export itself, or the module.exports object behind `default`).
const intakeModule: any = await import('../../lib/health/intake');
const RED_FLAG_COPY: string = intakeModule.RED_FLAG_COPY ?? intakeModule.default?.RED_FLAG_COPY;
if (typeof RED_FLAG_COPY !== 'string' || !RED_FLAG_COPY) throw new Error('could not read RED_FLAG_COPY from lib/health/intake.ts');

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3331';
const DB = process.env.PROBE_DB ?? '';
const OUT = process.argv[2] ?? '/tmp/r-health-client-probe';
const EXPECT_ZERO = process.argv.includes('--expect-zero');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
if (!/^postgresql:\/\/[^@]*@127\.0\.0\.1:\d+\/\w*throwaway\w*$/.test(DB)) throw new Error('PROBE_DB must be a 127.0.0.1 database whose name contains "throwaway"');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error('PROBE_BASE must be a local server');
mkdirSync(OUT, { recursive: true });

type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), expectZero: EXPECT_ZERO, passes: {} };
const save = () => writeFileSync(join(OUT, 'probe.json'), `${JSON.stringify(out, null, 2)}\n`);
const log = (...a: unknown[]) => console.log(...a);
const db = new PrismaClient({ datasources: { db: { url: DB } } });
const PASSWORD = randomBytes(18).toString('base64url');
const Y = new Date().getFullYear();
const RUN = Date.now().toString(36);
const FLAG_PROMPT = /heart or blood-pressure condition/;
const PARENT_ASK = /parent or guardian|Ask a parent/i;
const ERROR_BOUNDARY = /Application error|Unhandled Runtime Error|Internal Server Error|Something went wrong/i;

// ── accounts ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function account(tag: string, dobYear: number | null, o: { guardian?: boolean } = {}) {
  const email = `rhc-probe-${tag}-${RUN}@fel.test`;
  const user = await db.user.create({ data: { email, password: await bcrypt.hash(PASSWORD, 10), dobYear } });
  if (o.guardian) {
    await db.guardianConsent.create({ data: {
      menteeId: user.id, guardianName: 'Probe Parent', guardianEmail: 'parent@fel.test', menteeBirthYear: dobYear ?? Y - 17,
      token: `rhc-probe-${RUN}-${tag}`, acceptedAt: new Date(),
    } });
  }
  return { id: user.id, email, tag, dobYear };
}
type Acct = Awaited<ReturnType<typeof account>>;

const TABLES = ['workoutScan', 'mirrorSession', 'prqEntry', 'healthIntake', 'healthConsent', 'painCheckIn', 'readinessCheckIn'] as const;
async function rows(userId: string): Promise<Record<string, number>> {
  const counts = await Promise.all(TABLES.map((t) => (db as any)[t].count({ where: { userId } }) as Promise<number>));
  const healthData = await db.healthConsent.count({ where: { userId, scope: 'health_data' } });
  return { ...Object.fromEntries(TABLES.map((t, i) => [t, counts[i]])), healthDataConsent: healthData };
}

// ── sign-in: the credentials flow, as the login page does it ──────────────────────────────────────────────────────────
async function signIn(email: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const jar = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.join('; ') },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, json: 'true' }),
  });
  const session = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__session='));
  if (!session) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return session;
}

// ── the browser ───────────────────────────────────────────────────────────────────────────────────────────────────────
interface Req { i: number; method: string; path: string; status: number | 'failed'; type: string }
const isHealth = (r: Req) => r.path.startsWith('/api/health/');
const isMirror = (r: Req) => r.path.startsWith('/api/mirror/');
const isScanPost = (r: Req) => r.path.startsWith('/api/v1/workout/scan') && r.method === 'POST';

/** Every write to browser storage the page makes, keys only (installed before any page script runs). */
const STORAGE_SPY = `(() => {
  const w = window; w.__felStorage = [];
  const rec = (kind, key) => { try { w.__felStorage.push({ kind, key: String(key).slice(0, 80) }); } catch {} };
  try {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { rec(this === w.localStorage ? 'localStorage' : 'sessionStorage', k); return set.call(this, k, v); };
  } catch {}
  try { const open = indexedDB.open.bind(indexedDB); indexedDB.open = (n, v) => { rec('indexedDB', n); return open(n, v); }; } catch {}
  try {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { configurable: true, get() { return d.get.call(document); }, set(v) { rec('cookie', String(v).split('=')[0]); d.set.call(document, v); } });
  } catch {}
})();`;

async function withBrowser<T>(name: string, a: Acct, drive: (page: Page, reqs: Req[], ctx: BrowserContext) => Promise<T>) {
  const browser = await chromium.launch({
    executablePath: chromiumExe(), headless: true,
    // WebGL on (the Mirror's overlay needs it), a fake camera, as the other Mirror probes launch it
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
      '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  await ctx.addInitScript(STORAGE_SPY);
  const [cName, cValue] = (await signIn(a.email)).split(/=(.*)/s);
  await ctx.addCookies([{ name: cName, value: cValue, url: BASE }]);
  const reqs: Req[] = [];
  let n = 0;
  ctx.on('response', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http')) reqs.push({ i: n++, method: r.request().method(), path: u.pathname, status: r.status(), type: r.request().resourceType() });
  });
  ctx.on('requestfailed', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http')) reqs.push({ i: n++, method: r.method(), path: u.pathname, status: 'failed', type: r.resourceType() });
  });
  const before = await rows(a.id);
  const page = await ctx.newPage();
  let result: Json = {};
  try {
    result = await drive(page, reqs, ctx) as Json;
  } catch (e) {
    // a pass that could not get where it meant to go says so, with what the page showed — never a silent "0 requests"
    result = { error: String((e as Error)?.message ?? e).slice(0, 400) };
    await page.screenshot({ path: join(OUT, `${name}-failed.png`) }).catch(() => {});
    result.shownAtFailure = (await page.locator('body').innerText().catch(() => '')).slice(0, 1500);
  }
  const storage = await page.evaluate(() => ({
    writes: (window as any).__felStorage ?? [],
    localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage),
  })).catch(() => null);
  const after = await rows(a.id);
  const user = await db.user.findUnique({ where: { id: a.id }, select: { dobYear: true } });
  await browser.close();
  const summary = new Map<string, number>();
  for (const r of reqs) {
    const key = r.path.startsWith('/_next/') ? `${r.method} /_next/* (${r.type})` : `${r.method} ${r.path} ${r.status}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  return {
    account: a.tag, dobYearSeeded: a.dobYear, dobYearAfter: user?.dobYear ?? null, ...result,
    rowsBefore: before, rowsWritten: Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])),
    storage, requestCount: reqs.length, requestSummary: Object.fromEntries([...summary.entries()].sort()), requests: reqs,
  } as Json;
}

const visible = (page: Page, re: RegExp) => page.getByText(re).first().isVisible().catch(() => false);
const startButton = (page: Page) => page.getByRole('button', { name: 'Start session' });

/** Answer the intake question by question: the red-flag prompt "Yes" (when asked), every other yes/no "No", the year skipped. */
async function answerIntake(page: Page, withFlag: boolean): Promise<'mirror' | 'stopped'> {
  for (let i = 0; i < 14; i++) {
    if (await startButton(page).isVisible().catch(() => false)) return 'mirror';
    if (await visible(page, /^Before you continue$/)) return 'stopped';
    const h2 = (await page.locator('h2').first().innerText().catch(() => '')).trim();
    if (withFlag && FLAG_PROMPT.test(h2)) await page.getByRole('button', { name: 'Yes', exact: true }).click();
    else if (await page.getByPlaceholder('e.g. 1998').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Skip', exact: true }).click();
    else await page.getByRole('button', { name: 'No', exact: true }).click();
    await page.waitForTimeout(250);
  }
  // the last answer can take a moment to land (the adult's POST)
  const got = await Promise.race([
    startButton(page).waitFor({ timeout: 60_000 }).then(() => 'mirror' as const),
    page.getByText(/^Before you continue$/).waitFor({ timeout: 60_000 }).then(() => 'stopped' as const),
  ]);
  return got;
}

/** A Mirror session on each of three patterns: Start, a few seconds live, End. */
async function runSession(page: Page, name: string, reqs: Req[]) {
  const steps: Json[] = [];
  for (const tab of [null, 'Movement Screen', 'Vertical Jump'] as const) {
    if (tab) await page.getByRole('tab', { name: tab }).click({ timeout: 60_000 });
    await startButton(page).click({ timeout: 60_000 });
    const live = await page.getByRole('button', { name: 'End session' }).waitFor({ timeout: 120_000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(5000);
    if (live) await page.getByRole('button', { name: 'End session' }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, `${name}-${(tab ?? 'press-row').replace(/\W+/g, '-').toLowerCase()}.png`) });
    const shown = await page.locator('body').innerText().catch(() => '');
    steps.push({ pattern: tab ?? 'Split-Stance Press / Row (default)', cameraLive: live, requestsSoFar: reqs.length, parentAskSeen: PARENT_ASK.test(shown) });
  }
  return steps;
}

/** Open /play/mirror: the document's status, and what the page says once the gate has settled. */
async function open(page: Page) {
  const res = await page.goto(`${BASE}/play/mirror`, { waitUntil: 'domcontentloaded', timeout: 480_000 });
  // the first authenticated visit compiles the page under next dev: minutes on a cold dist dir
  await page.locator('h2, button:has-text("Start session")').first().waitFor({ timeout: 480_000 });
  const text = await page.locator('body').innerText();
  return { documentStatus: res?.status() ?? null, errorBoundary: ERROR_BOUNDARY.test(text), firstScreen: text.slice(0, 400) };
}

// ── the passes ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function nonSaver(name: string, a: Acct, withFlag: boolean) {
  return withBrowser(name, a, async (page, reqs) => {
    const opened = await open(page);
    const consentShown = await visible(page, /Before we ask anything health-related/);
    const browserOnlyLine = await visible(page, /Your answers stay on this device; nothing is sent or saved\./);
    await page.screenshot({ path: join(OUT, `${name}-intake.png`) });
    const outcome = await answerIntake(page, withFlag);
    await page.screenshot({ path: join(OUT, `${name}-after-intake.png`) });
    const shown = await page.locator('body').innerText();
    const r: Json = {
      ...opened, consentShown, browserOnlyLine, outcome, parentAskSeen: PARENT_ASK.test(shown),
      redFlagCopyShown: shown.includes(RED_FLAG_COPY), mirrorMounted: await startButton(page).isVisible().catch(() => false),
    };
    if (outcome === 'mirror') r.session = await runSession(page, name, reqs);
    return r;
  });
}

async function adult(name: string, a: Acct, choice: 'agree' | 'decline') {
  return withBrowser(name, a, async (page, reqs) => {
    const opened = await open(page);
    await page.getByRole('heading', { name: 'Before we ask anything health-related' }).waitFor({ timeout: 120_000 });
    const agreeBtn = await page.getByRole('button', { name: 'I agree — continue' }).isVisible();
    const declineBtn = await page.getByRole('button', { name: 'No thanks, continue without saving' }).isVisible();
    await page.screenshot({ path: join(OUT, `${name}-consent.png`) });
    const clickedAt = reqs.length;
    await page.getByRole('button', { name: choice === 'agree' ? 'I agree — continue' : 'No thanks, continue without saving' }).click();
    const browserOnlyLine = await visible(page, /Your answers stay on this device; nothing is sent or saved\./);
    const outcome = await answerIntake(page, false);
    await page.screenshot({ path: join(OUT, `${name}-after-intake.png`) });
    const shown = await page.locator('body').innerText();
    const r: Json = {
      ...opened, consentScreen: { agreeBtn, declineBtn }, choice, browserOnlyLine, outcome, parentAskSeen: PARENT_ASK.test(shown),
      mirrorMounted: await startButton(page).isVisible().catch(() => false), requestIndexAtClick: clickedAt,
    };
    const atMirror = reqs.length;
    if (outcome === 'mirror') r.session = await runSession(page, name, reqs);
    r.requestIndexAtMirror = atMirror;
    return r;
  });
}

function verdict(p: Json, rule: 'non-saver' | 'agree' | 'decline'): Json {
  const reqs: Req[] = p.requests ?? [];
  const from = rule === 'decline' ? (p.requestIndexAtClick ?? 0) : 0;
  const scoped = reqs.filter((r) => r.i >= from);
  const health = scoped.filter(isHealth);
  const mirror = scoped.filter(isMirror);
  const scan = scoped.filter(isScanPost);
  const w = p.rowsWritten ?? {};
  const problems: string[] = [];
  if (p.error) problems.push(`pass error: ${p.error}`);
  if (p.documentStatus !== 200) problems.push(`document ${p.documentStatus}`);
  if (p.errorBoundary) problems.push('error boundary shown');
  if (p.parentAskSeen || (p.session ?? []).some((s: Json) => s.parentAskSeen)) problems.push('a parent/guardian ask was shown');
  if (mirror.length) problems.push(`${mirror.length} request(s) to /api/mirror/*`);
  if (scan.length) problems.push(`${scan.length} POST(s) to /api/v1/workout/scan`);
  if (rule === 'agree') {
    const ok = health.filter((r) => r.path === '/api/health/intake' && typeof r.status === 'number' && r.status < 300);
    if (!ok.some((r) => r.method === 'GET') || !ok.some((r) => r.method === 'POST')) problems.push('the adult\'s intake GET/POST did not both answer 2xx');
    if (health.some((r) => r.path !== '/api/health/intake')) problems.push('an unexpected /api/health/* request');
    if (w.healthIntake !== 1 || w.healthDataConsent !== 1) problems.push(`adult rows: HealthIntake ${w.healthIntake}, health_data ${w.healthDataConsent}`);
    for (const t of ['workoutScan', 'mirrorSession', 'prqEntry']) if (w[t]) problems.push(`${w[t]} ${t} row(s)`);
  } else {
    if (health.length) problems.push(`${health.length} request(s) to /api/health/*${rule === 'decline' ? ' after the click' : ''}`);
    for (const t of Object.keys(w)) if (w[t]) problems.push(`${w[t]} ${t} row(s)`);
  }
  if (p.dobYearAfter !== p.dobYearSeeded) problems.push('dobYear changed');
  return {
    healthRequests: health.map((r) => `${r.method} ${r.path} ${r.status}`), mirrorRequests: mirror.map((r) => `${r.method} ${r.path} ${r.status}`),
    workoutScanPosts: scan.length, problems, pass: problems.length === 0,
  };
}

async function main() {
  const plan: [string, () => Promise<Json>, 'non-saver' | 'agree' | 'decline'][] = [
    ['unknown', async () => nonSaver('unknown', await account('unknown', null), false), 'non-saver'],
    ['fifteen', async () => nonSaver('fifteen', await account('fifteen', Y - 15), false), 'non-saver'],
    ['seventeen-guardian', async () => nonSaver('seventeen-guardian', await account('seventeen-guardian', Y - 17, { guardian: true }), false), 'non-saver'],
    ['seventeen-redflag', async () => nonSaver('seventeen-redflag', await account('seventeen-redflag', Y - 17, { guardian: true }), true), 'non-saver'],
    ['adult-agree', async () => adult('adult-agree', await account('adult-agree', 1990), 'agree'), 'agree'],
    ['adult-decline', async () => adult('adult-decline', await account('adult-decline', 1990), 'decline'), 'decline'],
  ];
  for (const [name, run, rule] of plan) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const p = await run();
    p.verdict = verdict(p, rule);
    out.passes[name] = p;
    log(`${name}: ${p.verdict.pass ? 'PASS' : 'FAIL'} outcome=${p.outcome} doc=${p.documentStatus} health=${p.verdict.healthRequests.length} mirror=${p.verdict.mirrorRequests.length} scanPosts=${p.verdict.workoutScanPosts} rows=${JSON.stringify(p.rowsWritten)} storage=${JSON.stringify(p.storage?.writes ?? null)}${p.verdict.problems.length ? ` problems=${JSON.stringify(p.verdict.problems)}` : ''}`);
    save();
  }
  out.summary = Object.fromEntries(Object.entries(out.passes).map(([k, p]: [string, any]) => [k, p.verdict]));
  out.allPass = Object.values(out.summary).every((v: any) => v.pass);
  save();
  await db.$disconnect();
  if (EXPECT_ZERO && !out.allPass) {
    console.error('--expect-zero: a pass failed (see probe.json summary)');
    process.exit(1);
  }
}

main().catch(async (e) => { out.fatal = String(e?.stack ?? e).slice(0, 2000); save(); await db.$disconnect().catch(() => {}); console.error(e); process.exit(2); });
