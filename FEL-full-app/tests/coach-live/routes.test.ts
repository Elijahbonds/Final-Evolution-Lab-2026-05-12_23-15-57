// COACH-LIVE (2026-10-25): the three live routes, run for real against an in-memory database and Controller Link's
// in-memory signal store. Only the session and the database are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: null as string | null, db: null as any }));
const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k) => h.db[k] }) }));

import { NextRequest } from 'next/server';
import { GET as joinGET } from '@/app/api/coach/live/route';
import { GET as pollGET, POST as signalPOST } from '@/app/api/coach/live/signal/route';
import { POST as summaryPOST } from '@/app/api/coach/live/summary/route';
import { clearGateCache } from '@/lib/coach/live/server';
import { getSignalStore } from '@/lib/controller-link/signalStore';

const YEAR = new Date().getUTCFullYear();

function memDb() {
  const t = {
    user: [{ id: 'coach1', dobYear: 1985 }, { id: 'client1', dobYear: 1995 }, { id: 'teen1', dobYear: YEAR - 15 }, { id: 'kid1', dobYear: YEAR - 11 }, { id: 'stranger', dobYear: 1990 }],
    coachingProgram: [
      { id: 'prog-adult', coachId: 'coach1', clientId: 'client1', isActive: true, createdAt: new Date('2026-09-01') },
      { id: 'prog-teen', coachId: 'coach1', clientId: 'teen1', isActive: true, createdAt: new Date('2026-09-01') },
      { id: 'prog-kid', coachId: 'coach1', clientId: 'kid1', isActive: true, createdAt: new Date('2026-09-01') },
      { id: 'prog-ended', coachId: 'coach1', clientId: 'stranger', isActive: true, createdAt: new Date('2026-09-01') },
    ],
    coachClient: [
      { id: 'cc1', coachId: 'coach1', clientId: 'client1', endedAt: null },
      { id: 'cc2', coachId: 'coach1', clientId: 'teen1', endedAt: null },
      { id: 'cc3', coachId: 'coach1', clientId: 'kid1', endedAt: null },
      { id: 'cc4', coachId: 'coach1', clientId: 'stranger', endedAt: new Date('2026-10-01') },
    ],
    booking: [] as any[],
    guardianConsent: [{ menteeId: 'teen1', requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, menteeBirthYear: YEAR - 15 }],
    programMessage: [] as any[],
  };
  const match = (row: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => row[k] === v);
  return {
    t,
    user: { findUnique: async ({ where }: any) => t.user.find((u) => u.id === where.id) ?? null },
    coachingProgram: {
      findUnique: async ({ where }: any) => t.coachingProgram.find((p) => p.id === where.id) ?? null,
      findFirst: async ({ where }: any) => t.coachingProgram.find((p) => match(p, where)) ?? null,
    },
    coachClient: { findFirst: async ({ where }: any) => t.coachClient.find((c) => match(c, where)) ?? null },
    booking: { findUnique: async ({ where }: any) => t.booking.find((b) => b.id === where.id) ?? null },
    guardianConsent: { findMany: async ({ where }: any) => t.guardianConsent.filter((g) => g.menteeId === where.menteeId) },
    programMessage: { create: async ({ data }: any) => { const m = { id: `m${t.programMessage.length + 1}`, ...data }; t.programMessage.push(m); return m; } },
  };
}

const join = async (as: string, room: string) => { h.user = as; const r = await joinGET(new NextRequest(`http://x/api/coach/live?room=${room}`)); return { status: r.status, body: await r.json() }; };
const post = async (as: string, room: string, data: unknown) => { h.user = as; const r = await signalPOST(new NextRequest('http://x/api/coach/live/signal', { method: 'POST', body: JSON.stringify({ room, data }) })); return { status: r.status, body: await r.json() }; };
const poll = async (as: string, room: string, after = 0) => { h.user = as; const r = await pollGET(new NextRequest(`http://x/api/coach/live/signal?room=${room}&after=${after}`)); return { status: r.status, body: await r.json() }; };
const summary = async (as: string, room: string, body: object) => { h.user = as; const r = await summaryPOST(new NextRequest('http://x/api/coach/live/summary', { method: 'POST', body: JSON.stringify({ room, ...body }) })); return { status: r.status, body: await r.json() }; };

beforeEach(() => {
  h.db = memDb();
  cc.since = new Date('2026-01-01');
  clearGateCache();
  vi.stubEnv('NEXT_PUBLIC_COACH_LIVE_ENABLED', '1');
  vi.stubEnv('PARTY_TURN_URLS', '');
});

describe('the switch', () => {
  it('off: every live route is a 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_LIVE_ENABLED', '');
    expect((await join('coach1', 'p_prog-adult')).status).toBe(404);
    expect((await post('coach1', 'p_prog-adult', { kind: 'bye' })).status).toBe(404);
    expect((await poll('coach1', 'p_prog-adult')).status).toBe(404);
    expect((await summary('coach1', 'p_prog-adult', {})).status).toBe(404);
  });
});

describe('the door', () => {
  it('a live roster link opens for its coach and its client, with their roles and the ICE servers', async () => {
    const c = await join('coach1', 'p_prog-adult');
    expect(c).toMatchObject({ status: 200, body: { role: 'coach', clientVideo: true, clientBand: 'adult', recorded: false } });
    expect(c.body.iceServers[0].urls[0]).toMatch(/^stun:/);
    expect((await join('client1', 'p_prog-adult')).body.role).toBe('client');
  });
  it('a stranger, an ended link, a bad id: refused', async () => {
    expect((await join('stranger', 'p_prog-adult')).status).toBe(404);
    expect((await join('coach1', 'p_prog-ended')).body.error).toBe('roster_ended');
    expect((await join('coach1', 'p_../x')).status).toBe(404);
    h.user = null;
    expect((await joinGET(new NextRequest('http://x/api/coach/live?room=p_prog-adult'))).status).toBe(401);
  });
  it('a consented teen: pose + voice, no video; under 13: closed; teen consent not covering coach training: closed', async () => {
    expect((await join('coach1', 'p_prog-teen')).body).toMatchObject({ clientBand: 'teen', clientVideo: false });
    expect((await join('coach1', 'p_prog-kid')).body.error).toBe('under_13');
    clearGateCache(); cc.since = null;
    expect((await join('teen1', 'p_prog-teen')).body.error).toBe('guardian_consent_required');
  });
  it('a booked live session, through the coach store\'s rule', async () => {
    const now = Date.now();
    h.db.t.booking.push({ id: 'book-1', coachUserId: 'coach1', clientUserId: 'client1', status: 'PAID', kind: 'live_1on1', startsAt: new Date(now + 5 * 60_000), endsAt: new Date(now + 65 * 60_000) });
    h.db.t.booking.push({ id: 'book-2', coachUserId: 'coach1', clientUserId: 'client1', status: 'PAID', kind: 'live_1on1', startsAt: new Date(now + 3 * 3600_000), endsAt: new Date(now + 4 * 3600_000) });
    expect((await join('client1', 'b_book-1')).body.role).toBe('client');
    expect((await join('client1', 'b_book-2')).body.error).toBe('not_open_yet');
  });
});

describe('the signals', () => {
  it('pass from one role to the other; the server sets the sender; nobody else reads them', async () => {
    expect((await post('coach1', 'p_prog-adult', { kind: 'offer', sdp: 'v=0' })).status).toBe(200);
    expect((await post('client1', 'p_prog-adult', { kind: 'answer', sdp: 'v=0', from: 'coach' })).status).toBe(200);
    const toClient = await poll('client1', 'p_prog-adult');
    expect(toClient.body.messages.map((m: any) => m.data.kind)).toEqual(['offer']);
    const toCoach = await poll('coach1', 'p_prog-adult');
    expect(toCoach.body.messages.map((m: any) => m.data.kind)).toEqual(['answer']);
    expect((await poll('stranger', 'p_prog-adult')).status).toBe(404);
    expect((await post('stranger', 'p_prog-adult', { kind: 'ice' })).status).toBe(404);
  });
  it('only the known kinds, and bounded', async () => {
    expect((await post('coach1', 'p_prog-adult', { kind: 'chat', text: 'hi' })).status).toBe(400);
    expect((await post('coach1', 'p_prog-adult', { kind: 'offer', sdp: 'x'.repeat(70_000) })).status).toBe(413);
  });
  it('Controller Link\'s routes cannot reach a live room: its codes are upper-cased, ours have lower-case letters', async () => {
    await post('coach1', 'p_prog-adult', { kind: 'offer', sdp: 'v=0' });
    const store = getSignalStore();
    expect(await store.getRoom('live:program:prog-adult')).not.toBeNull();
    expect(await store.getRoom('live:program:prog-adult'.toUpperCase())).toBeNull();
  });
});

describe('the summary: the one row a live session writes', () => {
  const sum = { sets: [{ movement: 'squat', reps: 3, flagged: [{ rep: 2, faults: ['kneeValgus'], sides: { kneeValgus: 'left' } }] }] };
  it('the coach\'s End writes one thread message, worded by the server, once per page session', async () => {
    const r = await summary('coach1', 'p_prog-adult', { sessionId: 'sess-12345678', minutes: 20, summary: sum });
    expect(r).toMatchObject({ status: 200, body: { posted: true, programId: 'prog-adult' } });
    expect(r.body.text).toContain('Live session summary (20 min): 1 set, 3 reps, 1 flagged.');
    await summary('coach1', 'p_prog-adult', { sessionId: 'sess-12345678', minutes: 20, summary: sum });
    expect(h.db.t.programMessage).toHaveLength(1);
    expect(h.db.t.programMessage[0]).toMatchObject({ programId: 'prog-adult', authorId: 'coach1' });
  });
  it('the client cannot post one; a bad summary is refused; nothing else is written anywhere', async () => {
    expect((await summary('client1', 'p_prog-adult', { sessionId: 'sess-12345678', summary: sum })).body.error).toBe('coach_only');
    expect((await summary('coach1', 'p_prog-adult', { sessionId: 'sess-12345678', summary: { sets: [{ movement: 'squat', reps: 3, flagged: [{ rep: 1, faults: ['<script>'] }] }] } })).status).toBe(400);
    expect(h.db.t.programMessage).toHaveLength(0);
  });
});
