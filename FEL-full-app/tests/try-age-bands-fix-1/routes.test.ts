// TRY-AGE-BANDS-FIX-1 (Cyber TRY-AGE-BANDS-REVIEW 2026-11-09: F2 server backstops, F3, T-TRYAGE-MINOR-COOKIE / T-TRYAGE-DIAG-LOCAL).
// NEW tests only. The real routes (POST /api/guest, /api/challenge/[code]/attempt, /api/analytics); the cookie jar, session,
// guest store, challenge service and analytics writer are stand-ins. TRY_AGE_BANDS_ENABLED gates every new server check.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  session: null as { user?: { id?: string } } | null,
  creates: [] as unknown[][],
  setCookies: [] as unknown[][],
  attempts: [] as Array<Record<string, unknown>>,
  rows: [] as any[],
  serverEvents: [] as unknown[],
}));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    set: () => {},
  }),
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => { throw new Error('no database in this test'); } }) }));
vi.mock('@/lib/guest', () => ({ hashGuestToken: (t: string) => `h:${t}`, mintGuestToken: () => 'T'.repeat(32) }));
vi.mock('@/lib/guestSession', () => ({
  createGuestSession: async (...a: unknown[]) => { h.creates.push(a.slice(1)); },
  findGuestSession: async () => null,
  guestTokenFrom: () => null,
  setGuestCookie: (...a: unknown[]) => { h.setCookies.push(a.slice(1)); },
  guestIdFrom: (jar: { get(n: string): { value: string } | undefined }) => { const t = jar.get('fel_guest')?.value; return t ? `h:${t}` : null; },
}));
vi.mock('@/lib/analytics-server', () => ({
  recordServerEvent: async (e: unknown) => { h.serverEvents.push(e); },
  recordServerEvents: async (rows: any[]) => { h.rows.push(...rows); },
}));
vi.mock('@/lib/social/challenge-service', () => ({
  resolveAttempt: async (a: Record<string, unknown>) => { h.attempts.push(a); return { beat: false }; },
  verifiedChallenge: async () => ({ link: { code: 'C1', modeKey: 'dunk' }, payload: { v: 2, modeKey: 'dunk', score: 1, tag: 't', ghost: [], t: Date.now() } }),
  CHALLENGE_EXPIRED: 'expired',
}));
vi.mock('@/lib/social/challenge-guest', () => ({ recordGuestResult: async () => {} }));

import { POST as guestPost } from '@/app/api/guest/route';
import { POST as attemptPost } from '@/app/api/challenge/[code]/attempt/route';
import { POST as analyticsPost } from '@/app/api/analytics/route';

const ORIGINAL = process.env.TRY_AGE_BANDS_ENABLED;
const MINOR = { fel_try_minor: '1' };
beforeEach(() => {
  h.cookies = {}; h.session = null; h.creates = []; h.setCookies = []; h.attempts = []; h.rows = []; h.serverEvents = [];
  process.env.TRY_AGE_BANDS_ENABLED = '1';
});
afterEach(() => { if (ORIGINAL === undefined) delete process.env.TRY_AGE_BANDS_ENABLED; else process.env.TRY_AGE_BANDS_ENABLED = ORIGINAL; });

const json = (body: unknown, url = 'http://fel.test/x') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const FORGED = { age: 40, ageBand: '18+', band: '18+', birthDate: '1980-01-01', birthYear: 1980, adult: true, isAdult: true };

describe('POST /api/guest (F2 backstop; under-13 refused server-side)', () => {
  it('flag on + fel_try_minor: 403, no guest row, no cookie', async () => {
    h.cookies = { ...MINOR };
    const res = await guestPost();
    expect(res.status).toBe(403);
    expect(h.creates).toEqual([]);
    expect(h.setCookies).toEqual([]);
  });

  it('a 12-year-old (the under-13 block cookie fel_age_gate): 403, no row, flag on or off', async () => {
    h.cookies = { fel_age_gate: '1' };
    expect((await guestPost()).status).toBe(403);
    delete process.env.TRY_AGE_BANDS_ENABLED;
    expect((await guestPost()).status).toBe(403);
    expect(h.creates).toEqual([]);
    expect(h.setCookies).toEqual([]);
  });

  it('control: no flag cookie -> 200 and exactly one row (so the 403 above is the cookie, not the mocks)', async () => {
    const res = await guestPost();
    expect(res.status).toBe(200);
    expect(h.creates).toHaveLength(1);
    expect(h.setCookies).toHaveLength(1);
  });

  it('a forged age field is ignored: the route reads only the cookies (the same answer with or without forged query/body fields)', async () => {
    // A forged field cannot unlock a minor: the route takes no request at all (POST() reads cookies only).
    expect(guestPost.length).toBe(0);
    h.cookies = { ...MINOR };
    expect((await (guestPost as unknown as (r: Request) => Promise<Response>)(json(FORGED, 'http://fel.test/api/guest?ageBand=18%2B&age=40&birthDate=1980-01-01'))).status).toBe(403);
    expect(h.creates).toEqual([]);
    // and a forged field on an unflagged browser is never stored
    h.cookies = {};
    await (guestPost as unknown as (r: Request) => Promise<Response>)(json(FORGED, 'http://fel.test/api/guest?ageBand=18%2B'));
    expect(JSON.stringify(h.creates)).not.toMatch(/1980|18\+|ageBand|isAdult/);
  });

  it('flag OFF: the minor cookie is not read (today\'s behaviour, one row)', async () => {
    delete process.env.TRY_AGE_BANDS_ENABLED;
    h.cookies = { ...MINOR };
    expect((await guestPost()).status).toBe(200);
    expect(h.creates).toHaveLength(1);
  });
});

describe('POST /api/challenge/[code]/attempt (F2): a minor posts no attempt', () => {
  const attempt = (body: unknown = { attemptScore: 70 }) => attemptPost(json(body), { params: { code: 'C1' } });

  it('flag on + fel_try_minor, signed out: 403, nothing resolved or stored', async () => {
    h.cookies = { ...MINOR, fel_guest: 'G'.repeat(32) };
    const res = await attempt();
    expect(res.status).toBe(403);
    expect(h.attempts).toEqual([]);
  });

  it('a forged age field in the body or the query changes nothing: still 403 for the flagged browser, never read for anyone', async () => {
    h.cookies = { ...MINOR };
    expect((await attemptPost(json({ attemptScore: 70, ...FORGED }, 'http://fel.test/x?ageBand=18%2B&age=40'), { params: { code: 'C1' } })).status).toBe(403);
    expect(h.attempts).toEqual([]);
    h.cookies = {};
    expect((await attemptPost(json({ attemptScore: 70, ...FORGED }), { params: { code: 'C1' } })).status).toBe(200);
    expect(JSON.stringify(h.attempts)).not.toMatch(/1980|ageBand|isAdult/);
  });

  it('control: no cookie -> the attempt resolves; flag OFF with the cookie -> resolves (today); a signed-in user is decided by their account, not this browser flag', async () => {
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(1);
    delete process.env.TRY_AGE_BANDS_ENABLED;
    h.cookies = { ...MINOR };
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(2);
    process.env.TRY_AGE_BANDS_ENABLED = '1';
    h.session = { user: { id: 'u1' } };
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(3);
  });
});

describe('POST /api/analytics (F2 drop, F3 game_diag stored anonymously)', () => {
  const post = (events: unknown[]) => analyticsPost(new Request('http://x/api/analytics', { method: 'POST', body: JSON.stringify({ events }) }));
  const EVENTS = [
    { name: 'session_start', props: { mode: 'dunk' }, ts: 1, sessionKey: 'page-1' },
    { name: 'game_diag', props: { kind: 'frame', mode: 'dunk', detail: 'x' }, ts: 2, sessionKey: 'page-1' },
    { name: 'game_diag', props: { kind: 'fps', mode: 'dunk', detail: 'w=1' }, ts: 3, sessionKey: 'page-1' },
  ];
  const shape = () => h.rows.map((r) => [r.name, r.props?.kind ?? null, r.userId ?? null, r.guestId ?? null, r.sessionKey ?? null]);

  it('flag on + fel_try_minor, signed out: only anonymous rows are kept (no user, guest or page key); the session_start is dropped', async () => {
    h.cookies = { ...MINOR, fel_guest: 'G'.repeat(32) };
    expect((await post(EVENTS)).status).toBe(204);
    expect(shape()).toEqual([['game_diag', 'frame', null, null, null], ['game_diag', 'fps', null, null, null]]);
  });

  it('F3: flag on, a signed-out guest page (no minor flag): game_diag rows carry no guest id or page key; other rows keep theirs', async () => {
    h.cookies = { fel_guest: 'G'.repeat(32) };
    await post(EVENTS);
    expect(shape()).toEqual([
      ['session_start', null, null, `h:${'G'.repeat(32)}`, 'page-1'],
      ['game_diag', 'frame', null, null, null],
      ['game_diag', 'fps', null, null, null],
    ]);
  });

  it('the block cookie (under-13) still drops a signed-out batch whole', async () => {
    h.cookies = { fel_age_gate: '1', ...MINOR };
    await post(EVENTS);
    expect(h.rows).toEqual([]);
  });

  it('a signed-in page is untouched by both (rows keep the user id and page key, except fps/ttfp as before)', async () => {
    h.session = { user: { id: 'u1' } }; h.cookies = { ...MINOR };
    await post(EVENTS);
    expect(shape()).toEqual([
      ['session_start', null, 'u1', null, 'page-1'],
      ['game_diag', 'frame', 'u1', null, 'page-1'],
      ['game_diag', 'fps', null, null, null],
    ]);
  });

  it('flag OFF: exactly today (a guest page keeps its guest id on a non-perf game_diag; the minor cookie is not read)', async () => {
    delete process.env.TRY_AGE_BANDS_ENABLED;
    h.cookies = { ...MINOR, fel_guest: 'G'.repeat(32) };
    await post(EVENTS);
    expect(shape()).toEqual([
      ['session_start', null, null, `h:${'G'.repeat(32)}`, 'page-1'],
      ['game_diag', 'frame', null, `h:${'G'.repeat(32)}`, 'page-1'],
      ['game_diag', 'fps', null, null, null],
    ]);
  });
});
