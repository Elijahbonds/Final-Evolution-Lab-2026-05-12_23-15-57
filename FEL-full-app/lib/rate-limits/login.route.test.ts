// RATE-LIMIT-WIRE (PR #289 QA rework): the credentials sign-in (POST /api/auth/callback/credentials) is limited per email
// and per the address the TRUSTED proxy set, in the shared rate_limits table, before NextAuth runs bcrypt. Past the limit
// it answers 429 in NextAuth's own `{ url }` shape so the login form's signIn() reads error 'RateLimited'.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable, hitsSent, type FakeRateLimitTable } from '@/tests/helpers/fakeRateLimitTable';

const h = vi.hoisted(() => ({ table: null as any, nextAuth: [] as Array<{ path: string; body: string }> }));
vi.mock('next-auth', () => ({
  // NextAuth itself is not under test: it records what reached it, body included, and answers as a sign-in does
  default: () => async (req: Request, ctx: { params: { nextauth: string[] } }) => {
    h.nextAuth.push({ path: ctx.params.nextauth.join('/'), body: req.method === 'POST' ? await req.text() : '' });
    return new Response(JSON.stringify({ url: 'http://fel.test/' }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.table[p].bind(h.table)) }),
}));

import { GET, POST } from '@/app/api/auth/[...nextauth]/route';
import { AUTH_RATE_LIMITED } from '@/lib/auth-errors';
import { RATE_LIMITS } from './policy';
import { resetRateLimitStore } from './store';

const PROXY_SET = '203.0.113.9';
let n = 0;
const spoofed = () => `198.51.100.${(n += 1) % 250}`;

function form(email: string) {
  return new URLSearchParams({ email, password: 'wrong-or-right', csrfToken: 'csrf', callbackUrl: '/', json: 'true' }).toString();
}
async function signIn(email: string, xff?: string, o: { json?: boolean; path?: string[] } = {}) {
  const body = o.json ? JSON.stringify({ email, password: 'x', csrfToken: 'csrf' }) : form(email);
  const path = o.path ?? ['callback', 'credentials'];
  const res = await POST(new Request(`http://fel.test/api/auth/${path.join('/')}`, {
    method: 'POST',
    headers: { 'content-type': o.json ? 'application/json' : 'application/x-www-form-urlencoded', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body,
  }), { params: { nextauth: path } });
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.table = fakeRateLimitTable();
  h.nextAuth = [];
  resetRateLimitStore();
  delete process.env.TRUSTED_PROXY_HOPS;
  delete process.env.NEXTAUTH_URL;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); delete process.env.TRUSTED_PROXY_HOPS; });

describe('POST /api/auth/callback/credentials rate limit', () => {
  it(`per email: ${RATE_LIMITS.login.email!.limit} sign-ins reach NextAuth in the window, then 429 with Retry-After`, async () => {
    const limit = RATE_LIMITS.login.email!.limit;
    for (let i = 0; i < limit; i++) expect((await signIn('pat@fel.test')).status).toBe(200);
    const refused = await signIn('pat@fel.test');
    expect(refused.status).toBe(429);
    expect(Number(refused.retryAfter)).toBe(900);
    expect(h.nextAuth).toHaveLength(limit);                       // the refused one never reached bcrypt
    // next-auth/react signIn() reads the error from the url's query: the form shows the rate-limit line, not "wrong password"
    expect(new URL(refused.body.url).searchParams.get('error')).toBe(AUTH_RATE_LIMITED);
    expect(refused.body.error).toBe('RateLimited');
  });

  it('SPOOFED X-Forwarded-For: a new client-written address on every try does not reset the email\'s count', async () => {
    const limit = RATE_LIMITS.login.email!.limit;
    for (let i = 0; i < limit; i++) expect((await signIn('pat@fel.test', spoofed())).status).toBe(200);
    expect((await signIn('pat@fel.test', `${spoofed()}, ${spoofed()}`)).status).toBe(429);
    expect([...h.table.rows.keys()].every((k: string) => k.startsWith('login:email:'))).toBe(true);
  });

  it('the email is counted as authorize() looks it up (lower case, trimmed), and a JSON body counts the same', async () => {
    const limit = RATE_LIMITS.login.email!.limit;
    for (let i = 0; i < limit; i++) await signIn(i % 2 ? '  Pat@FEL.test' : 'pat@fel.test', undefined, { json: i % 3 === 0 });
    expect((await signIn('PAT@fel.test ')).status).toBe(429);
  });

  it('TRUSTED_PROXY_HOPS=1: many emails from one proxy-set address share its allowance, whatever the client prepends', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    const limit = RATE_LIMITS.login.ip!.limit;
    for (let i = 0; i < limit; i++) expect((await signIn(`p${i}@fel.test`, `${spoofed()}, ${PROXY_SET}`)).status).toBe(200);
    expect((await signIn('new@fel.test', `${spoofed()}, ${PROXY_SET}`)).status).toBe(429);
    expect((await signIn('new@fel.test', `${spoofed()}, 203.0.113.77`)).status).toBe(200);
  });

  it('NextAuth gets the request body untouched (the limit reads a clone)', async () => {
    await signIn('pat@fel.test');
    expect(h.nextAuth[0]).toEqual({ path: 'callback/credentials', body: form('pat@fel.test') });
  });

  it('only the credentials sign-in is counted: sign-out, csrf and session never touch rate_limits', async () => {
    await signIn('pat@fel.test', undefined, { path: ['signout'] });
    await GET(new Request('http://fel.test/api/auth/session') as any, { params: { nextauth: ['session'] } } as any);
    await GET(new Request('http://fel.test/api/auth/csrf') as any, { params: { nextauth: ['csrf'] } } as any);
    expect(hitsSent(h.table as FakeRateLimitTable)).toEqual([]);
    expect(h.nextAuth.map((c) => c.path)).toEqual(['signout', 'session', 'csrf']);
  });

  it('the login form shows its own line for a rate-limited sign-in', () => {
    const src = readFileSync(join(process.cwd(), 'components/auth-form.tsx'), 'utf8');
    expect(src).toMatch(/result\.error\.includes\(AUTH_RATE_LIMITED\)\s*\n?\s*\?\s*'Too many sign-in attempts/);
  });
});

describe('login limit FAILS OPEN (lane/rate-limits): no table or no database never blocks a sign-in or answers 500', () => {
  it('table missing: sign-ins past the limit all reach NextAuth, one line is logged', async () => {
    (h.table as FakeRateLimitTable).missing = true;
    const limit = RATE_LIMITS.login.email!.limit;
    for (let i = 0; i < limit + 3; i++) expect((await signIn('early@fel.test')).status, `sign-in ${i + 1}`).toBe(200);
    expect(h.nextAuth).toHaveLength(limit + 3);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(['[rate-limits] table_missing_failing_open PrismaClientKnownRequestError P2010']);
  });

  it('database unreachable: the sign-in reaches NextAuth, and the line names no host', async () => {
    (h.table as FakeRateLimitTable).down = true;
    expect((await signIn('down@fel.test')).status).toBe(200);
    expect(h.nextAuth).toHaveLength(1);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] hit_failed_failing_open PrismaClientInitializationError');
  });
});
