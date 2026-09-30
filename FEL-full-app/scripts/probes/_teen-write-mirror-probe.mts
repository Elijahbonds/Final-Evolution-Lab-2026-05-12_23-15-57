// TEEN-WRITE-BLOCK (2026-09-29), item 4d: the save gates on the REAL stack — next dev + real Prisma + a real Postgres —
// and what /play/mirror sends, in a real Chromium with a fake camera.
//
// SAFETY. Runs only against a throwaway database on 127.0.0.1 whose name contains "throwaway" (PROBE_DB), and only against
// a local server (PROBE_BASE, default http://127.0.0.1:3301). It seeds its own accounts straight into that database
// (never /api/signup, which sends a real welcome email) with a random password made for this run and never printed.
//
// THREE PASSES:
//   1. API: signed in as an unknown-age account, a 15-year-old, and an adult who has not opted in, POST every save route
//      the client uses (valid bodies) and count that account's rows before and after, per table.
//   2. Browser, unknown age, no intake on file: /play/mirror → the intake gate → answer → what the POST says and shows.
//   3. Browser, unknown age WITH a pre-change intake and an accepted GuardianConsent (the only way such an account reaches
//      the harness): pick the Movement Screen, Start, End; then the Vertical Jump, Start, End. Every request is logged.
// Report mode (default) writes <out>/probe.json. --expect-zero (R-CLIENT's test) exits 1 on ANY POST/PATCH to
// /api/mirror/* or /api/v1/workout/scan in passes 2–3.
//
// Run from FEL-full-app (Node 26), server already up on PROBE_BASE:
//   PROBE_DB=postgresql://…@127.0.0.1:5432/fel_…_throwaway node node_modules/tsx/dist/cli.mjs \
//     scripts/probes/_teen-write-mirror-probe.mts <outDir> [--expect-zero]
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { chromium, type BrowserContext } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import { PrismaClient } from '../../public/_prisma/client/index.js';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3301';
const DB = process.env.PROBE_DB ?? '';
const OUT = process.argv[2] ?? '/tmp/teen-write-probe';
const EXPECT_ZERO = process.argv.includes('--expect-zero');
if (!/^postgresql:\/\/[^@]*@127\.0\.0\.1:\d+\/\w*throwaway\w*$/.test(DB)) throw new Error('PROBE_DB must be a 127.0.0.1 database whose name contains "throwaway"');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error('PROBE_BASE must be a local server');
mkdirSync(OUT, { recursive: true });

type Json = Record<string, any>;
const out: Json = { base: BASE, date: new Date().toISOString(), expectZero: EXPECT_ZERO, api: {}, browser: {} };
const save = () => writeFileSync(join(OUT, 'probe.json'), `${JSON.stringify(out, null, 2)}\n`);
const log = (...a: unknown[]) => console.log(...a);
const db = new PrismaClient({ datasources: { db: { url: DB } } });
const PASSWORD = randomBytes(18).toString('base64url');
const Y = new Date().getFullYear();
const RUN = Date.now().toString(36);

// ── accounts ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function account(tag: string, dobYear: number | null, o: { intake?: boolean; guardian?: boolean; healthData?: boolean } = {}) {
  const email = `teen-probe-${tag}-${RUN}@fel.test`;
  const user = await db.user.create({ data: { email, password: await bcrypt.hash(PASSWORD, 10), dobYear } });
  if (o.intake) {
    await db.healthIntake.create({ data: { userId: user.id, version: '2026-09-29', answers: {}, redFlags: [], birthYear: null, consentedAt: new Date() } });
  }
  if (o.healthData || o.intake) await db.healthConsent.create({ data: { userId: user.id, scope: 'health_data', grantedAt: new Date() } });
  if (o.guardian) {
    await db.guardianConsent.create({ data: {
      menteeId: user.id, guardianName: 'Probe Parent', guardianEmail: 'parent@fel.test', menteeBirthYear: Y - 16,
      token: `probe-${RUN}-${tag}`, acceptedAt: new Date(),
    } });
  }
  return { id: user.id, email, tag, dobYear };
}
type Acct = Awaited<ReturnType<typeof account>>;

const TABLES = ['workoutScan', 'mirrorSession', 'prqEntry', 'healthIntake', 'painCheckIn', 'readinessCheckIn', 'healthConsent'] as const;
async function rows(userId: string): Promise<Record<string, number>> {
  const counts = await Promise.all(TABLES.map((t) => (db as any)[t].count({ where: { userId } }) as Promise<number>));
  return Object.fromEntries(TABLES.map((t, i) => [t, counts[i]]));
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

// ── pass 1: the API ───────────────────────────────────────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
const SAVES: { name: string; method: 'POST' | 'PATCH'; path: string; body: unknown }[] = [
  { name: '1c dunks', method: 'POST', path: '/api/mirror/dunks', body: { verticalCm: 55, flightTimeMs: 670, family: 'WINDMILL' } },
  { name: '1a screen POST', method: 'POST', path: '/api/mirror/screen', body: { screenId: `probe-${RUN}`, screen: 'modified', checks: [] } },
  { name: '1a screen PATCH', method: 'PATCH', path: '/api/mirror/screen', body: { screenId: `probe-${RUN}`, answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] } },
  { name: '1b sessions', method: 'POST', path: '/api/mirror/sessions', body: { patternId: 'splitStancePress', startedAtMs: Date.now() - 60_000, durationMs: 60_000, reps: 10, avgFrameMs: 33, timeInStableMs: {}, faultCounts: {} } },
  { name: '1e workout/scan', method: 'POST', path: '/api/v1/workout/scan', body: { kind: 'movement_screen', metrics: {} } },
  { name: 'a intake submit', method: 'POST', path: '/api/health/intake', body: { answers: { current_pain: false }, consent: true } },
  { name: 'b pain', method: 'POST', path: '/api/health/pain', body: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'after' } },
  { name: 'c readiness', method: 'POST', path: '/api/health/readiness', body: { date: TODAY, sleep: 3, energy: 4 } },
];

async function apiPass(a: Acct) {
  const cookie = await signIn(a.email);
  const before = await rows(a.id);
  const answers: Json[] = [];
  for (const s of SAVES) {
    const res = await fetch(`${BASE}${s.path}`, { method: s.method, headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(s.body) });
    const body = await res.json().catch(() => null);
    answers.push({ route: s.name, status: res.status, error: body?.error ?? null, saved: body?.saved ?? null });
  }
  const after = await rows(a.id);
  const delta = Object.fromEntries(TABLES.map((t) => [t, after[t] - before[t]]));
  out.api[a.tag] = { dobYear: a.dobYear, answers, rowsWritten: delta };
  log(`api ${a.tag}:`, answers.map((x) => `${x.route}=${x.status}`).join(' · '), '| rows', JSON.stringify(delta));
  save();
}

// ── passes 2–3: the browser ───────────────────────────────────────────────────────────────────────────────────────────
const SAVE_ROUTE = /\/api\/(mirror\/|v1\/workout\/scan)/;
async function browserPass(ctxName: string, a: Acct, drive: (ctx: BrowserContext, reqs: Json[]) => Promise<Json>) {
  const browser = await chromium.launch({
    executablePath: chromiumExe(), headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  const [name, value] = (await signIn(a.email)).split(/=(.*)/s);
  await ctx.addCookies([{ name, value, url: BASE }]);
  const reqs: Json[] = [];
  ctx.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) reqs.push({ method: r.request().method(), path: u.pathname, status: r.status() });
  });
  const before = await rows(a.id);
  let result: Json = {};
  try { result = await drive(ctx, reqs); } catch (e) { result = { error: String((e as Error)?.message ?? e).slice(0, 300) }; }
  const after = await rows(a.id);
  const saves = reqs.filter((r) => (r.method === 'POST' || r.method === 'PATCH') && SAVE_ROUTE.test(r.path));
  out.browser[ctxName] = {
    account: a.tag, ...result, requests: reqs, savePostsAndPatches: saves,
    rowsWritten: Object.fromEntries(TABLES.map((t) => [t, after[t] - before[t]])),
  };
  log(`browser ${ctxName}:`, saves.length, 'save POST/PATCH', JSON.stringify(saves), '| rows', JSON.stringify(out.browser[ctxName].rowsWritten));
  save();
  await browser.close();
  return saves;
}

async function main() {
  const unknown = await account('unknown', null, { healthData: true });
  const teen = await account('fifteen', Y - 15, { healthData: true });
  const adult = await account('adult-not-opted-in', 1990, { healthData: true });
  for (const a of [unknown, teen, adult]) await apiPass(a);

  // pass 2: an unknown-age account with no intake on file meets the intake gate
  const fresh = await account('unknown-fresh', null);
  const pass2 = await browserPass('intake-gate', fresh, async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/play/mirror`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByRole('button', { name: /I agree/ }).click({ timeout: 120_000 });
    for (let i = 0; i < 12; i++) {
      const skip = page.getByRole('button', { name: /^Skip$/ });
      if (!(await skip.isVisible().catch(() => false))) break;
      await skip.click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, 'intake-gate.png') });
    const text = (await page.locator('body').innerText()).slice(0, 1200);
    return { shown: text, harnessReached: /Start session/.test(text) };
  });

  // pass 3: a pre-change account (intake on file, a parent's accepted consent) reaches the harness
  const legacy = await account('unknown-legacy', null, { intake: true, guardian: true });
  const pass3 = await browserPass('harness', legacy, async (ctx, reqs) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/play/mirror`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const steps: Json[] = [];
    for (const pattern of ['Movement Screen', 'Vertical Jump']) {
      await page.getByRole('button', { name: pattern }).first().click({ timeout: 120_000 });
      await page.getByRole('button', { name: 'Start session' }).click({ timeout: 60_000 });
      const live = await page.getByRole('button', { name: 'End session' }).waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(6000);
      if (live) await page.getByRole('button', { name: 'End session' }).click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: join(OUT, `harness-${pattern.replace(/\W+/g, '-').toLowerCase()}.png`) });
      steps.push({ pattern, cameraLive: live, requestsSoFar: reqs.length });
    }
    return { steps, note: 'fake camera = a test pattern, no body: no jump or graded station can be detected, so the jump POST is not triggered here' };
  });

  out.summary = {
    intakeGateSaves: pass2.length, harnessSaves: pass3.length,
    harnessSaveStatuses: pass3.map((r) => `${r.method} ${r.path} ${r.status}`),
  };
  save();
  await db.$disconnect();
  if (EXPECT_ZERO && pass2.length + pass3.length > 0) {
    console.error(`--expect-zero: ${pass2.length + pass3.length} save request(s) from /play/mirror`);
    process.exit(1);
  }
}

main().catch(async (e) => { out.fatal = String(e?.stack ?? e).slice(0, 2000); save(); await db.$disconnect().catch(() => {}); console.error(e); process.exit(2); });
