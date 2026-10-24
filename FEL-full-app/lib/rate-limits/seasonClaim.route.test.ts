// RATE-LIMIT-WIRE (PR #289 QA rework): POST /api/season/claim is limited per account in the shared rate_limits table,
// before the body is read or the season service is called.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable } from '@/tests/helpers/fakeRateLimitTable';

const h = vi.hoisted(() => ({ table: null as any, userId: 'u1' as string | null, claims: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.table[p].bind(h.table)) }),
}));
vi.mock('@/lib/season/season-service', () => ({
  claimSeasonRewards: async () => { h.claims += 1; return { claimed: [], lcCredited: 0 }; },
}));

import { POST } from '@/app/api/season/claim/route';
import { RATE_LIMITS } from './policy';
import { resetRateLimitStore } from './store';

let n = 0;
async function claim(xff?: string) {
  const res = await POST(new Request('http://fel.test/api/season/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: '{}',
  }) as any);
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.table = fakeRateLimitTable();
  h.userId = 'u1'; h.claims = 0;
  resetRateLimitStore();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('POST /api/season/claim rate limit', () => {
  it(`per account: ${RATE_LIMITS.seasonClaim.user!.limit} claims a minute, then 429 before the season service runs`, async () => {
    const limit = RATE_LIMITS.seasonClaim.user!.limit;
    for (let i = 0; i < limit; i++) expect((await claim()).status).toBe(200);
    expect(await claim()).toEqual({ status: 429, retryAfter: '60', body: { error: 'rate_limited', retryAfterSec: 60 } });
    expect(h.claims).toBe(limit);
  });

  it('SPOOFED X-Forwarded-For changes nothing: the bucket is the account', async () => {
    const limit = RATE_LIMITS.seasonClaim.user!.limit;
    for (let i = 0; i < limit; i++) await claim(`198.51.100.${(n += 1) % 250}`);
    expect((await claim(`198.51.100.${(n += 1) % 250}`)).status).toBe(429);
    expect([...h.table.rows.keys()].every((k: string) => k.startsWith('seasonClaim:user:'))).toBe(true);
  });

  it('another account, and the next window, are not limited', async () => {
    for (let i = 0; i <= RATE_LIMITS.seasonClaim.user!.limit; i++) await claim();
    h.userId = 'u2';
    expect((await claim()).status).toBe(200);
    h.userId = 'u1';
    h.table.clock += 60_000;
    expect((await claim()).status).toBe(200);
  });

  it('signed out is still 401, and counts nothing', async () => {
    h.userId = null;
    expect((await claim()).status).toBe(401);
    expect(h.table.calls).toEqual([]);
  });
});

describe('season claim limit FAILS OPEN (lane/rate-limits): no table or no database never blocks a claim or answers 500', () => {
  it('table missing: claims past the limit all reach the season service, one line is logged', async () => {
    h.table.missing = true;
    const over = RATE_LIMITS.seasonClaim.user!.limit + 3;
    for (let i = 0; i < over; i++) expect((await claim()).status, `claim ${i + 1}`).toBe(200);
    expect(h.claims).toBe(over);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(['[rate-limits] table_missing_failing_open PrismaClientKnownRequestError P2010']);
  });

  it('database unreachable: the claim reaches the season service', async () => {
    h.table.down = true;
    expect((await claim()).status).toBe(200);
    expect(h.claims).toBe(1);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] hit_failed_failing_open PrismaClientInitializationError');
  });
});
