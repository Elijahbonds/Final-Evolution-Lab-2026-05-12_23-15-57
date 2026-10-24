// RATE-LIMIT-WIRE (PR #289 QA rework): POST /api/signup is limited per email and per the address the TRUSTED proxy set,
// in the shared rate_limits table. QA: the old key was the first X-Forwarded-For entry, which the client writes — a new
// fake address per request was a new allowance.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable, hitsSent, type FakeRateLimitTable } from '@/tests/helpers/fakeRateLimitTable';

const h = vi.hoisted(() => ({ table: null as any, created: [] as string[], hashed: 0 }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe') return h.table[p].bind(h.table);
      if (p === 'user') return { create: async ({ data }: any) => { h.created.push(data.email); return { id: `u${h.created.length}`, ...data }; } };
      if (p === 'playerProfile') return { create: async () => ({}) };
      if (p === 'guestSession') return { findUnique: async () => null };
      throw new Error(`signup test: unexpected prisma.${String(p)}`);
    },
  }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => { h.hashed += 1; return 'hashed'; } } }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));

import { POST } from '@/app/api/signup/route';
import { RATE_LIMITS } from './policy';
import { resetRateLimitStore } from './store';
import { resetRateLimitMemory } from '@/lib/rate-limit';

const ADULT = new Date().getFullYear() - 30;
const PROXY_SET = '203.0.113.9';
let n = 0;

async function signup(email: string, xff?: string, birthYear = ADULT) {
  const res = await POST(new Request('http://fel.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: JSON.stringify({ email, password: 'secret12', name: 'Pat', birthYear }),
  }));
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}
const spoofed = () => `198.51.100.${(n += 1) % 250}, 10.${n % 250}.0.1`;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.table = fakeRateLimitTable();
  h.created = []; h.hashed = 0;
  resetRateLimitStore();
  resetRateLimitMemory();   // the route's own per-instance window (kept as it was); each test is a fresh caller
  delete process.env.TRUSTED_PROXY_HOPS;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); delete process.env.TRUSTED_PROXY_HOPS; });

describe('POST /api/signup rate limit', () => {
  it(`per email: ${RATE_LIMITS.signup.email!.limit} attempts in the window, then 429 with Retry-After before bcrypt or any write`, async () => {
    const limit = RATE_LIMITS.signup.email!.limit;
    // a different first X-Forwarded-For entry each time, so the route's kept per-instance window is not what answers
    for (let i = 0; i < limit; i++) expect((await signup('pat@fel.test', spoofed())).status).toBe(200);
    const refused = await signup('pat@fel.test', spoofed());
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({ error: 'Too many signup attempts. Please try again later.' });
    expect(Number(refused.retryAfter)).toBe(3600);
    expect(h.hashed).toBe(limit);
    expect(h.created).toHaveLength(limit);
  });

  it('SPOOFED X-Forwarded-For: a new client-written address on every request does not reset the email\'s count', async () => {
    const limit = RATE_LIMITS.signup.email!.limit;
    for (let i = 0; i < limit; i++) expect((await signup('pat@fel.test', spoofed())).status).toBe(200);
    expect((await signup('pat@fel.test', spoofed())).status).toBe(429);
    // with no trusted hop configured, no address bucket is counted at all — the client's header is never a key
    expect([...h.table.rows.keys()].every((k: string) => k.startsWith('signup:email:'))).toBe(true);
  });

  it('the email is counted as the account will be named: case and spaces do not make a new bucket', async () => {
    const limit = RATE_LIMITS.signup.email!.limit;
    for (let i = 0; i < limit; i++) await signup(i % 2 ? ' PAT@fel.test ' : 'pat@FEL.test');
    expect((await signup('pat@fel.test')).status).toBe(429);
  });

  it('TRUSTED_PROXY_HOPS=1: new emails through one proxy-set address share its allowance, whatever the client prepends', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    const limit = RATE_LIMITS.signup.ip!.limit;
    for (let i = 0; i < limit; i++) expect((await signup(`p${i}@fel.test`, `${spoofed()}, ${PROXY_SET}`)).status).toBe(200);
    const refused = await signup('fresh@fel.test', `${spoofed()}, ${PROXY_SET}`);
    expect(refused.status).toBe(429);
    expect(Number(refused.retryAfter)).toBe(900);
    // a different address the proxy set is a different person
    expect((await signup('fresh@fel.test', `${spoofed()}, 203.0.113.77`)).status).toBe(200);
  });

  it('an under-13 sign-up stores nothing, not even a counter: no statement reaches rate_limits', async () => {
    const res = await signup('kid@fel.test', undefined, new Date().getFullYear() - 10);
    expect(res.status).toBe(403);
    expect(h.table.calls).toEqual([]);
  });

  it('an invalid body is refused 400 and counts nothing', async () => {
    const res = await POST(new Request('http://fel.test/api/signup', { method: 'POST', body: JSON.stringify({ email: 'nope' }) }));
    expect(res.status).toBe(400);
    expect(hitsSent(h.table as FakeRateLimitTable)).toEqual([]);
  });

  it('FAIL OPEN: before the table exists, sign-ups past the shared limit still go through (no 429 from it, no 500), one line logged', async () => {
    (h.table as FakeRateLimitTable).missing = true;
    const limit = RATE_LIMITS.signup.email!.limit;
    for (let i = 0; i < limit + 3; i++) expect((await signup('early@fel.test', spoofed())).status, `sign-up ${i + 1}`).toBe(200);
    expect(h.created).toHaveLength(limit + 3);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(['[rate-limits] table_missing_failing_open PrismaClientKnownRequestError P2010']);
  });

  it('FAIL OPEN: the database cannot be reached by the limit — the sign-up is not refused by it', async () => {
    (h.table as FakeRateLimitTable).down = true;
    const r = await signup('down@fel.test', spoofed());
    expect(r.status).toBe(200);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] hit_failed_failing_open PrismaClientInitializationError');
  });

  it('the per-instance window the route always had is still there, first (5 per first X-Forwarded-For entry / 15 min)', async () => {
    (h.table as FakeRateLimitTable).missing = true;
    for (let i = 0; i < 5; i++) expect((await signup(`same-ip-${i}@fel.test`, '198.51.100.7')).status).toBe(200);
    expect((await signup('same-ip-6@fel.test', '198.51.100.7')).status).toBe(429);
  });
});
