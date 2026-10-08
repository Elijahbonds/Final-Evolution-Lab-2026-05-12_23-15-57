// COACH-AI Phase 8 (2026-10-07): the thread routes with the read markers, before and after the pending SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  session: null as unknown,
  column: false,
  messages: [] as { id: string; programId: string; authorId: string; body: string; createdAt: Date; readAt?: Date | null }[],
  executed: [] as unknown[][],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachingProgram: { findUnique: async ({ where }: any) => (where.id === 'p1' ? { id: 'p1', coachId: 'coach', clientId: 'teen' } : null) },
    programMessage: {
      findMany: async ({ orderBy, take }: any) => {
        const sorted = [...h.messages].sort((a, b) => +a.createdAt - +b.createdAt);
        if (orderBy.createdAt === 'desc') sorted.reverse();
        return sorted.slice(0, take).map(({ readAt: _r, ...m }) => m);
      },
    },
    async $queryRawUnsafe(q: string, ...v: unknown[]) {
      if (q.includes('information_schema')) return h.column ? [{ ok: 1 }] : [];
      if (!h.column) throw new Error('column "readAt" does not exist');
      if (q.startsWith('SELECT "id", "readAt"')) return h.messages.filter((m) => m.programId === v[0]).map((m) => ({ id: m.id, readAt: m.readAt ?? null }));
      if (q.includes('COUNT(*)')) return [{ programId: 'p1', n: h.messages.filter((m) => m.authorId !== v[0] && !m.readAt).length }];
      throw new Error('unexpected');
    },
    async $executeRawUnsafe(_q: string, ...v: unknown[]) { h.executed.push(v); return 1; },
  },
}));

import { GET as threadGET } from '@/app/api/coach/messages/route';
import { POST as readPOST } from '@/app/api/coach/messages/read/route';
import { GET as unreadGET } from '@/app/api/coach/messages/unread/route';
import { resetReadMarkerProbe } from './messageReads';

const get = (programId: string) => new NextRequest(`http://x/api/coach/messages?programId=${programId}`);
const post = (body: unknown) => new NextRequest('http://x/api/coach/messages/read', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  resetReadMarkerProbe();
  h.session = { user: { id: 'teen' } };
  h.column = false;
  h.executed = [];
  h.messages = Array.from({ length: 105 }, (_, i) => ({ id: `m${i}`, programId: 'p1', authorId: i % 2 ? 'teen' : 'coach', body: `msg ${i}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) }));
});

describe('GET /api/coach/messages', () => {
  it('the NEWEST 100, oldest first (it used to return the first 100, so message 101+ never showed)', async () => {
    const j = await (await threadGET(get('p1'))).json();
    expect(j.messages).toHaveLength(100);
    expect(j.messages[0].id).toBe('m5');
    expect(j.messages[99].id).toBe('m104');
  });

  it('without the column: 200, reads:false, no unread/readAt fields', async () => {
    const res = await threadGET(get('p1'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.reads).toBe(false);
    expect(j.messages.some((m: object) => 'unread' in m)).toBe(false);
  });

  it('with the column: unread flags for the other side\'s unread messages', async () => {
    h.column = true;
    h.messages[104].readAt = null; // m104 by coach
    const j = await (await threadGET(get('p1'))).json();
    expect(j.reads).toBe(true);
    expect(j.messages.at(-1)).toMatchObject({ id: 'm104', mine: false, unread: true });
    expect(j.messages.at(-2)).toMatchObject({ id: 'm103', mine: true, unread: false });
  });

  it('a stranger gets 403, signed out 401', async () => {
    h.session = { user: { id: 'stranger' } };
    expect((await threadGET(get('p1'))).status).toBe(403);
    h.session = null;
    expect((await threadGET(get('p1'))).status).toBe(401);
  });
});

describe('POST /api/coach/messages/read', () => {
  it('without the column: 200 { available:false }, nothing executed', async () => {
    const res = await readPOST(post({ programId: 'p1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, marked: 0 });
    expect(h.executed).toEqual([]);
  });

  it('with the column: marks as the signed-in member', async () => {
    h.column = true;
    expect(await (await readPOST(post({ programId: 'p1' }))).json()).toEqual({ available: true, marked: 1 });
    expect(h.executed).toEqual([['p1', 'teen']]);
  });

  it('a stranger cannot mark someone else\'s thread read (403); a missing program is 404; no id is 400', async () => {
    h.column = true;
    h.session = { user: { id: 'stranger' } };
    expect((await readPOST(post({ programId: 'p1' }))).status).toBe(403);
    expect((await readPOST(post({ programId: 'nope' }))).status).toBe(404);
    expect((await readPOST(post({}))).status).toBe(400);
    expect(h.executed).toEqual([]);
  });
});

describe('GET /api/coach/messages/unread', () => {
  it('without the column: { available:false } (the UI shows no count, not 0)', async () => {
    expect(await (await unreadGET()).json()).toEqual({ available: false });
  });
  it('with the column: counts', async () => {
    h.column = true;
    expect(await (await unreadGET()).json()).toMatchObject({ available: true, byProgram: { p1: 53 } });
  });
  it('signed out: 401', async () => {
    h.session = null;
    expect((await unreadGET()).status).toBe(401);
  });
});
