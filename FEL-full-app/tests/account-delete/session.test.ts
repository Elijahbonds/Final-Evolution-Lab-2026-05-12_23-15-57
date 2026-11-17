// ACCOUNT-DELETE: "sign out everywhere immediately". An erased account's existing tokens stop working, and the
// placeholder row never signs in again. The callbacks are the real ones in lib/auth.ts; the database is a stand-in.
// The end-to-end cases mint a REAL session JWT (next-auth/jwt encode, the app's cookie name) and read it back through
// next-auth's own getServerSession — the path every route and page takes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const h = vi.hoisted(() => ({
  users: new Map<string, { id: string; email: string; password: string; role: string }>(),
  reads: 0,
  throws: false,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async (args: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) => {
        h.reads += 1;
        if (h.throws) throw new Error('database unreachable');
        const u = args.where.id ? h.users.get(args.where.id) : [...h.users.values()].find((x) => x.email === args.where.email);
        if (!u) return null;
        if (!args.select) return { ...u, profile: null };
        return Object.fromEntries(Object.keys(args.select).map((k) => [k, (u as Record<string, unknown>)[k]]));
      },
    },
    playerProfile: { findUnique: async () => ({ id: 'profile-1' }) },
  },
}));

import { encode } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { ACCOUNT_STATUS_TTL_MS, markAccountErased, resetAccountStatus } from '@/lib/auth/accountStatus';
import { tombstoneEmail } from '@/lib/data-rights/tombstone';

const SECRET = 'test-secret-account-delete';
process.env.NEXTAUTH_SECRET = SECRET;

const jwt = authOptions.callbacks!.jwt as (arg: unknown) => Promise<Record<string, unknown>>;
const sessionCb = authOptions.callbacks!.session as (arg: unknown) => Promise<Record<string, unknown>>;
const credentials = authOptions.providers[0] as unknown as { options: { authorize: (c: unknown) => Promise<unknown> } };

/** What the operator's or the app's erase does to the row (lib/data-rights/rights.ts TOMBSTONE). */
function erase(id: string) {
  const u = h.users.get(id)!;
  h.users.set(id, { ...u, email: tombstoneEmail(id), password: '', role: 'player' });
}

async function cookieFor(sub: string): Promise<string> {
  return encode({ token: { sub, role: 'player', roleAt: Date.now(), profileId: 'profile-1' } as never, secret: SECRET });
}

async function serverSession(cookie: string) {
  const req = { headers: {}, cookies: { __session: cookie } };
  const res = { getHeader() {}, setCookie() {}, setHeader() {} };
  return getServerSession(req as never, res as never, authOptions);
}

beforeEach(() => {
  h.users.clear();
  h.users.set('u1', { id: 'u1', email: 'ada@fel.test', password: bcrypt.hashSync('right-password', 4), role: 'player' });
  h.users.set('u2', { id: 'u2', email: 'bea@fel.test', password: bcrypt.hashSync('bea-password', 4), role: 'coach' });
  h.reads = 0;
  h.throws = false;
  resetAccountStatus();
  vi.useRealTimers();
});

describe('an old session token after the erase (real JWT, next-auth getServerSession)', () => {
  it('control: the token is a session before the erase', async () => {
    const cookie = await cookieFor('u1');
    const s = await serverSession(cookie);
    expect((s as { user?: { id?: string } } | null)?.user?.id).toBe('u1');
  });

  it('on the instance that ran the erase: rejected at once, with no database read', async () => {
    const cookie = await cookieFor('u1');
    expect(await serverSession(cookie)).not.toBeNull();
    erase('u1');
    markAccountErased('u1');   // what app/api/account/delete/route.ts does after the commit
    const reads = h.reads;
    expect(await serverSession(cookie)).toBeNull();
    expect(h.reads).toBe(reads);
  });

  it('on another instance (nothing marked): rejected at its next check, within ACCOUNT_STATUS_TTL_MS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cookie = await cookieFor('u1');
    expect(await serverSession(cookie)).not.toBeNull();   // seen alive: trusted for the TTL
    erase('u1');
    vi.setSystemTime(Date.now() + ACCOUNT_STATUS_TTL_MS + 1);
    expect(await serverSession(cookie)).toBeNull();
    // and from then on, known: no more reads for that token
    const reads = h.reads;
    expect(await serverSession(cookie)).toBeNull();
    expect(h.reads).toBe(reads);
  });

  it('an account row that is gone altogether is signed out too', async () => {
    const cookie = await cookieFor('ghost');
    expect(await serverSession(cookie)).toBeNull();
  });

  it('another person\'s session is untouched by the erase', async () => {
    const other = await cookieFor('u2');
    erase('u1');
    markAccountErased('u1');
    expect((await serverSession(other) as { user?: { id?: string } } | null)?.user?.id).toBe('u2');
  });
});

describe('the cost: no extra read per request', () => {
  it('a live account is read once, then trusted for the TTL (the role refresh rides the same read)', async () => {
    const cookie = await cookieFor('u1');
    await serverSession(cookie);
    const after = h.reads;
    for (let i = 0; i < 5; i++) await serverSession(cookie);
    expect(h.reads).toBe(after);
    expect(after).toBe(1);
  });

  it('a database blink keeps the session (fail open, as the role refresh always has)', async () => {
    const cookie = await cookieFor('u1');
    h.throws = true;
    expect((await serverSession(cookie) as { user?: { id?: string } } | null)?.user?.id).toBe('u1');
  });
});

describe('the callbacks directly', () => {
  it('the jwt callback empties an erased account\'s token, and the session callback makes that no session', async () => {
    erase('u1');
    const token = await jwt({ token: { sub: 'u1', role: 'admin', roleAt: Date.now() }, account: null });
    expect(token).toEqual({});
    const session = await sessionCb({ session: { user: { email: 'ada@fel.test' }, expires: '2099-01-01' }, token });
    expect(session).toEqual({});
  });
});

describe('the placeholder never signs in again', () => {
  it('control: the live account signs in with its password', async () => {
    expect(await credentials.options.authorize({ email: 'ada@fel.test', password: 'right-password' })).toMatchObject({ id: 'u1' });
  });

  it('after the erase: neither the old email nor the placeholder email signs in, whatever the password', async () => {
    erase('u1');
    expect(await credentials.options.authorize({ email: 'ada@fel.test', password: 'right-password' })).toBeNull();
    expect(await credentials.options.authorize({ email: tombstoneEmail('u1'), password: '' })).toBeNull();
    expect(await credentials.options.authorize({ email: tombstoneEmail('u1'), password: 'anything' })).toBeNull();
  });

  it('even if the placeholder were somehow given a password again, it is refused', async () => {
    erase('u1');
    const u = h.users.get('u1')!;
    h.users.set('u1', { ...u, password: bcrypt.hashSync('new-password', 4) });
    expect(await credentials.options.authorize({ email: tombstoneEmail('u1'), password: 'new-password' })).toBeNull();
  });
});
