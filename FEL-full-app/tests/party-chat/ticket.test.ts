// PARTY-CHAT (2026-10-13): who the party server is told is an adult. The app decides it from User.dobYear IN THE
// DATABASE by the STRICT rule, signs it, and netd verifies it — so these tests are the age gate's first half.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTicket } from '@/lib/party/social/ticketServer';
import { partyIceServers } from '@/lib/party/social/iceServers';
import { verifyTicket } from '@/server/netd/src/ticket';
import { createHmac } from 'node:crypto';

const NOW = new Date('2026-10-13T12:00:00Z').getTime();
const Y = 2026;

describe('buildTicket', () => {
  const base = { userId: 'u1', name: 'ana', secret: 's', now: NOW };
  it('a verified adult (year gap > 18) gets an adult ticket netd accepts', () => {
    const t = buildTicket({ ...base, dobYear: Y - 30 });
    expect(t.adult).toBe(true);
    expect(verifyTicket(t.ticket, 's', NOW)).toMatchObject({ uid: 'u1', adult: true, name: 'ANA' });
  });
  it('an exactly-18 gap is NOT verified 18+ (the strict rule): teen rules', () => {
    expect(buildTicket({ ...base, dobYear: Y - 18 }).adult).toBe(false);
    expect(verifyTicket(buildTicket({ ...base, dobYear: Y - 18 }).ticket, 's', NOW)).toMatchObject({ adult: false });
  });
  it('unknown age, a teen, a guest: never adult', () => {
    expect(buildTicket({ ...base, dobYear: null }).adult).toBe(false);
    expect(buildTicket({ ...base, dobYear: Y - 15 }).adult).toBe(false);
    expect(buildTicket({ ...base, userId: null, dobYear: Y - 40 })).toEqual({ ticket: null, adult: false, configured: true });
  });
  it('no secret: no ticket, so netd applies teen rules to everyone', () => {
    expect(buildTicket({ ...base, secret: undefined, dobYear: Y - 40 })).toEqual({ ticket: null, adult: false, configured: false });
  });
});

describe('partyIceServers (relay-ready)', () => {
  it('STUN only by default', () => {
    expect(partyIceServers({} as NodeJS.ProcessEnv, NOW)).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });
  it('a TURN relay with a short-lived credential — never the secret itself', () => {
    const s = partyIceServers({ PARTY_TURN_URLS: 'turn:t.example:3478, turns:t.example:5349', PARTY_TURN_SECRET: 'sek' } as unknown as NodeJS.ProcessEnv, NOW);
    expect(s[1].urls).toEqual(['turn:t.example:3478', 'turns:t.example:5349']);
    expect(s[1].credential).not.toBe('sek');
    expect(s[1].credential).toBe(createHmac('sha1', 'sek').update(s[1].username!).digest('base64'));
    expect(Number(s[1].username!.split(':')[0])).toBeGreaterThan(NOW / 1000);
  });
});

const h = vi.hoisted(() => ({ session: null as unknown, dobYear: null as number | null, reads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: async () => { h.reads++; return { dobYear: h.dobYear }; } } } }));

describe('GET /api/party/ticket', () => {
  beforeEach(() => { h.session = null; h.dobYear = null; h.reads = 0; process.env.PARTY_TICKET_SECRET = 'route-secret'; });
  const call = async (q = '?name=ana') => {
    const { GET } = await import('@/app/api/party/ticket/route');
    return (await GET(new Request(`http://x/api/party/ticket${q}`))).json();
  };
  it('reads the age from the database, never the request', async () => {
    h.session = { user: { id: 'u9' } }; h.dobYear = 1980;
    const j = await call('?name=ana&adult=true&dobYear=1950');
    expect(h.reads).toBe(1);
    expect(j.adult).toBe(true);
    expect(j.iceServers.length).toBeGreaterThan(0);
    // What this means, checked structurally (a substring test on random base64 / the hashed pub flaked, e.g. CI on #253):
    // the birth year never leaves the server — not in the response, not in the signed ticket's claims — and outside the
    // signed ticket (which netd needs, and verifies, to know the uid) the response never echoes the user id.
    const { ticket, ...rest } = j as { ticket: string } & Record<string, unknown>;
    const values = (o: unknown): unknown[] => (o && typeof o === 'object' ? Object.values(o).flatMap(values) : [o]);
    const keys = (o: unknown): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...keys(v)]) : []);
    expect(values(rest)).not.toContain('u9');
    expect(values(rest).map(String)).not.toContain('1980');
    // …and the original SUBSTRING bar, kept: a birth year or user id embedded in a longer string ('born 1980', 'hi u9') is a
    // leak too. Only the random fields are taken out first (the signed ticket, checked above and below, and the TURN
    // username / credential pair, an expiry + HMAC base64), so the check cannot flake on them and still sees everything else.
    const redacted = { ...rest, iceServers: (rest.iceServers as Array<Record<string, unknown>>).map(({ username: _u, credential: _c, ...ice }) => ice) };
    expect(JSON.stringify(redacted)).not.toContain('1980');
    expect(JSON.stringify(redacted)).not.toContain('u9');
    expect(keys(rest)).not.toEqual(expect.arrayContaining(['uid']));
    expect(keys(rest).filter((k) => /dob|birth|user_?id/i.test(k))).toEqual([]);
    const claims = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(claims.uid).toBe('u9');
    expect(values(claims).map(String)).not.toContain('1980');
    const { pub: _pub, exp: _exp, ...fixedClaims } = claims;   // pub is a hash and exp is the clock: the random parts
    expect(JSON.stringify(fixedClaims)).not.toContain('1980');
    expect(Object.keys(claims).filter((k) => /dob|birth|year/i.test(k))).toEqual([]);
    expect(verifyTicket(ticket, 'route-secret', Date.now())).toMatchObject({ uid: 'u9', adult: true });
  });
  it('a teen gets no ICE servers (no voice is ever offered)', async () => {
    h.session = { user: { id: 'u9' } }; h.dobYear = new Date().getFullYear() - 14;
    const j = await call();
    expect(j.adult).toBe(false);
    expect(j.iceServers).toEqual([]);
  });
  it('a guest gets no ticket and no database read', async () => {
    const j = await call();
    expect(j).toMatchObject({ ticket: null, adult: false, signedIn: false });
    expect(h.reads).toBe(0);
  });
});
