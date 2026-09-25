import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/sessions and POST/DELETE /api/v1/sessions/join-link run for real here, and so do the role checks they
// reuse (lib/camp/server isOwner, lib/coach/server isCertifiedCoach). Only the session and the database are stand-ins:
// a small in-memory database that honours the `where` clauses these routes send, so a query that forgot its status
// filter would hand a cancelled booking a link in this test exactly as it would in production.
type Row = { id: string; userId: string; kind: string; sessionKey: string; status: string; shardsPaid: number; startsAt: Date; createdAt: Date };
const m = vi.hoisted(() => ({
  session: null as unknown,
  roles: new Map<string, string>(),
  certified: new Set<string>(),
  coachOf: new Map<string, string>(),
  bookings: [] as Row[],
  links: new Map<string, { sessionKey: string; url: string; setById: string }>(),
  linkTable: true, // false: the schema was never pushed, so the table is not in the database
  accessor: true, // false: a Prisma client generated before the model, with no prisma.sessionJoinLink at all
  failWith: null as null | { code: string }, // any other database failure
  spent: [] as { playerId: string; skuId: string; idempotencyKey: string }[], // what the booking route charged
}));

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
// The wallet has its own suites; the booking route only has to charge through it, and here it records each charge.
vi.mock('@/lib/wallet/wallet-service', () => ({
  spend: async (_db: unknown, a: { playerId: string; skuId: string; idempotencyKey: string }) => {
    m.spent.push(a);
    return { spent: { currency: 'shards', amount: 900 }, balances: { coins: 0, shards: 100, lc: 0 }, entry_id: `e${m.spent.length}` };
  },
  readWallet: async () => ({ coins: 0, shards: 100, lc: 0 }),
  WalletError: class WalletError extends Error { code = ''; },
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
// The schedule names no coach account on any slot today (joinLink.slotCoachId). The coach tests name one, to prove the
// route lets that coach in once the data does.
vi.mock('@/lib/sessions/joinLink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sessions/joinLink')>()),
  slotCoachId: (key: string) => m.coachOf.get(key) ?? null,
}));
vi.mock('@/lib/db', () => {
  const missing = () => Object.assign(new Error('The table `public.SessionJoinLink` does not exist in the current database.'), { code: 'P2021' });
  const table = () => {
    if (m.failWith) throw Object.assign(new Error('database failure'), m.failWith);
    if (!m.linkTable) throw missing();
    return m.links;
  };
  const joinLinks = {
    findMany: async ({ where }: any) => where.sessionKey.in.filter((k: string) => table().has(k)).map((k: string) => table().get(k)),
    upsert: async ({ where, create, update }: any) => {
      const t = table();
      const row = t.has(where.sessionKey) ? { ...t.get(where.sessionKey)!, ...update } : create;
      t.set(where.sessionKey, row);
      return row;
    },
    deleteMany: async ({ where }: any) => ({ count: table().delete(where.sessionKey) ? 1 : 0 }),
  };
  const matches = (b: Row, where: Record<string, any>) => Object.entries(where).every(([k, v]) => (
    k === 'startsAt' ? b.startsAt.getTime() >= v.gte.getTime()
      : v && typeof v === 'object' && Array.isArray(v.in) ? v.in.includes((b as any)[k])
        : (b as any)[k] === v
  ));
  return {
    prisma: {
      user: { findUnique: async ({ where }: any) => (m.roles.has(where.id) ? { role: m.roles.get(where.id) } : null) },
      facilitatorProfile: { findUnique: async ({ where }: any) => (m.certified.has(where.userId) ? { certificationStatus: 'certified' } : null) },
      sessionBooking: {
        findMany: async ({ where }: any) => m.bookings.filter((b) => matches(b, where)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
        count: async ({ where }: any) => m.bookings.filter((b) => matches(b, where)).length,
        findFirst: async ({ where }: any) => m.bookings.find((b) => matches(b, where)) ?? null,
        create: async ({ data }: any) => {
          const row = { id: `b${m.bookings.length}`, status: 'confirmed', createdAt: new Date(Date.now() + m.bookings.length), ...data };
          m.bookings.push(row);
          return row;
        },
        groupBy: async ({ where }: any) => {
          const out = new Map<string, any>();
          for (const b of m.bookings.filter((x) => matches(x, where))) {
            const g = out.get(b.sessionKey) ?? { sessionKey: b.sessionKey, kind: b.kind, _count: { _all: 0 }, _min: { startsAt: b.startsAt } };
            g._count._all++;
            out.set(b.sessionKey, g);
          }
          return [...out.values()];
        },
      },
      get sessionJoinLink() { return m.accessor ? joinLinks : undefined; },
    },
  };
});

import { GET } from '@/app/api/v1/sessions/route';
import { POST, DELETE } from '@/app/api/v1/sessions/join-link/route';
import { POST as BOOK } from '@/app/api/v1/sessions/book/route';
import { upcomingGroupSlots, privateSlots } from '@/lib/sessions/schedule';

const ZOOM = 'https://us02web.zoom.us/j/81234567890?pwd=AbC123';
// the second slot, not the first: the first may be the one that started up to an hour ago
const SLOT = () => upcomingGroupSlots(new Date(), 6)[1];
const as = (id: string | null) => { m.session = id ? { user: { id } } : null; };
const book = (userId: string, sessionKey: string, status = 'confirmed', startsAt = new Date(SLOT().startsAtIso)) => {
  // each row a millisecond after the last, so "who booked first" has one answer
  m.bookings.push({ id: `b${m.bookings.length}`, userId, kind: sessionKey.startsWith('pv_') ? 'private_1on1' : 'group_workout', sessionKey, status, shardsPaid: 150, startsAt, createdAt: new Date(Date.now() + m.bookings.length) });
};
const send = (fn: typeof POST, body: unknown) => fn(new Request('http://fel.test/api/v1/sessions/join-link', {
  method: fn === DELETE ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never);
const sessions = async () => { const res = await GET(); return { status: res.status, body: await res.json() }; };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  as(null);
  m.roles.clear(); m.certified.clear(); m.coachOf.clear(); m.links.clear();
  m.bookings.length = 0;
  m.linkTable = true;
  m.accessor = true;
  m.failWith = null;
  m.spent.length = 0;
  m.roles.set('admin1', 'admin').set('owner1', 'owner').set('p1', 'player').set('p2', 'player').set('p3', 'player').set('coach1', 'player');
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  // no URL is ever written to a log, whatever went wrong
  for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toMatch(/zoom\.us|https?:/);
  warn.mockRestore();
});

describe('POST /api/v1/sessions/join-link: who may post', () => {
  it('refuses a caller with no session', async () => {
    const res = await send(POST, { sessionKey: SLOT().sessionKey, url: ZOOM });
    expect(res.status).toBe(401);
    expect(m.links.size).toBe(0);
  });

  it('refuses a player with no booking, a player with a CONFIRMED booking, and one whose booking was cancelled', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    book('p2', key, 'cancelled');
    for (const id of ['p3', 'p1', 'p2']) {
      as(id);
      const res = await send(POST, { sessionKey: key, url: ZOOM });
      expect(res.status, id).toBe(403);
      expect((await res.json()).error, id).toBe('forbidden');
    }
    expect(m.links.size).toBe(0);
  });

  it('refuses a player before it looks at the link, so the rules cannot be probed', async () => {
    as('p1');
    expect((await send(POST, { sessionKey: SLOT().sessionKey, url: 'javascript:alert(1)' })).status).toBe(403);
  });

  it('lets an admin post, stored normalised and answered with the host', async () => {
    as('admin1');
    const key = SLOT().sessionKey;
    const res = await send(POST, { sessionKey: key, url: '  HTTPS://US02WEB.Zoom.us/j/81234567890?pwd=AbC123 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionKey: key, link: { url: ZOOM, host: 'us02web.zoom.us' } });
    expect(m.links.get(key)).toEqual({ sessionKey: key, url: ZOOM, setById: 'admin1' });
  });

  it('lets the owner role post and replace a link', async () => {
    as('owner1');
    const key = SLOT().sessionKey;
    expect((await send(POST, { sessionKey: key, url: ZOOM })).status).toBe(200);
    expect((await send(POST, { sessionKey: key, url: 'https://meet.google.com/abc-defg-hij' })).status).toBe(200);
    expect(m.links.get(key)?.url).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('lets the slot\'s coach post when the slot names one, but only a certified coach and only for that slot', async () => {
    const key = SLOT().sessionKey;
    const other = upcomingGroupSlots(new Date(), 6)[2].sessionKey;
    m.coachOf.set(key, 'coach1');
    as('coach1');
    expect((await send(POST, { sessionKey: key, url: ZOOM })).status).toBe(403); // not certified yet
    m.certified.add('coach1');
    expect((await send(POST, { sessionKey: key, url: ZOOM })).status).toBe(200);
    expect((await send(POST, { sessionKey: other, url: ZOOM })).status).toBe(403);
    expect([...m.links.keys()]).toEqual([key]);
  });

  it('a certified coach who is not the slot\'s coach is a player here', async () => {
    m.certified.add('p1');
    as('p1');
    expect((await send(POST, { sessionKey: SLOT().sessionKey, url: ZOOM })).status).toBe(403);
  });
});

describe('POST /api/v1/sessions/join-link: what may be posted, and where', () => {
  beforeEach(() => as('admin1'));

  it('refuses javascript:, data:, http: and a login in front of the host, and stores nothing', async () => {
    const key = SLOT().sessionKey;
    const cases: [string, string][] = [
      ['javascript:alert(document.cookie)', 'url_not_https'],
      ['data:text/html;base64,PHNjcmlwdD4=', 'url_not_https'],
      ['http://zoom.us/j/1', 'url_not_https'],
      ['https://zoom.us@evil.example/j/1', 'url_has_login'],
      ['https://192.168.0.1/j/1', 'url_bad_host'],
      ['https://zoom.us/' + 'a'.repeat(600), 'url_too_long'],
    ];
    for (const [url, error] of cases) {
      const res = await send(POST, { sessionKey: key, url });
      expect(res.status, url).toBe(400);
      const j = await res.json();
      expect(j.error, url).toBe(error);
      expect(j.message, url).toBeTruthy();
    }
    expect(m.links.size).toBe(0);
  });

  it('refuses a malformed slot id, and a well-formed one nobody booked that is off the schedule', async () => {
    expect((await send(POST, { sessionKey: 'gw_2026-09-25; drop', url: ZOOM })).status).toBe(400);
    expect((await send(POST, { url: ZOOM })).status).toBe(400);
    const res = await send(POST, { sessionKey: 'gw_2020-01-01', url: ZOOM });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('slot_unavailable');
  });

  it('accepts a slot off the schedule window when somebody holds a confirmed booking for it', async () => {
    book('p1', 'pv_2026-09-21_16', 'confirmed', new Date('2026-09-21T23:00:00Z'));
    expect((await send(POST, { sessionKey: 'pv_2026-09-21_16', url: ZOOM })).status).toBe(200);
  });

  it('says so plainly when the table is not in the database yet (503), rather than failing blind', async () => {
    m.linkTable = false;
    const res = await send(POST, { sessionKey: SLOT().sessionKey, url: ZOOM });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'join_links_not_ready', message: expect.stringMatching(/not switched on yet/) });
  });

  it('says the same when the deployed client predates the model, and a different thing for any other failure', async () => {
    m.accessor = false;
    expect((await send(POST, { sessionKey: SLOT().sessionKey, url: ZOOM })).status).toBe(503);
    expect((await send(DELETE, { sessionKey: SLOT().sessionKey })).status).toBe(503);
    m.accessor = true;
    m.failWith = { code: 'P1001' }; // the database is unreachable: a push would not fix that, so it must not say so
    const res = await send(POST, { sessionKey: SLOT().sessionKey, url: ZOOM });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'join_link_save_failed' });
  });
});

describe('DELETE /api/v1/sessions/join-link', () => {
  it('lets an admin take a wrong link down, and refuses a booked player', async () => {
    const key = SLOT().sessionKey;
    m.links.set(key, { sessionKey: key, url: ZOOM, setById: 'admin1' });
    book('p1', key);
    as('p1');
    expect((await send(DELETE, { sessionKey: key })).status).toBe(403);
    expect(m.links.has(key)).toBe(true);
    as('admin1');
    expect((await send(DELETE, { sessionKey: key })).status).toBe(200);
    expect(m.links.has(key)).toBe(false);
    expect((await send(DELETE, { sessionKey: key })).status).toBe(200); // already gone is fine
  });

  // Found in review 2026-09-25: the wallet pays back a session that never had a link, so a link taken down after the
  // session would have paid back every booker of a session that ran.
  it('refuses to take a link down once its session has started (409), leaves it up, and still lets a new link replace it', async () => {
    const key = 'gw_2026-09-23'; // Wed Sep 23, 5:30 PM PT: started, and over
    book('p1', key, 'confirmed', new Date('2026-09-24T00:30:00Z'));
    m.links.set(key, { sessionKey: key, url: ZOOM, setById: 'admin1' });
    as('admin1');
    const res = await send(DELETE, { sessionKey: key });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'join_link_locked', message: 'This session has started, so its link stays up. Paste a new link to replace it.' });
    expect(m.links.get(key)?.url).toBe(ZOOM);
    expect((await send(POST, { sessionKey: key, url: 'https://meet.google.com/abc-defg-hij' })).status).toBe(200);
    expect(m.links.get(key)?.url).toBe('https://meet.google.com/abc-defg-hij');
    // a player is still refused first, before the clock is looked at
    as('p1');
    expect((await send(DELETE, { sessionKey: key })).status).toBe(403);
  });
});

describe('GET /api/v1/sessions: who reads a link', () => {
  const post = (key: string, url = ZOOM) => m.links.set(key, { sessionKey: key, url, setById: 'admin1' });

  it('a player with a CONFIRMED booking gets the link and its host on that booking', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    post(key);
    as('p1');
    const { status, body } = await sessions();
    expect(status).toBe(200);
    expect(body.myBookings).toHaveLength(1);
    expect(body.myBookings[0]).toMatchObject({ sessionKey: key, joinUrl: ZOOM, joinHost: 'us02web.zoom.us' });
    expect(body.hosting).toBeNull();
  });

  it('a booked player sees "not posted" (null) until a link exists', async () => {
    book('p1', SLOT().sessionKey);
    as('p1');
    const { body } = await sessions();
    expect(body.myBookings[0]).toMatchObject({ joinUrl: null, joinHost: null });
  });

  it('a player with no booking, or a cancelled or refunded one, never receives the link anywhere in the answer', async () => {
    const key = SLOT().sessionKey;
    book('p1', key); // somebody else's confirmed booking on the same slot
    book('p2', key, 'cancelled');
    book('p3', key, 'refunded');
    post(key);
    for (const id of ['p2', 'p3', 'coach1']) {
      as(id);
      const res = await GET();
      const text = await res.text();
      expect(res.status, id).toBe(200);
      expect(text, id).not.toContain('zoom.us');
      expect(JSON.parse(text).myBookings, id).toEqual([]);
    }
  });

  it('admins get the slots they post for, each with its booked count and current link', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    book('p2', key);
    book('p3', key, 'cancelled');
    book('p1', 'pv_2026-12-03_17', 'confirmed', new Date(Date.now() + 70 * 86_400_000));
    post(key);
    for (const id of ['admin1', 'owner1']) {
      as(id);
      const { body } = await sessions();
      const row = body.hosting.find((r: any) => r.sessionKey === key);
      expect(row, id).toMatchObject({ kind: 'group_workout', booked: 2, url: ZOOM, host: 'us02web.zoom.us' });
      expect(body.hosting.find((r: any) => r.sessionKey === 'pv_2026-12-03_17'), id).toMatchObject({ kind: 'private_1on1', booked: 1, url: null });
      expect(body.hosting.length, id).toBeGreaterThanOrEqual(6); // every upcoming group workout, booked or not
    }
  });

  it('a certified coach with no slot of their own gets an empty host list, not everyone\'s', async () => {
    post(SLOT().sessionKey);
    m.certified.add('coach1');
    as('coach1');
    const { body } = await sessions();
    expect(body.hosting).toEqual([]);
  });

  it('a row that no longer passes the link rules (edited by hand) is dropped, not shown', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    post(key, 'javascript:alert(1)');
    as('p1');
    const { body } = await sessions();
    expect(body.myBookings[0].joinUrl).toBeNull();
  });

  it('still loads when the table is not in the database yet: every link reads as not posted', async () => {
    m.linkTable = false;
    book('p1', SLOT().sessionKey);
    as('p1');
    const { status, body } = await sessions();
    expect(status).toBe(200);
    expect(body.myBookings[0]).toMatchObject({ joinUrl: null, joinHost: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('join links unreadable'), 'P2021');
    as('admin1');
    expect((await sessions()).body.hosting.every((r: any) => r.url === null)).toBe(true);
  });

  it('still loads on a client that predates the model, or when the link read fails for any other reason', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    m.links.set(key, { sessionKey: key, url: ZOOM, setById: 'admin1' });
    as('p1');
    m.accessor = false;
    expect((await sessions()).body.myBookings[0].joinUrl).toBeNull();
    m.accessor = true;
    m.failWith = { code: 'P1001' };
    const { status, body } = await sessions();
    expect(status).toBe(200);
    expect(body.myBookings[0].joinUrl).toBeNull();
  });

  it('still refuses a caller with no session', async () => {
    expect((await GET()).status).toBe(401);
  });

  // The page promises the shards back for an ended session only on the rule the wallet pays by (lib/wallet/dead-buys.ts).
  it('says per booking whether an ended session would be paid back: only when the links were read and this player has none', async () => {
    const key = SLOT().sessionKey;
    book('p1', key);
    as('p1');
    expect((await sessions()).body.myBookings[0]).toMatchObject({ joinUrl: null, noLinkRefund: true });
    post(key);
    expect((await sessions()).body.myBookings[0]).toMatchObject({ joinUrl: ZOOM, noLinkRefund: false });
    m.links.clear();
    m.linkTable = false; // unreadable: nothing is promised, since the wallet pays nothing back until it can read them
    expect((await sessions()).body.myBookings[0]).toMatchObject({ joinUrl: null, noLinkRefund: false });
    m.linkTable = true;
    m.accessor = false;
    expect((await sessions()).body.myBookings[0]).toMatchObject({ joinUrl: null, noLinkRefund: false });
  });
});

describe('GET /api/v1/sessions: the bookings that carry a link', () => {
  it('lists the sessions still to come, so a regular\'s newest booking comes back with its link whatever they booked before', async () => {
    const key = SLOT().sessionKey;
    for (let i = 0; i < 25; i++) book('p1', `gw_2026-0${1 + (i % 8)}-${String(10 + i).padStart(2, '0')}`, 'confirmed', new Date(Date.now() - (i + 2) * 86_400_000));
    book('p1', key);
    post(key);
    as('p1');
    const { body } = await sessions();
    expect(body.myBookings).toHaveLength(1);
    expect(body.myBookings[0]).toMatchObject({ sessionKey: key, joinUrl: ZOOM });
  });

  it('keeps a session listed while it runs, and drops it once the longest session would be over', async () => {
    book('p1', 'gw_2026-09-24', 'confirmed', new Date(Date.now() - 30 * 60_000));
    book('p1', 'gw_2026-09-23', 'confirmed', new Date(Date.now() - 61 * 60_000));
    as('p1');
    expect((await sessions()).body.myBookings.map((b: Row) => b.sessionKey)).toEqual(['gw_2026-09-24']);
  });

  // Owner decision 2026-09-25: the wallet pays back a booking whose session ended with no link and marks it refunded.
  it('does not list a booking the wallet refunded, even one still inside the running window', async () => {
    const key = SLOT().sessionKey;
    book('p1', 'pv_2026-09-25_09', 'refunded', new Date(Date.now() - 50 * 60_000));
    book('p1', key);
    post(key);
    as('p1');
    const { body } = await sessions();
    expect(body.myBookings.map((b: Row) => b.sessionKey)).toEqual([key]);
    as('admin1');
    expect((await sessions()).body.hosting.some((r: Row) => r.sessionKey === 'pv_2026-09-25_09')).toBe(false);
  });

  function post(key: string, url = ZOOM) { m.links.set(key, { sessionKey: key, url, setById: 'admin1' }); }
});

describe('a private 1-on-1 holds one player', () => {
  const PV = () => privateSlots(new Date(), 8)[0];
  const bookPrivate = (userId: string, sessionKey = PV().sessionKey) => {
    as(userId);
    return BOOK(new Request('http://fel.test/api/v1/sessions/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotency_key: `k_${userId}`, kind: 'private_1on1', sessionKey }),
    }) as never);
  };

  it('refuses a second player\'s booking of a taken slot with 409 slot_taken, before anything is charged', async () => {
    expect((await bookPrivate('p1')).status).toBe(200);
    expect(m.spent.map((c) => c.playerId)).toEqual(['p1']);
    const res = await bookPrivate('p2');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'slot_taken' });
    expect(m.spent.map((c) => c.playerId)).toEqual(['p1']);
    expect(m.bookings.filter((b) => b.sessionKey === PV().sessionKey).map((b) => b.userId)).toEqual(['p1']);
  });

  it('answers the holder booking again as already booked, not taken', async () => {
    await bookPrivate('p1');
    const res = await bookPrivate('p1');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ booked: true, alreadyBooked: true });
    expect(m.spent).toHaveLength(1);
  });

  it('a cancelled booking does not hold the slot', async () => {
    book('p3', PV().sessionKey, 'cancelled', new Date(PV().startsAtIso));
    expect((await bookPrivate('p2')).status).toBe(200);
  });

  it('no longer offers a slot somebody else holds, and still shows the holder their own', async () => {
    const [first, second] = privateSlots(new Date(), 8);
    book('p1', first.sessionKey, 'confirmed', new Date(first.startsAtIso));
    as('p2');
    const other = (await sessions()).body;
    expect(other.private.map((s: Row) => s.sessionKey)).not.toContain(first.sessionKey);
    expect(other.private.map((s: Row) => s.sessionKey)).toContain(second.sessionKey);
    expect(other.private).toHaveLength(4);
    as('p1');
    expect((await sessions()).body.private.map((s: Row) => s.sessionKey)).toContain(first.sessionKey);
  });

  it('when two bookings raced and both landed, only the first booker gets the link', async () => {
    const slot = PV();
    book('p1', slot.sessionKey, 'confirmed', new Date(slot.startsAtIso));
    book('p2', slot.sessionKey, 'confirmed', new Date(slot.startsAtIso));
    m.links.set(slot.sessionKey, { sessionKey: slot.sessionKey, url: ZOOM, setById: 'admin1' });
    as('p1');
    expect((await sessions()).body.myBookings[0]).toMatchObject({ sessionKey: slot.sessionKey, joinUrl: ZOOM });
    as('p2');
    const res = await GET();
    const text = await res.text();
    // the second booker never sees the link, so the wallet pays their ended session back, and the page says so
    expect(JSON.parse(text).myBookings[0]).toMatchObject({ sessionKey: slot.sessionKey, joinUrl: null, noLinkRefund: true });
    expect(text).not.toContain('zoom.us');
    as('admin1');
    expect((await sessions()).body.hosting.find((r: Row) => r.sessionKey === slot.sessionKey)).toMatchObject({ booked: 2, url: ZOOM });
  });
});
