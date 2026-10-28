// TIP-GUEST-TOKEN-HASH (2026-10-19): the guest token is hashed at rest, and a browser with the AGE-SCREEN block flag gets
// no guest row. Posts to the real routes (POST /api/guest, /api/analytics, /api/signup, /api/challenge/[code]/open and
// /attempt) and reads what they stored, logged and answered. Only the cookie jar, the session, the database and the
// analytics writer are stand-ins; the jar serialises through Next's own ResponseCookies so Set-Cookie is the real header.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { hashGuestToken, mintGuestToken } from '@/lib/guest';
import { resetGuestTokenHashProbe } from '@/lib/guestSession';
import { newSpyDb, spyPrisma, type SpyDb } from '@/tests/helpers/writeSpyDb';

type GRow = { id: string; token: string; tokenHash?: string | null; data?: unknown; migratedUserId: string | null; lastSeenAt?: Date };
const h = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  out: null as unknown as Headers,
  session: null as unknown,
  column: false,
  guests: [] as GRow[],
  guestOps: [] as string[],
  events: [] as Array<Record<string, unknown>>,
  opened: [] as unknown[][],
  attempts: [] as Array<Record<string, unknown>>,
  spy: null as unknown as SpyDb,
}));

// Only GuestSession SQL is a guest op. Release's shared rate limit (lib/rate-limits, #405) also reaches the raw client from
// /api/signup; answering it with no rows leaves it failing open, as it does before its table exists.
const fake = {
  async $queryRawUnsafe(sql: string, ...v: unknown[]) {
    if (!sql.includes('GuestSession')) return [];
    h.guestOps.push('raw');
    if (sql.includes('information_schema.columns')) return h.column ? [{ ok: 1 }] : [];
    const r = h.guests.find((x) => x.tokenHash === v[0] || x.token === v[0]);
    return r ? [{ id: r.id, migratedUserId: r.migratedUserId }] : [];
  },
  async $executeRawUnsafe(sql: string, ...v: unknown[]) {
    if (!sql.includes('GuestSession')) return 0;
    h.guestOps.push('stamp');
    const r = h.guests.find((x) => x.id === v[1] && x.tokenHash == null);
    if (r) r.tokenHash = v[0] as string;
    return r ? 1 : 0;
  },
  guestSession: {
    async findUnique(a: { where: { token: string } }) {
      h.guestOps.push('findUnique');
      const r = h.guests.find((x) => x.token === a.where.token);
      return r ? { id: r.id, migratedUserId: r.migratedUserId } : null;
    },
    async create(a: { data: { token: string; data: unknown } }) {
      h.guestOps.push('create');
      const r: GRow = { id: `g${h.guests.length + 1}`, ...a.data, migratedUserId: null, ...(h.column ? { tokenHash: null } : {}) };
      h.guests.push(r);
      return { id: r.id, migratedUserId: null };
    },
    async update(a: { where: { id: string }; data: Partial<GRow> }) {
      h.guestOps.push('update');
      const r = h.guests.find((x) => x.id === a.where.id);
      if (!r) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(r, a.data);
      return r;
    },
  },
};
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : p in fake ? (fake as any)[p] : spyPrisma(h.spy)[p as string]) }),
}));
vi.mock('next/headers', () => ({
  cookies: () => {
    const res = new ResponseCookies(h.out);
    return {
      get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
      set: (name: string, value: string, o?: Record<string, unknown>) => { res.set(name, value, o as never); },
    };
  },
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({
  recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); },
  recordServerEvents: async (es: Array<Record<string, unknown>>) => { h.events.push(...es); },
}));
vi.mock('@/lib/social/challenge-service', () => ({
  markOpened: async (...a: unknown[]) => { h.opened.push(a); return { code: 'C1', modeKey: 'dunk', score: 1, display: 'x', tag: 't' }; },
  resolveAttempt: async (a: Record<string, unknown>) => { h.attempts.push(a); return { beat: false }; },
  // CHALLENGES-2: the attempt route reads the verified challenge first (48-hour clock, rep kind); a live score challenge
  verifiedChallenge: async () => ({ link: { code: 'C1', modeKey: 'dunk' }, payload: { v: 2, modeKey: 'dunk', score: 1, tag: 't', ghost: [], t: Date.now() } }),
  CHALLENGE_EXPIRED: 'expired',
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async () => ({ balanceAfter: 500 }) }));

import { POST as guestPost } from '@/app/api/guest/route';
import { POST as analyticsPost } from '@/app/api/analytics/route';
import { POST as signupPost } from '@/app/api/signup/route';
import { POST as openPost } from '@/app/api/challenge/[code]/open/route';
import { POST as attemptPost } from '@/app/api/challenge/[code]/attempt/route';

const logs: unknown[][] = [];
const setCookies = () => h.out.getSetCookie();
const guestCookieValue = () => {
  const c = setCookies().find((s) => /^(__Host-)?fel_guest=[^;]+/.test(s));
  return c ? c.split(';')[0].split('=')[1] : null;
};
const everything = () => JSON.stringify({ guests: h.guests, events: h.events, opened: h.opened, attempts: h.attempts, spy: h.spy.tables });
const json = (body: unknown) => new Request('http://fel.test/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  h.cookies = {}; h.out = new Headers(); h.session = null; h.column = false;
  h.guests = []; h.guestOps = []; h.events = []; h.opened = []; h.attempts = []; h.spy = newSpyDb();
  resetGuestTokenHashProbe();
  logs.length = 0;
  for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a); });
  }
});
afterEach(() => {
  // the log scan, after every test: no console call carries a raw token, a stored hash or a cookie header
  const printed = JSON.stringify(logs.map((a) => a.map((x) => (x instanceof Error ? `${x.name}:${x.message}` : x))));
  for (const g of h.guests) expect(printed).not.toContain(g.token);
  for (const v of Object.values(h.cookies)) expect(printed).not.toContain(v);
  const issued = guestCookieValue();
  if (issued) expect(printed).not.toContain(issued);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/guest', () => {
  it('a new guest: the row stores sha256(cookie) and no stored field equals the cookie; the body never carries it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await guestPost();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, guest: true });
    const token = guestCookieValue()!;
    expect(Buffer.from(token, 'base64url')).toHaveLength(24);
    expect(h.guests).toHaveLength(1);
    expect(h.guests[0].token).toBe(hashGuestToken(token));
    expect(everything()).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(h.events).toEqual([{ name: 'guest_start', guestId: hashGuestToken(token), props: {} }]);
  });

  it('Set-Cookie is __Host-fel_guest; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; no Domain', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await guestPost();
    const [c, ...rest] = setCookies();
    expect(rest).toEqual([]);
    expect(c).toMatch(/^__Host-fel_guest=[A-Za-z0-9_-]{32};/);
    for (const flag of [/; HttpOnly(;|$)/, /; Secure(;|$)/, /; SameSite=lax(;|$)/i, /; Path=\/(;|$)/, /; Max-Age=2592000(;|$)/]) expect(c).toMatch(flag);
    expect(c).not.toMatch(/Domain=/i);
  });

  it('outside production the name is fel_guest and the cookie is still HttpOnly + Secure', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await guestPost();
    const [c] = setCookies();
    expect(c).toMatch(/^fel_guest=[A-Za-z0-9_-]{32};/);
    expect(c).toMatch(/; Secure(;|$)/);
    expect(c).toMatch(/; HttpOnly(;|$)/);
  });

  it('a second POST with the same cookie reuses the row (no second row, no second guest_start)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await guestPost();
    const token = guestCookieValue()!;
    h.cookies = { '__Host-fel_guest': token }; h.out = new Headers();
    await guestPost();
    expect(h.guests).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    expect(guestCookieValue()).toBe(token);
    expect(h.guests[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it.each([['junk', 'not-a-token'], ['31 chars', 'A'.repeat(31)], ['a +', `${'A'.repeat(31)}+`]])('a malformed cookie (%s) makes no DB lookup and mints a new token', async (_l, bad) => {
    h.cookies = { fel_guest: bad };
    await guestPost();
    expect(h.guestOps.filter((o) => o === 'findUnique')).toEqual([]);
    expect(h.guestOps.filter((o) => o === 'raw')).toHaveLength(1);   // the column probe on create, never a lookup
    const minted = guestCookieValue()!;
    expect(minted).not.toBe(bad);
    expect(h.guests[0].token).toBe(hashGuestToken(minted));
  });

  it('a legacy fel_guest cookie is looked up by its hash, re-issued as __Host-fel_guest, and the old name expired', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const t = mintGuestToken();
    h.guests.push({ id: 'old', token: hashGuestToken(t), migratedUserId: null });
    h.cookies = { fel_guest: t };
    await guestPost();
    expect(h.guests).toHaveLength(1);
    const cs = setCookies();
    expect(cs[0]).toMatch(new RegExp(`^__Host-fel_guest=${t};`));
    expect(cs[1]).toMatch(/^fel_guest=; Path=\/; Max-Age=0$/);
  });

  it('after file 1 (tokenHash present): a pre-hash row is found by tokenHash and the new row stamps it', async () => {
    h.column = true;
    const old = mintGuestToken();
    h.guests.push({ id: 'pre', token: old, tokenHash: hashGuestToken(old), migratedUserId: null });
    h.cookies = { fel_guest: old };
    await guestPost();
    expect(h.guests).toHaveLength(1);
    h.cookies = {}; h.out = new Headers();
    await guestPost();
    const fresh = guestCookieValue()!;
    expect(h.guests[1]).toMatchObject({ token: hashGuestToken(fresh), tokenHash: hashGuestToken(fresh) });
  });

  it('with fel_age_gate: 403 {ok:false}, guestSession.create is not called, no Set-Cookie, no event', async () => {
    h.cookies = { fel_age_gate: '1' };
    const res = await guestPost();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false });
    expect(h.guestOps).toEqual([]);
    expect(setCookies()).toEqual([]);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(h.events).toEqual([]);
  });
});

describe('POST /api/analytics', () => {
  const batch = { events: [{ name: 'play_now_click', props: { target: 'dunk' } }] };

  it('a guest batch stores guestId = the hash, never the cookie', async () => {
    const t = mintGuestToken();
    h.cookies = { fel_guest: t };
    const res = await analyticsPost(json(batch));
    expect(res.status).toBe(204);
    expect(h.events).toHaveLength(1);
    expect(h.events[0].guestId).toBe(hashGuestToken(t));
    expect(everything()).not.toContain(t);
  });

  it('a malformed guest cookie stores guestId null', async () => {
    h.cookies = { fel_guest: 'raw-junk-value' };
    await analyticsPost(json(batch));
    expect(h.events[0].guestId).toBeNull();
    expect(everything()).not.toContain('raw-junk-value');
  });

  it('a signed-out browser with fel_age_gate: 204 and nothing written (even with a guest cookie)', async () => {
    h.cookies = { fel_age_gate: '1', fel_guest: mintGuestToken() };
    const res = await analyticsPost(json(batch));
    expect(res.status).toBe(204);
    expect(h.events).toEqual([]);
  });

  it('control: a signed-in user with the flag still records (the drop is for guests only), with no guestId', async () => {
    h.session = { user: { id: 'u-1' } };
    h.cookies = { fel_age_gate: '1' };
    await analyticsPost(json(batch));
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ userId: 'u-1', guestId: null });
  });
});

describe('POST /api/signup claims the guest by hash', () => {
  it('finds the session by hash, sets migratedUserId, and guest_claim / signup_complete carry the hash', async () => {
    const t = mintGuestToken();
    h.guests.push({ id: 'g-claim', token: hashGuestToken(t), migratedUserId: null });
    h.cookies = { fel_guest: t };
    const res = await signupPost(json({ email: 'claim@fel.test', password: 'secret1', name: 'A', birthYear: 1990 }));
    expect(res.status).toBe(200);
    const userId = (h.spy.tables.user ?? [])[0]?.id;
    expect(userId).toBeTruthy();
    expect(h.guests[0].migratedUserId).toBe(userId);
    const claim = h.events.find((e) => e.name === 'guest_claim');
    const done = h.events.find((e) => e.name === 'signup_complete');
    expect(claim).toMatchObject({ userId, guestId: hashGuestToken(t), props: { migrated: true } });
    expect(done).toMatchObject({ userId, guestId: hashGuestToken(t), props: { fromGuest: true } });
    expect(everything()).not.toContain(t);
  });

  it('a malformed guest cookie claims nothing and records no guest id', async () => {
    h.cookies = { fel_guest: 'short' };
    const res = await signupPost(json({ email: 'x@fel.test', password: 'secret1', name: 'A', birthYear: 1990 }));
    expect(res.status).toBe(200);
    expect(h.guestOps).toEqual([]);
    expect(h.events.find((e) => e.name === 'signup_complete')).toMatchObject({ guestId: null, props: { fromGuest: false } });
  });
});

describe('POST /api/challenge/[code]/open and /attempt', () => {
  // CHALLENGES-2 (test changed): an open no longer STARTS a guest. It minted a row and a cookie before the year question,
  // which /try's rule (PRIVACY-CORE 1b: the year first, a guest row only on an adult answer) forbids; the challenge's
  // play page now asks first and starts the guest through POST /api/guest. What this test pinned still holds for a guest
  // that exists: the open passes the token's HASH to the funnel, never the token.
  it('open passes an existing guest\'s hash to the funnel and writes nothing; with no guest it mints no row and no cookie', async () => {
    const t = mintGuestToken();
    h.cookies = { fel_guest: t };
    const res = await openPost(new Request('http://fel.test/x', { method: 'POST' }), { params: { code: 'C1' } });
    expect(res.status).toBe(200);
    expect(h.opened[0]).toEqual(['C1', hashGuestToken(t), null]);
    expect(h.guestOps).toEqual([]);
    expect(setCookies()).toEqual([]);
    expect(everything()).not.toContain(t);
    h.cookies = {};
    const fresh = await openPost(new Request('http://fel.test/x', { method: 'POST' }), { params: { code: 'C1' } });
    expect(fresh.status).toBe(200);
    expect(h.opened[1]).toEqual(['C1', null, null]);
    expect(h.guestOps).toEqual([]);
    expect(setCookies()).toEqual([]);
  });

  it('open with fel_age_gate: no guest row, no cookie, the open counted with no guest id', async () => {
    h.cookies = { fel_age_gate: '1' };
    const res = await openPost(new Request('http://fel.test/x', { method: 'POST' }), { params: { code: 'C1' } });
    expect(res.status).toBe(200);
    expect(h.guestOps).toEqual([]);
    expect(setCookies()).toEqual([]);
    expect(h.opened[0]).toEqual(['C1', null, null]);
  });

  it('attempt passes the hash, and no guest id at all with fel_age_gate', async () => {
    const t = mintGuestToken();
    h.cookies = { fel_guest: t };
    await attemptPost(json({ attemptScore: 10 }), { params: { code: 'C1' } });
    expect(h.attempts[0].guestId).toBe(hashGuestToken(t));
    h.cookies = { fel_guest: t, fel_age_gate: '1' };
    await attemptPost(json({ attemptScore: 10 }), { params: { code: 'C1' } });
    expect(h.attempts[1].guestId).toBeNull();
    expect(everything()).not.toContain(t);
  });
});
