// FN-BOX-1b (2026-10-19): the age step's full birth date. The year still decides the block, first; a date sent with an
// allowed year must be a real, past date in that year, and is stored as User.dob (lib/age/userDob.ts, mocked here).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: null as any,
  db: null as any,
  session: null as any,
  cookie: null as string | null,
  dobWrites: [] as [string, string][],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));
vi.mock('@/lib/age/userDob', () => ({
  writeUserDob: async (_db: unknown, id: string, dob: string) => { h.dobWrites.push([id, dob]); return true; },
}));

import { POST as signup } from '@/app/api/signup/route';
import { POST as birthYear } from '@/app/api/account/birth-year/route';
import { argsOf, newSpyDb, seedUser, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';
import { birthDateFor, postedBirthDate, AGE_DATE_INVALID, AGE_QUESTION } from './ageScreen';

const THIS_YEAR = new Date().getFullYear();

async function postSignup(extra: Record<string, unknown>) {
  const req = new Request('http://fel.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email: 'new@fel.test', password: 'secret1', name: 'A', ...extra }),
  });
  const res = await signup(req);
  return { status: res.status, json: await res.json(), cookie: res.headers.get('set-cookie') };
}
async function postYear(payload: Record<string, unknown>) {
  const req = new Request('http://fel.test/api/account/birth-year', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const res = await birthYear(req);
  return { status: res.status, json: await res.json(), cookie: res.headers.get('set-cookie') };
}

beforeEach(() => {
  h.db = newSpyDb();
  seedUser(h.db, 'acct-1', null);
  h.prisma = spyPrisma(h.db);
  h.session = { user: { id: 'acct-1' } };
  h.cookie = null;
  h.dobWrites = [];
});

describe('birthDateFor / postedBirthDate', () => {
  const NOW = new Date(2026, 9, 19, 12);
  it('a real, past date in the year → YYYY-MM-DD; anything else → null', () => {
    expect(birthDateFor(2008, 3, 14, NOW)).toBe('2008-03-14');
    expect(birthDateFor(2008, 2, 29, NOW)).toBe('2008-02-29');
    expect(birthDateFor(2007, 2, 29, NOW)).toBeNull();
    expect(birthDateFor(2008, 13, 1, NOW)).toBeNull();
    expect(birthDateFor(2008, 0, 1, NOW)).toBeNull();
    expect(birthDateFor(2008, NaN, 1, NOW)).toBeNull();
    expect(birthDateFor(2026, 10, 20, NOW)).toBeNull();     // tomorrow
    expect(birthDateFor(2026, 10, 19, NOW)).toBe('2026-10-19');
    expect(postedBirthDate(2008, '2008-03-14', NOW)).toBe('2008-03-14');
    expect(postedBirthDate(2009, '2008-03-14', NOW)).toBeNull();   // a different year from the one posted
    expect(postedBirthDate(2008, '2008-3-14', NOW)).toBeNull();
    expect(postedBirthDate(2008, 20080314, NOW)).toBeNull();
  });
  it('the copy names no cutoff', () => {
    for (const line of [AGE_QUESTION, AGE_DATE_INVALID]) {
      expect(line).not.toMatch(/\d|old enough|kid|child|parent|adult|minor|under|over/i);
    }
  });
});

describe('POST /api/signup with birthDate', () => {
  it('a real date in the posted year → 200, dobYear stored as before, and dob stored for the new user', async () => {
    const r = await postSignup({ birthYear: 1990, birthDate: '1990-06-15' });
    expect(r.status).toBe(200);
    expect(argsOf(h.db, 'user.create')[0].data.dobYear).toBe(1990);
    expect(argsOf(h.db, 'user.create')[0].data).not.toHaveProperty('dob');   // never through the generated client
    expect(h.dobWrites).toEqual([[expect.any(String), '1990-06-15']]);
  });

  it('a mismatched, impossible or future date → 400 and zero writes', async () => {
    for (const birthDate of ['1991-06-15', '1990-02-30', `${THIS_YEAR + 1}-01-01`, 'June 15', '']) {
      h.db = newSpyDb();
      h.prisma = spyPrisma(h.db);
      const r = await postSignup({ birthYear: 1990, birthDate, email: `x${birthDate}@fel.test` });
      expect(r.status, birthDate).toBe(400);
      expect(writesOf(h.db as SpyDb)).toEqual([]);
    }
    expect(h.dobWrites).toEqual([]);
  });

  it('an under-13 year is still blocked first, whatever date comes with it (cookie, no writes, no date stored)', async () => {
    for (const birthDate of [`${THIS_YEAR - 12}-01-01`, 'garbage']) {
      const r = await postSignup({ birthYear: THIS_YEAR - 12, birthDate });
      expect(r.status).toBe(403);
      expect(r.json).toEqual({ error: 'age_screen_blocked' });
      expect(r.cookie).toContain('fel_age_gate=1');
    }
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.dobWrites).toEqual([]);
  });

  it('no birthDate (an older client) → 200 with the year alone, nothing written to dob', async () => {
    const r = await postSignup({ birthYear: 1990 });
    expect(r.status).toBe(200);
    expect(h.dobWrites).toEqual([]);
  });
});

describe('POST /api/account/birth-year with birthDate', () => {
  it('a real date in the year → 200, the year written, then the date', async () => {
    const r = await postYear({ birthYear: THIS_YEAR - 16, birthDate: `${THIS_YEAR - 16}-02-01` });
    expect(r.status).toBe(200);
    expect(h.db.tables.user[0].dobYear).toBe(THIS_YEAR - 16);
    expect(h.dobWrites).toEqual([['acct-1', `${THIS_YEAR - 16}-02-01`]]);
  });

  it('a mismatched or impossible date → 400, the year stays blank, nothing written', async () => {
    for (const birthDate of ['1991-06-15', '1990-02-30', 7]) {
      const r = await postYear({ birthYear: 1990, birthDate });
      expect(r.status).toBe(400);
    }
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBeNull();
    expect(h.dobWrites).toEqual([]);
  });

  it('an under-13 year is locked and blocked as before; the date is ignored and not stored', async () => {
    const r = await postYear({ birthYear: THIS_YEAR - 12, birthDate: 'garbage' });
    expect(r.status).toBe(403);
    expect(r.cookie).toContain('fel_age_gate=1');
    expect(h.db.tables.user[0].dobYear).toBe(THIS_YEAR - 12);
    expect(h.dobWrites).toEqual([]);
  });

  it('a year already on file → 409 and no date written', async () => {
    h.db.tables.user[0].dobYear = 1990;
    const r = await postYear({ birthYear: 1990, birthDate: '1990-06-15' });
    expect(r.status).toBe(409);
    expect(h.dobWrites).toEqual([]);
  });
});
