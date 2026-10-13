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
    expect(JSON.stringify(j)).not.toContain('1980');
    expect(JSON.stringify(j)).not.toContain('u9');
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
