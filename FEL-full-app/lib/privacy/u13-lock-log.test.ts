// AGE-SCREEN MUST (3): exactly one console.warn per under-13 lock, keys date/route/reason, no personal detail.
import { execSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logU13Lock } from './u13LockLog';

const h = vi.hoisted(() => ({
  prisma: null as any,
  db: null as any,
  session: null as any,
  cookie: null as string | null,
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: (headers: Headers) => headers.get('x-forwarded-for') ?? 'unknown' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));

import { POST as signup } from '@/app/api/signup/route';
import { POST as birthYear } from '@/app/api/account/birth-year/route';
import { newSpyDb, seedUser, spyPrisma } from '@/tests/helpers/writeSpyDb';

const UID = 'user-lock-9f3c';
const EMAIL = 'locked-person@fel.test';
const THIS_YEAR = new Date().getFullYear();
const IP = '203.0.113.9';
const UA = 'AgeScreenTest/1.0';
// Advanced for intentional schema landings (MIRROR-COACH ServedExercise; ECONOMY-CAPS runId/agentRun;
// ADULT-OPTIN-AB04 ScanSaveOptIn at 9ca276ac; COACH-STORE-V1 Instructor, ProgramAccess, Booking, CallSignal,
// CoachStoreReferral; pinned at the PR #161 lane sync merge dd50d6f1, the first commit carrying both; ADVENTURE-B
// prisma/pending/2026-10-07-adventure-save.sql at 70a65f45; ADVENTURE-SAVE-MODEL (PR #197) AdventureSave model matching
// the applied table, at e8be09a9; COACH-AI Phase 8 prisma/pending/2026-10-07-coach-ai-{1,2}-*.sql (pending SQL only) at
// 377a4c09 — all of them together first at the integration-3 merge of lane/finish-release).
// SCHEMA-SYNC-198 (ProgramMessage.readAt, CoachAvailability matching #198's SQL) at 4eecc830.
// BOOK-SHOP (PR #17) prisma/pending/2026-10-09-book-shop.sql (pending SQL only, owner applies) at 5a5c7121.
// AGE-SCREEN originally pinned the pre-age-screen tip so that PR could not smuggle a schema change; every
// intentional schema PR must bump this to the commit that contains its prisma/ files, or CI stays red.
const PARENT = '5a5c71216cb20e42f5f87ae3e544af95e6be7d62';

/** Resolve a diff base for the schema-ban check when CI's checkout is shallow. */
function resolvePrismaDiffBase(): string {
  const tryCat = (sha: string) => {
    try {
      execSync(`git cat-file -e ${sha}^{commit}`, { stdio: 'ignore' });
      return sha;
    } catch {
      return null;
    }
  };

  if (tryCat(PARENT)) return PARENT;

  try {
    execSync(`git fetch --no-tags --depth=1 origin ${PARENT}`, { stdio: 'ignore' });
  } catch {
    /* ignore failure */
  }
  if (tryCat(PARENT)) return PARENT;

  const finishRelease = 'origin/lane/finish-release';
  try {
    execSync(`git fetch --no-tags --depth=1 origin lane/finish-release`, { stdio: 'ignore' });
  } catch {
    /* ignore failure */
  }

  for (let deepen = 0; deepen < 8; deepen++) {
    try {
      const base = execSync(`git merge-base HEAD ${finishRelease}`, { encoding: 'utf8' }).trim();
      if (base && tryCat(base)) return base;
    } catch {
      /* merge-base not found yet */
    }
    try {
      execSync('git fetch --no-tags --deepen=50 origin lane/age-screen', { stdio: 'ignore' });
      execSync('git fetch --no-tags --deepen=50 origin lane/finish-release', { stdio: 'ignore' });
    } catch {
      /* ignore failure */
    }
  }

  throw new Error(
    'STATIC schema ban: could not resolve a git base for `git diff <base> -- prisma/` '
    + `(tried PARENT ${PARENT}, fetch origin ${PARENT}, and merge-base HEAD origin/lane/finish-release with deepen)`,
  );
}

type Call = { level: string; args: unknown[] };
async function capture(fn: () => Promise<unknown>): Promise<Call[]> {
  const calls: Call[] = [];
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = levels.map((level) => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    calls.push({ level, args });
  }));
  try { await fn(); } finally { spies.forEach((s) => s.mockRestore()); }
  return calls;
}
function signupReq(year: number, email = EMAIL) {
  return new Request('http://fel.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'user-agent': UA },
    body: JSON.stringify({ email, password: 'secret1', name: 'Pat Example', birthYear: year }),
  });
}
function yearReq(year: number) {
  return new Request('http://fel.test/api/account/birth-year', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'user-agent': UA },
    body: JSON.stringify({ birthYear: year }),
  });
}
function assertLine(calls: Call[], route: string, year: number, email = EMAIL) {
  expect(calls).toHaveLength(1);
  expect(calls[0].level).toBe('warn');
  expect(calls[0].args).toHaveLength(1);
  expect(typeof calls[0].args[0]).toBe('string');
  const raw = String(calls[0].args[0]);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  expect(Object.keys(parsed).sort()).toEqual(['date', 'reason', 'route']);
  expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(parsed.route).toBe(route);
  expect(parsed.reason).toBe('coppa_u13_lock');
  const years = raw.match(/\d{4}/g) ?? [];
  expect(years).toEqual([String(parsed.date).slice(0, 4)]);
  expect(raw).not.toContain(UID);
  expect(raw).not.toContain(email);
  expect(raw).not.toContain(EMAIL);
  expect(raw).not.toContain('Pat Example');
  expect(raw).not.toContain(String(year));
  expect(raw).not.toContain(IP);
  expect(raw).not.toContain(UA);
}

describe('MUST (3) one PII-free line per under-13 lock', () => {
  beforeEach(() => {
    h.db = newSpyDb();
    seedUser(h.db, UID, null);
    h.prisma = spyPrisma(h.db);
    h.session = { user: { id: UID, email: EMAIL, name: 'Pat Example' } };
    h.cookie = null;
  });

  it('MUST (3): sign-up thisYear−12 logs exactly one line', async () => {
    const year = THIS_YEAR - 12;
    assertLine(await capture(() => signup(signupReq(year))), '/api/signup', year);
  });

  it('MUST (3): sign-up thisYear−13 logs exactly one line', async () => {
    const year = THIS_YEAR - 13;
    assertLine(await capture(() => signup(signupReq(year, 'other@fel.test'))), '/api/signup', year, 'other@fel.test');
  });

  it('MUST (3): an existing account POSTing thisYear−12 logs exactly one line', async () => {
    const year = THIS_YEAR - 12;
    assertLine(await capture(() => birthYear(yearReq(year))), '/api/account/birth-year', year);
  });

  it('MUST (3): a cookie-present retry, invalid input, a 13+ answer and a 409 log nothing', async () => {
    h.cookie = '1';
    expect(await capture(() => signup(signupReq(THIS_YEAR - 12)))).toEqual([]);
    h.cookie = null;
    expect(await capture(() => signup(signupReq(1899)))).toEqual([]);
    expect(await capture(() => signup(signupReq(THIS_YEAR - 14, 'teen@fel.test')))).toEqual([]);
    h.db.tables.user[0].dobYear = 1990;
    expect(await capture(() => birthYear(yearReq(THIS_YEAR - 12)))).toEqual([]);
  });

  it('logU13Lock takes one argument', () => {
    expect(logU13Lock.length).toBe(1);
  });

  it('STATIC: no legacy lock line, and prisma/ is untouched', () => {
    const coppa = execSync("git grep -n '\\[COPPA-U13-LOCK\\]' -- app components lib || true", { encoding: 'utf8' });
    expect(coppa.trim()).toBe('');
    const base = resolvePrismaDiffBase();
    const schema = execSync(`git diff --name-only ${base} -- prisma/`, { encoding: 'utf8' });
    expect(schema.trim()).toBe('');
  });
});
