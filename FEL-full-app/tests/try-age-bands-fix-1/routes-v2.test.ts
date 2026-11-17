// TRY-AGE-BANDS-FIX-1 v2 (Cyber TRY-AGE-BANDS-FIX-1-v1-REVIEW-2026-11-16): N1 (a signed-out under-13 block cookie is refused on the
// challenge attempt) and N2 (no receipt, so no result link, when there is no user and no guest id). NEW tests only. The real attempt
// route; the cookie jar, session and challenge service are stand-ins (the routes.test.ts harness).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  session: null as { user?: { id?: string } } | null,
  attempts: [] as Array<Record<string, unknown>>,
  guestResults: [] as unknown[],
}));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined), set: () => {} }),
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => { throw new Error('no database in this test'); } }) }));
vi.mock('@/lib/guestSession', () => ({
  guestIdFrom: (jar: { get(n: string): { value: string } | undefined }) => { const t = jar.get('fel_guest')?.value; return t ? `h:${t}` : null; },
}));
vi.mock('@/lib/social/challenge-service', () => ({
  resolveAttempt: async (a: Record<string, unknown>) => {
    h.attempts.push(a);
    return {
      beat: false, margin: 0, targetScore: 1, vs: 't', rematch: null, convertToSignup: true, outcome: 'lost', attemptScore: a.attemptScore,
      modeKey: 'dunk', terms: {}, expiresAt: null, receipt: `RECEIPT-${String(a.userId ?? a.guestId ?? 'anon')}`,
    };
  },
  verifiedChallenge: async () => ({ link: { code: 'C1', modeKey: 'dunk' }, payload: { v: 2, modeKey: 'dunk', score: 1, tag: 't', ghost: [], t: Date.now() } }),
  CHALLENGE_EXPIRED: 'expired',
}));
vi.mock('@/lib/social/challenge-guest', () => ({ recordGuestResult: async (_db: unknown, _id: string, r: unknown) => { h.guestResults.push(r); } }));

import { POST as attemptPost } from '@/app/api/challenge/[code]/attempt/route';

const ORIGINAL = process.env.TRY_AGE_BANDS_ENABLED;
const GUEST = { fel_guest: 'G'.repeat(32) };
beforeEach(() => { h.cookies = {}; h.session = null; h.attempts = []; h.guestResults = []; process.env.TRY_AGE_BANDS_ENABLED = '1'; });
afterEach(() => { if (ORIGINAL === undefined) delete process.env.TRY_AGE_BANDS_ENABLED; else process.env.TRY_AGE_BANDS_ENABLED = ORIGINAL; });

const json = (body: unknown, url = 'http://fel.test/x') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const attempt = (body: unknown = { attemptScore: 70 }) => attemptPost(json(body), { params: { code: 'C1' } });
const FORGED = { age: 40, ageBand: '18+', band: '18+', birthDate: '1980-01-01', birthYear: 1980, adult: true, isAdult: true };

describe('N1 — the under-13 block cookie (fel_age_gate) is refused on the challenge attempt, as the teen flag is', () => {
  it('signed out + fel_age_gate: 403, nothing resolved or stored, no guest result kept', async () => {
    h.cookies = { fel_age_gate: '1' };
    const res = await attempt();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(h.attempts).toEqual([]);
    expect(h.guestResults).toEqual([]);
  });

  it('with a guest cookie as well, and with the teen flag as well: still 403, nothing resolved', async () => {
    h.cookies = { fel_age_gate: '1', ...GUEST };
    expect((await attempt()).status).toBe(403);
    h.cookies = { fel_age_gate: '1', fel_try_minor: '1', ...GUEST };
    expect((await attempt()).status).toBe(403);
    expect(h.attempts).toEqual([]);
  });

  it('flag OFF: exactly today (a blocked browser\'s attempt still resolves, with no guest id; tests/guest-token-hash/routes.test.ts pins it)', async () => {
    delete process.env.TRY_AGE_BANDS_ENABLED;
    h.cookies = { fel_age_gate: '1', ...GUEST };
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(1);
    expect(h.attempts[0]).toMatchObject({ userId: null, guestId: null });
  });

  it('a forged age field in the body or the query changes nothing: still 403 for the blocked browser', async () => {
    h.cookies = { fel_age_gate: '1' };
    expect((await attemptPost(json({ attemptScore: 70, ...FORGED }, 'http://fel.test/x?ageBand=18%2B&age=40&birthDate=1980-01-01'), { params: { code: 'C1' } })).status).toBe(403);
    expect(h.attempts).toEqual([]);
  });

  it('controls: no cookie -> 200 and one attempt; a signed-in user is decided by their account, not this browser\'s cookie', async () => {
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(1);
    h.session = { user: { id: 'u1' } };
    h.cookies = { fel_age_gate: '1' };
    expect((await attempt()).status).toBe(200);
    expect(h.attempts).toHaveLength(2);
    expect(h.attempts[1]).toMatchObject({ userId: 'u1' });
  });
});

describe('N2 — no receipt (so no result link) when there is no user and no guest id', () => {
  it('flag on, signed out, no guest cookie: 200 with the outcome and score, and NO receipt', async () => {
    const res = await attempt();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ outcome: 'lost', attemptScore: 70, targetScore: 1 });
    expect('receipt' in j).toBe(false);
    expect(JSON.stringify(j)).not.toContain('RECEIPT');
    expect(h.attempts[0]).toMatchObject({ userId: null, guestId: null });
    expect(h.guestResults).toEqual([]);
  });

  it('flag on: a guest with a guest id gets its receipt (and its result kept) as before', async () => {
    h.cookies = { ...GUEST };
    const j = await (await attempt()).json();
    expect(j.receipt).toBe(`RECEIPT-h:${'G'.repeat(32)}`);
    expect(h.guestResults).toHaveLength(1);
  });

  it('flag on: a signed-in user gets its receipt as before', async () => {
    h.session = { user: { id: 'u1' } };
    expect((await (await attempt()).json()).receipt).toBe('RECEIPT-u1');
  });

  it('flag off: exactly today (a receipt is issued even with no user and no guest id)', async () => {
    delete process.env.TRY_AGE_BANDS_ENABLED;
    expect((await (await attempt()).json()).receipt).toBe('RECEIPT-anon');
  });
});
