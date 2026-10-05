// AGE-SCREEN: POST /api/signup refuses a missing or under-13 year before any write, and stores the year for 13+.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: null as any,
  db: null as any,
  cookie: null as string | null,
  events: [] as unknown[],
  emails: [] as unknown[],
  grants: [] as unknown[],
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: unknown) => { h.events.push(e); } }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: (...a: unknown[]) => { h.emails.push(a); } }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: async (_db: unknown, a: unknown) => { h.grants.push(a); return { balanceAfter: 500 }; } }));

import { POST } from '@/app/api/signup/route';
import { argsOf, newSpyDb, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const THIS_YEAR = new Date().getFullYear();
const CUTOFF = /\b(13|18)\b|old enough|kids|kid|child|parent|adult|minor/i;

function body(extra: Record<string, unknown> = {}) {
  return { email: 'new@fel.test', password: 'secret1', name: 'A', ...extra };
}
async function post(payload: unknown) {
  const req = new Request('http://fel.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'age-screen-test' },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json, cookie: res.headers.get('set-cookie') };
}
function noTrace() {
  expect(writesOf(h.db as SpyDb)).toEqual([]);
  expect(h.events).toEqual([]);
  expect(h.emails).toEqual([]);
  expect(h.grants).toEqual([]);
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    h.db = newSpyDb();
    h.prisma = spyPrisma(h.db);
    h.cookie = null;
    h.events = [];
    h.emails = [];
    h.grants = [];
  });

  it('missing birthYear → 400, zero writes', async () => {
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).not.toMatch(CUTOFF);
    noTrace();
  });

  it.each([12, 13])('under 13 (thisYear−%s) → 403, zero prisma writes, no welcome email, no recordServerEvent, Set-Cookie fel_age_gate', async (gap) => {
    const r = await post(body({ birthYear: THIS_YEAR - gap }));
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'age_screen_blocked' });
    expect(r.cookie).toContain('fel_age_gate=1');
    expect(JSON.stringify(r.json)).not.toMatch(CUTOFF);
    noTrace();
  });

  it('a second submission with the cookie and an adult year → 403, zero writes', async () => {
    h.cookie = '1';
    const r = await post(body({ birthYear: 1990, email: 'adult@fel.test' }));
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'age_screen_blocked' });
    expect(r.cookie).toBeNull();
    noTrace();
  });

  it.each([14, 15, 17])('13+ (thisYear−%s) → 200 and user.create data has dobYear = the submitted year', async (gap) => {
    const year = THIS_YEAR - gap;
    const r = await post(body({ birthYear: year, email: `teen${gap}@fel.test` }));
    expect(r.status).toBe(200);
    expect(argsOf(h.db, 'user.create')[0].data.dobYear).toBe(year);
    expect(JSON.stringify(r.json)).not.toMatch(CUTOFF);
  });

  it('1990 → 200 and user.create data has dobYear = 1990', async () => {
    const r = await post(body({ birthYear: 1990, email: 'adult@fel.test' }));
    expect(r.status).toBe(200);
    expect(argsOf(h.db, 'user.create')[0].data.dobYear).toBe(1990);
    expect(h.grants).toEqual([expect.objectContaining({ delta: 500, reasonCode: 'WELCOME_GRANT' })]);
  });
});
