// ECONOMY-SESSIONS-HARDEN (2026-09-28): POST /api/sessions/start and the eligibility it decides, DRIVEN (no database).
//
// The run's payoutEligible is decided HERE, once, from signals the server controls — ?agent=1 (query, header, the page's
// own URL), the playtest flag or a /dev/ page, and the account's server-side test allowlist (User.role, FEL_TEST_ACCOUNTS)
// — and stored on the run; the finish never re-reads a client flag (lib/sessions-route.test.ts FIX 3 drives that side).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideRunEligibility, isTestAccount, TEST_ROLES } from './runEligibility';
import { RUN_GRACE_MS, MAX_DURATION_FLOOR_MS, ruleFor } from './modeScoreRules';

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'player@example.test', role: 'player' } as Record<string, unknown> | null,
  created: [] as Array<Record<string, unknown>>,
  swept: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  signedIn: true,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => (h.signedIn ? { user: { id: 'u1', role: 'test' /* the token's copy is never read */ } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async () => (h.user ? { ...h.user } : null) },
    sessionRun: {
      updateMany: async (a: Record<string, unknown>) => { h.swept.push(a); return { count: 0 }; },
      create: async ({ data }: { data: Record<string, unknown> }) => { h.created.push(data); return { id: 'run_cuid_0001', ...data }; },
    },
  },
}));

import { POST } from '@/app/api/sessions/start/route';

async function start(body: unknown, o: { query?: string; headers?: Record<string, string> } = {}) {
  const req = new Request(`http://127.0.0.1:3100/api/sessions/start${o.query ?? ''}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(o.headers ?? {}) }, body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  h.user = { id: 'u1', email: 'player@example.test', role: 'player' };
  h.created = []; h.swept = []; h.events = [];
  h.signedIn = true;
  delete process.env.FEL_TEST_ACCOUNTS;
});

describe('POST /api/sessions/start', () => {
  it('signed out: 401, no run', async () => {
    h.signedIn = false;
    expect((await start({ mode: 'dunkContest' })).status).toBe(401);
    expect(h.created).toEqual([]);
  });

  it('a mode the catalogue does not know: 400 SCORE_INVALID unknown_mode, no run', async () => {
    for (const mode of ['', 'Music', 'notAMode', 42, null, 'x'.repeat(65)]) {
      const r = await start({ mode });
      expect(r.status, String(mode)).toBe(400);
      expect(r.body, String(mode)).toMatchObject({ ok: false, reason: 'SCORE_INVALID', detail: 'unknown_mode' });
    }
    expect(h.created).toEqual([]);
  });

  it('starts an eligible run on the server clock, expiring at the mode\'s longest run + the grace', async () => {
    const before = Date.now();
    const r = await start({ mode: 'dunkContest' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, runId: 'run_cuid_0001', modeSlug: 'dunkContest', payoutEligible: true, reason: null });
    const row = h.created[0];
    expect(row).toMatchObject({ userId: 'u1', mode: 'dunkContest', status: 'open', payoutEligible: true, ineligibleReason: null });
    const startedAt = (row.startedAt as Date).getTime();
    expect(startedAt).toBeGreaterThanOrEqual(before);
    const lifetime = (ruleFor('dunkContest')?.maxDurationMs ?? MAX_DURATION_FLOOR_MS) + RUN_GRACE_MS;
    expect((row.expiresAt as Date).getTime() - startedAt).toBe(lifetime);
    // the player's own stale open runs are closed as expired on the way in
    expect(h.swept[0]).toMatchObject({ where: { userId: 'u1', status: 'open' }, data: { status: 'expired' } });
  });

  it('an old spelling starts the run under the current key', async () => {
    expect((await start({ mode: 'musicAcademy' })).body).toMatchObject({ modeSlug: 'music' });
  });

  it('?agent=1 — on the request, as a header, or on the page that asked — is an AGENT run', async () => {
    for (const o of [{ query: '?agent=1' }, { headers: { 'x-fel-agent': '1' } }, { headers: { referer: 'http://127.0.0.1:3000/play/dunk?agent=1&court=venice' } }]) {
      h.created = [];
      const r = await start({ mode: 'dunkContest' }, o);
      expect(r.body, JSON.stringify(o)).toMatchObject({ payoutEligible: false, reason: 'AGENT' });
      expect(h.created[0], JSON.stringify(o)).toMatchObject({ payoutEligible: false, ineligibleReason: 'AGENT' });
    }
    expect(h.events.map((e) => e.name)).toEqual(['session_run_unpaid', 'session_run_unpaid', 'session_run_unpaid']);
  });

  it('the playtest flag, ?playtest=1 or a /dev/ page is a PLAYTEST run', async () => {
    for (const [body, o] of [
      [{ mode: 'dunkContest', playtest: true }, {}],
      [{ mode: 'dunkContest' }, { query: '?playtest=1' }],
      [{ mode: 'brainBrawl' }, { headers: { referer: 'http://127.0.0.1:3100/dev/brainbrawl' } }],
    ] as const) {
      expect((await start(body, o)).body, JSON.stringify(o)).toMatchObject({ payoutEligible: false, reason: 'PLAYTEST' });
    }
  });

  it('a test account (User.role, or the FEL_TEST_ACCOUNTS allowlist by id or email) is a TEST_ACCOUNT run', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    h.user = { id: 'u1', email: 'qa@example.test', role: 'qa' };
    expect((await start({ mode: 'dunkContest' })).body).toMatchObject({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
    h.user = { id: 'u1', email: 'QA.Bot@Example.test', role: 'player' };
    process.env.FEL_TEST_ACCOUNTS = ' someone-else , qa.bot@example.test ';
    expect((await start({ mode: 'dunkContest' })).body).toMatchObject({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
    process.env.FEL_TEST_ACCOUNTS = 'u1';
    h.user = { id: 'u1', email: null, role: 'player' };
    expect((await start({ mode: 'dunkContest' })).body).toMatchObject({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
  });

  it('nothing the player can edit decides it: body flags, a claimed role, the session token\'s role are all ignored', async () => {
    // the mocked session token says role 'test' — only the DATABASE row is read
    const r = await start({ mode: 'dunkContest', playtest: false, payoutEligible: false, role: 'test', user_metadata: { role: 'test', is_test_account: true }, agent: 1 });
    expect(r.body).toMatchObject({ payoutEligible: true, reason: null });
    // and nothing turns an agent run back on
    const agent = await start({ mode: 'dunkContest', payoutEligible: true, agent: 0 }, { query: '?agent=1' });
    expect(agent.body).toMatchObject({ payoutEligible: false, reason: 'AGENT' });
  });
});

describe('decideRunEligibility (pure)', () => {
  const headers = (o: Record<string, string> = {}) => new Headers(o);
  const user = { id: 'u1', email: 'p@example.test', role: 'player' };

  it('the order is AGENT, PLAYTEST, TEST_ACCOUNT, and anything else pays', () => {
    const all = { url: 'http://x/api/sessions/start?agent=1&playtest=1', headers: headers(), body: { playtest: true }, user: { ...user, role: 'test' } };
    expect(decideRunEligibility(all)).toEqual({ payoutEligible: false, reason: 'AGENT' });
    expect(decideRunEligibility({ ...all, url: 'http://x/api/sessions/start?playtest=1' })).toEqual({ payoutEligible: false, reason: 'PLAYTEST' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(decideRunEligibility({ ...all, url: 'http://x/api/sessions/start', body: {} })).toEqual({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
    vi.stubEnv('NODE_ENV', 'test');
    expect(decideRunEligibility({ url: 'http://x/api/sessions/start', headers: headers(), body: {}, user })).toEqual({ payoutEligible: true, reason: null });
  });

  it('only exact "1" / "true" count; agent=0, a garbage Referer or a missing user change nothing', () => {
    expect(decideRunEligibility({ url: 'http://x/s?agent=0', headers: headers({ 'x-fel-agent': 'yes', referer: '::not a url::' }), body: null, user: null }))
      .toEqual({ payoutEligible: true, reason: null });
  });

  it('the test roles, case-insensitive; an empty allowlist lists nobody on local', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const role of TEST_ROLES) expect(isTestAccount({ id: 'u', role: role.toUpperCase() }), role).toBe(true);
    vi.stubEnv('NODE_ENV', 'test');
    expect(isTestAccount({ id: 'u', role: 'player' }, { FEL_TEST_ACCOUNTS: '' })).toBe(false);
    expect(isTestAccount({ id: 'u', role: 'coach' }, { FEL_TEST_ACCOUNTS: ' , ' })).toBe(false);
    expect(isTestAccount(null, { FEL_TEST_ACCOUNTS: 'u' })).toBe(false);
  });
});
