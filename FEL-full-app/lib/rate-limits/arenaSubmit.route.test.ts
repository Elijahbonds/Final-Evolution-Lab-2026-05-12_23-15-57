// RATE-LIMIT-WIRE (PR #289 QA rework): POST /api/arena/submit-score is limited per account in the shared rate_limits table,
// before the body is read or the duel's row is locked; the refusal has the Arena's own `{ error: code, detail }` shape.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable } from '@/tests/helpers/fakeRateLimitTable';

const h = vi.hoisted(() => ({ table: null as any, userId: 'u1', transactions: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: h.userId } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe') return h.table[p].bind(h.table);
      // past the limit the duel is never opened; under it, the match is not found (404), which is enough here
      if (p === '$transaction') return async (fn: (tx: unknown) => unknown) => { h.transactions += 1; return fn({ competitionMatch: { findUnique: async () => null } }); };
      throw new Error(`arena test: unexpected prisma.${String(p)}`);
    },
  }),
}));

import { POST } from '@/app/api/arena/submit-score/route';
import { RATE_LIMITS } from './policy';
import { resetRateLimitStore } from './store';

let n = 0;
async function submit(xff?: string) {
  const res = await POST(new Request('http://fel.test/api/arena/submit-score', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: JSON.stringify({ matchId: 'm1', score: 10, runId: 'r1' }),
  }) as any);
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.table = fakeRateLimitTable();
  h.userId = 'u1'; h.transactions = 0;
  resetRateLimitStore();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('POST /api/arena/submit-score rate limit', () => {
  it(`per account: ${RATE_LIMITS.arenaSubmit.user!.limit} submits a minute, then 429 RATE_LIMITED before the duel is touched`, async () => {
    const limit = RATE_LIMITS.arenaSubmit.user!.limit;
    for (let i = 0; i < limit; i++) expect((await submit()).status).toBe(404);
    const refused = await submit();
    expect(refused.status).toBe(429);
    expect(refused.retryAfter).toBe('60');
    expect(refused.body).toEqual({ error: 'RATE_LIMITED', detail: 'Too many score submissions. Please wait a moment, then try again.', retryAfterSec: 60 });
    expect(h.transactions).toBe(limit);
  });

  it('SPOOFED X-Forwarded-For changes nothing: the bucket is the account', async () => {
    const limit = RATE_LIMITS.arenaSubmit.user!.limit;
    for (let i = 0; i < limit; i++) await submit(`198.51.100.${(n += 1) % 250}`);
    expect((await submit(`198.51.100.${(n += 1) % 250}, 203.0.113.9`)).status).toBe(429);
    expect([...h.table.rows.keys()].every((k: string) => k.startsWith('arenaSubmit:user:'))).toBe(true);
  });

  it('another account, and the next window, are not limited', async () => {
    for (let i = 0; i <= RATE_LIMITS.arenaSubmit.user!.limit; i++) await submit();
    h.userId = 'u2';
    expect((await submit()).status).toBe(404);
    h.userId = 'u1';
    h.table.clock += 60_000;
    expect((await submit()).status).toBe(404);
  });
});
