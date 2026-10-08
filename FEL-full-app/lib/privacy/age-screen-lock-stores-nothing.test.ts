// AGE-SCREEN D5: an under-13 lock stores nothing but the answered year on the account itself. No analytics row, no other write.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: null as any,
  db: null as any,
  session: null as any,
  cookie: null as string | null,
  events: [] as unknown[],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: unknown) => { h.events.push(e); } }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));

import { POST as signup } from '@/app/api/signup/route';
import { POST as birthYear } from '@/app/api/account/birth-year/route';
import { argsOf, callsOn, newSpyDb, seedUser, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'lock-1';
const THIS_YEAR = new Date().getFullYear();
const APP = join(__dirname, '..', '..');

async function postSignup(year: number) {
  const req = new Request('http://fel.test/api/signup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `u${year}@fel.test`, password: 'secret1', name: 'A', birthYear: year }),
  });
  return signup(req);
}
async function postYear(year: number) {
  const req = new Request('http://fel.test/api/account/birth-year', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ birthYear: year }),
  });
  return birthYear(req);
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

describe('an under-13 lock stores nothing', () => {
  beforeEach(() => {
    h.db = newSpyDb();
    seedUser(h.db, UID, null);
    h.prisma = spyPrisma(h.db);
    h.session = { user: { id: UID } };
    h.cookie = null;
    h.events = [];
  });

  it.each([12, 13])('existing account POSTing thisYear−%s → the only write is user.updateMany of that year', async (gap) => {
    const year = THIS_YEAR - gap;
    const res = await postYear(year);
    expect(res.status).toBe(403);
    expect(writesOf(h.db as SpyDb)).toEqual(['user.updateMany']);
    expect(argsOf(h.db, 'user.updateMany')[0]).toEqual({ where: { id: UID, dobYear: null }, data: { dobYear: year } });
    expect(callsOn(h.db, 'analyticsEvent')).toEqual([]);
    expect(h.events).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBe(year);
  });

  it.each([12, 13])('new sign-up thisYear−%s → zero writes', async (gap) => {
    const res = await postSignup(THIS_YEAR - gap);
    expect(res.status).toBe(403);
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(callsOn(h.db, 'analyticsEvent')).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('a repeat POST after a lock → zero further writes', async () => {
    await postYear(THIS_YEAR - 12);
    const before = writesOf(h.db as SpyDb).length;
    const again = await postYear(1990);
    expect(again.status).toBe(409);
    expect(writesOf(h.db as SpyDb)).toHaveLength(before);
    expect(callsOn(h.db, 'analyticsEvent')).toEqual([]);
  });

  it('STATIC: only u13LockLog.ts holds the lock reason, and it is not paired with analytics or prisma', () => {
    const holders: string[] = [];
    for (const root of ['app', 'lib', 'components']) {
      for (const file of filesUnder(join(APP, root))) {
        const src = readFileSync(file, 'utf8');
        if (src.includes('coppa_u13_lock')) holders.push(file.slice(APP.length + 1));
      }
    }
    expect(holders).toEqual(['lib/privacy/u13LockLog.ts']);
    const log = readFileSync(join(APP, 'lib/privacy/u13LockLog.ts'), 'utf8');
    expect(log).not.toMatch(/analyticsEvent|recordServerEvent|from '@\/lib\/db'|prisma\./);
  });
});
