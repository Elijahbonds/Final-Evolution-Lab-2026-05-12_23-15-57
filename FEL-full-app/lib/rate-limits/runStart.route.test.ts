// RATE-LIMIT-WIRE (PR #289 QA rework): POST /api/sessions/start is limited per account and per the address the TRUSTED
// proxy set, at runRateLimit's staged start numbers, counted in the shared rate_limits table before anything is read or
// written. (The finish counts its GameSession rows — lib/sessions-route.test.ts.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable } from '@/tests/helpers/fakeRateLimitTable';

const h = vi.hoisted(() => ({ table: null as any, userId: 'u1', created: 0, reads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: h.userId } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe') return h.table[p].bind(h.table);
      if (p === 'user') return { findUnique: async () => { h.reads += 1; return { id: h.userId, email: `${h.userId}@fel.test`, role: 'player' }; } };
      if (p === 'sessionRun') {
        return {
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }: any) => { h.created += 1; return { id: `run_${h.created}`, ...data }; },
        };
      }
      throw new Error(`start test: unexpected prisma.${String(p)}`);
    },
  }),
}));

import { POST } from '@/app/api/sessions/start/route';
import { RUN_RATE_LIMITS } from '@/lib/sessions/runRateLimit';
import { RATE_LIMITS } from './policy';
import { resetRateLimitStore } from './store';

let n = 0;
const spoofed = () => `198.51.100.${(n += 1) % 250}`;
async function start(xff?: string) {
  const res = await POST(new Request('http://fel.test/api/sessions/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: JSON.stringify({ mode: 'dunkContest' }),
  }));
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.table = fakeRateLimitTable();
  h.userId = 'u1'; h.created = 0; h.reads = 0;
  resetRateLimitStore();
  delete process.env.TRUSTED_PROXY_HOPS;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); delete process.env.TRUSTED_PROXY_HOPS; });

describe('POST /api/sessions/start rate limit', () => {
  it('the numbers are runRateLimit\'s staged start limits, unchanged', () => {
    expect(RATE_LIMITS.runStart.user).toEqual({ limit: RUN_RATE_LIMITS.start.perUser, windowMs: RUN_RATE_LIMITS.start.windowMs });
    expect(RATE_LIMITS.runStart.ip).toEqual({ limit: RUN_RATE_LIMITS.start.perIp, windowMs: RUN_RATE_LIMITS.start.windowMs });
  });

  it(`per account: ${RUN_RATE_LIMITS.start.perUser} starts a minute, then 429 RATE_LIMITED before anything is read or written`, async () => {
    const limit = RUN_RATE_LIMITS.start.perUser;
    for (let i = 0; i < limit; i++) expect((await start()).status).toBe(200);
    const refused = await start();
    expect(refused).toEqual({ status: 429, retryAfter: '60', body: { ok: false, reason: 'RATE_LIMITED', retryAfterSec: 60 } });
    expect(h.created).toBe(limit);
    expect(h.reads).toBe(limit);
  });

  it('SPOOFED X-Forwarded-For: a new client-written address on every start does not reset the account\'s count', async () => {
    const limit = RUN_RATE_LIMITS.start.perUser;
    for (let i = 0; i < limit; i++) expect((await start(spoofed())).status).toBe(200);
    expect((await start(spoofed())).status).toBe(429);
  });

  it('the window reopens a minute later (the database\'s clock)', async () => {
    for (let i = 0; i <= RUN_RATE_LIMITS.start.perUser; i++) await start();
    h.table.clock += RUN_RATE_LIMITS.start.windowMs;
    expect((await start()).status).toBe(200);
  });

  it('TRUSTED_PROXY_HOPS=1: accounts sharing one proxy-set address share its allowance; the client\'s prefix is ignored', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    const { perIp, perUser } = RUN_RATE_LIMITS.start;
    for (let i = 0; i < perIp; i++) {
      h.userId = `u${Math.floor(i / perUser)}`;
      expect((await start(`${spoofed()}, 203.0.113.9`)).status).toBe(200);
    }
    h.userId = 'someone-new';
    expect((await start(`${spoofed()}, 203.0.113.9`)).status).toBe(429);
    expect((await start(`${spoofed()}, 203.0.113.77`)).status).toBe(200);
  });

  it('another account is not limited by this one', async () => {
    for (let i = 0; i <= RUN_RATE_LIMITS.start.perUser; i++) await start();
    h.userId = 'u2';
    expect((await start()).status).toBe(200);
  });
});

describe('run start limit FAILS OPEN (lane/rate-limits): no table or no database never blocks a start or answers 500', () => {
  it('table missing: starts past the limit are all opened, one line is logged', async () => {
    h.table.missing = true;
    const over = RUN_RATE_LIMITS.start.perUser + 3;
    for (let i = 0; i < over; i++) expect((await start()).status, `start ${i + 1}`).toBe(200);
    expect(h.created).toBe(over);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[rate-limits]')))
      .toEqual(['[rate-limits] table_missing_failing_open PrismaClientKnownRequestError P2010']);
  });

  it('database unreachable: the start is opened', async () => {
    h.table.down = true;
    expect((await start()).status).toBe(200);
    expect(h.created).toBe(1);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain('[rate-limits] hit_failed_failing_open PrismaClientInitializationError');
  });
});
