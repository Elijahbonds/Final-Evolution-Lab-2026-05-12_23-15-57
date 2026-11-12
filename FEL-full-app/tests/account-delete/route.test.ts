// ACCOUNT-DELETE: GET/POST /api/account/delete against a stand-in database. The session is the only account the route
// acts on; the erase itself is the shared core (lib/data-rights/accountDelete.ts), spied here so each refusal can show
// it was NOT called, and the success that it was — with the session's id and source 'in-app'.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

type U = { id: string; email: string; password: string; dobYear: number | null; role: string };

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
  users: new Map<string, U>(),
  /** table → columns present (the pending-schema probe) */
  schema: {} as Record<string, string[]>,
  /** obligation counts by a fragment of the statement */
  counts: {} as Record<string, number>,
  /** rate_limits: bucket → hits; null = the table is missing (the shared store fails open) */
  buckets: new Map<string, number>() as Map<string, number> | null,
  erases: [] as unknown[][],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async (args: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) => {
        const u = args.where.id ? h.users.get(args.where.id) : undefined;
        if (!u) return null;
        if (!args.select) return { ...u, profile: null };
        return Object.fromEntries(Object.keys(args.select).map((k) => [k, (u as Record<string, unknown>)[k]]));
      },
    },
    playerProfile: { findUnique: async () => ({ id: 'p1' }) },
    async $queryRawUnsafe(sql: string, ...args: unknown[]) {
      if (sql.startsWith('INSERT INTO "rate_limits"')) {
        if (!h.buckets) throw Object.assign(new Error('relation "rate_limits" does not exist'), { code: '42P01' });
        const n = (h.buckets.get(String(args[0])) ?? 0) + 1;
        h.buckets.set(String(args[0]), n);
        return [{ hits: n, retryAfterSec: 600 }];
      }
      if (sql.includes('information_schema.columns')) {
        return Object.entries(h.schema).flatMap(([t, cols]) => cols.map((c) => ({ table_name: t, column_name: c })));
      }
      for (const [frag, n] of Object.entries(h.counts)) if (sql.includes(frag)) return [{ n }];
      return [{ n: 0 }];
    },
    async $executeRawUnsafe() { return 0; },
    async $transaction() { throw new Error('the erase is spied in this file; the real one is tested in lib/data-rights'); },
  },
}));
vi.mock('@/lib/data-rights/accountDelete', async (orig) => {
  const real = await orig<typeof import('@/lib/data-rights/accountDelete')>();
  return {
    ...real,
    eraseAccountNow: vi.fn(async (_run: unknown, userId: string, source: string) => {
      h.erases.push([userId, source]);
      const u = h.users.get(userId)!;
      const already = u.email.endsWith('@erased.invalid');
      h.users.set(userId, { ...u, email: `erased-${userId}@erased.invalid`, password: '', dobYear: null });
      return { alreadyErased: already, source, erasure: { dryRun: false, lines: [], notYetCreated: [] } };
    }),
  };
});

import { GET, POST } from '@/app/api/account/delete/route';
import { authOptions } from '@/lib/auth';
import { isKnownErased, resetAccountStatus } from '@/lib/auth/accountStatus';
import { resetRateLimitMemory } from '@/lib/rate-limit';
import { resetRateLimitStore } from '@/lib/rate-limits/store';
import { ACCOUNT_DELETE_LIMIT } from '@/lib/data-rights/deleteRateLimit';
import { eraseAccountNow } from '@/lib/data-rights/accountDelete';

const ADULT = new Date().getFullYear() - 30;
const jwt = authOptions.callbacks!.jwt as (arg: unknown) => Promise<Record<string, unknown>>;

function post(body: unknown) {
  return POST(new Request('http://localhost/api/account/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
const good = { email: 'Ada@FEL.test ', password: 'right-password', confirm: true };

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.users.clear();
  h.users.set('u1', { id: 'u1', email: 'ada@fel.test', password: bcrypt.hashSync('right-password', 4), dobYear: ADULT, role: 'coach' });
  h.users.set('u2', { id: 'u2', email: 'bea@fel.test', password: bcrypt.hashSync('bea-password', 4), dobYear: ADULT, role: 'player' });
  h.schema = {};
  h.counts = {};
  h.buckets = new Map();
  h.erases = [];
  vi.mocked(eraseAccountNow).mockClear();
  resetAccountStatus();
  resetRateLimitMemory();
  resetRateLimitStore();
});

describe('POST /api/account/delete — refusals never reach the erase', () => {
  it('signed out: 401', async () => {
    h.session = null;
    expect((await post(good)).status).toBe(401);
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });

  it('the confirm step is required: missing, false or not literally true is 400', async () => {
    for (const confirm of [undefined, false, 'yes', 1]) {
      const res = await post({ ...good, confirm });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('confirm_required');
    }
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });

  it('re-authentication is required: a wrong email, a wrong password, or none, is 403 with one message', async () => {
    const tries = [
      { ...good, email: 'bea@fel.test' },             // someone else's email
      { ...good, password: 'wrong-password' },
      { ...good, password: '' },
      { ...good, email: '' },
      { confirm: true },
    ];
    for (const t of tries) {
      h.buckets = new Map(); resetRateLimitMemory();
      const res = await post(t);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'reauth_failed' });
    }
    expect(eraseAccountNow).not.toHaveBeenCalled();
    expect(h.users.get('u1')!.email).toBe('ada@fel.test');
  });

  it('a minor is blocked and told to ask a parent or guardian', async () => {
    h.users.get('u1')!.dobYear = new Date().getFullYear() - 15;
    const res = await post(good);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'blocked', block: { kind: 'minor' } });
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });

  it('no birth year reads as a minor (the consent rule): blocked as age-unknown', async () => {
    h.users.get('u1')!.dobYear = null;
    const res = await post(good);
    expect(res.status).toBe(409);
    expect((await res.json()).block).toEqual({ kind: 'age-unknown' });
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });

  it('open obligations are blocked, with the list of what to settle', async () => {
    h.schema = {
      Booking: ['coachUserId', 'clientUserId', 'status', 'deliveredAt', 'endsAt', 'holdExpiresAt'],
      PayoutRequest: ['userId', 'status'],
      Subscription: ['userId', 'status', 'cancelAtPeriodEnd'],
    };
    h.counts = { 'WHERE "coachUserId" = $1': 2, 'FROM "PayoutRequest"': 1 };
    const res = await post(good);
    expect(res.status).toBe(409);
    expect((await res.json()).block).toEqual({ kind: 'obligations', items: [{ code: 'coach-bookings', count: 2 }, { code: 'payouts', count: 1 }] });
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });

  it('a malformed body is 400', async () => {
    const res = await POST(new Request('http://localhost/api/account/delete', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });
});

describe('the rate limit', () => {
  it(`counts every try per account, before the password: try ${ACCOUNT_DELETE_LIMIT.limit + 1} is 429 even with the right password`, async () => {
    for (let i = 0; i < ACCOUNT_DELETE_LIMIT.limit; i++) expect((await post({ ...good, password: `guess-${i}` })).status).toBe(403);
    const res = await post(good);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(eraseAccountNow).not.toHaveBeenCalled();
    // counted in the shared table, under an HMAC'd bucket — never the id in the clear
    expect([...h.buckets!.keys()].every((k) => k.startsWith('accountDelete:user:') && !k.includes('u1'))).toBe(true);
  });

  it('another account has its own allowance', async () => {
    for (let i = 0; i < ACCOUNT_DELETE_LIMIT.limit + 1; i++) await post({ ...good, password: 'nope' });
    h.session = { user: { id: 'u2' } };
    expect((await post({ email: 'bea@fel.test', password: 'nope', confirm: true })).status).toBe(403);
  });

  it('when the shared table is missing (the store fails open), the per-instance window still limits', async () => {
    h.buckets = null;
    for (let i = 0; i < ACCOUNT_DELETE_LIMIT.limit; i++) expect((await post({ ...good, password: 'nope' })).status).toBe(403);
    expect((await post(good)).status).toBe(429);
    expect(eraseAccountNow).not.toHaveBeenCalled();
  });
});

describe('the delete', () => {
  it('calls the shared erase core with the SESSION\'s id and source in-app, clears the cookie, ends the session', async () => {
    const res = await post({ ...good, userId: 'u2' });   // a body cannot name another account
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyErased: false });
    expect(eraseAccountNow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(eraseAccountNow).mock.calls[0][1]).toBe('u1');
    expect(vi.mocked(eraseAccountNow).mock.calls[0][2]).toBe('in-app');
    expect(typeof vi.mocked(eraseAccountNow).mock.calls[0][0]).toBe('function');   // a transaction runner
    expect(h.users.get('u2')!.email).toBe('bea@fel.test');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    // this instance ends the account's other sessions at once: an old token for u1 is now empty
    expect(isKnownErased('u1')).toBe(true);
    expect(await jwt({ token: { sub: 'u1', role: 'coach', roleAt: Date.now() }, account: null })).toEqual({});
  });

  it('a retry after it went through: 200 again, alreadyErased, no second erase', async () => {
    expect((await post(good)).status).toBe(200);
    // the same browser retrying while another instance still trusts the token for its last seconds
    const again = await post(good);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, alreadyErased: true });
    expect(eraseAccountNow).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/account/delete — can this account be deleted now?', () => {
  it('an adult with nothing open: block null', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ block: null });
  });

  it('a minor: the minor block, before any obligation is looked at', async () => {
    h.users.get('u1')!.dobYear = new Date().getFullYear() - 14;
    h.schema = { PayoutRequest: ['userId', 'status'] };
    h.counts = { 'FROM "PayoutRequest"': 1 };
    expect(await (await GET()).json()).toEqual({ block: { kind: 'minor' } });
  });

  it('signed out: 401', async () => {
    h.session = null;
    expect((await GET()).status).toBe(401);
  });
});
