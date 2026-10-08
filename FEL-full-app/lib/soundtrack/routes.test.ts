// CREATOR SOUNDTRACK pieces B and L: the catalogue route and the play-count route, database and session stood in.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rightsRecord } from './rights';

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
  guest: undefined as string | undefined,
  cards: [] as any[],
  events: [] as any[],
  raw: [] as unknown[],
  findManyArgs: [] as any[],
  throwOnFind: false,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: (n: string) => (n === 'fel_guest' && h.guest ? { value: h.guest } : undefined) }) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    creativeCard: {
      findMany: async (a: any) => { h.findManyArgs.push(a); if (h.throwOnFind) throw new Error('db down'); return h.cards; },
      findFirst: async (a: any) => h.cards.find((c) => c.id === a.where.id && c.isPublic && c.reviewState === 'approved') ?? null,
    },
    analyticsEvent: {
      findFirst: async (a: any) => h.events.find((e) => e.name === a.where.name && e.props.trackId === a.where.props.equals
        && (a.where.userId ? e.userId === a.where.userId : e.guestId === a.where.guestId) && e.ts >= a.where.createdAt.gte) ?? null,
      create: async ({ data }: any) => { h.events.push(data); return data; },
    },
    $executeRaw: async (...a: unknown[]) => { h.raw.push(a); return 1; },
  },
}));

import { GET as catalogueGET } from '@/app/api/v1/soundtrack/route';
import { POST as playPOST } from '@/app/api/v1/soundtrack/[id]/play/route';
import { invalidateCatalogue } from './catalogue-server';

const PUB = 'https://storage.googleapis.com/fel-creator-public/tracks/u/a.mp3';
const card = (over: Record<string, unknown> = {}) => ({
  id: 'c1', title: 'Night Drive', primary: 'music', reviewState: 'approved', isPublic: true,
  art: { kind: 'music', mixUrl: PUB, mime: 'audio/mpeg', durationSec: 120, loudnessLufs: -12, rights: rightsRecord(), stemUrls: [], bpm: 100, keySignature: 'C', coverArtUrl: '', trackId: 't' },
  stats: { soundtrack: { rotation: 'on' }, review: { note: 'secret' }, plays: 5 },
  owner: { name: 'Ada', dobYear: 1990, creatorCards: [{ slug: 'ada', displayName: 'Ada' }] },
  ...over,
});
const play = (id: string, heardSec: number) => playPOST(new NextRequest(`http://localhost/api/v1/soundtrack/${id}/play`, { method: 'POST', body: JSON.stringify({ heardSec }) }), { params: { id } });

beforeEach(() => {
  h.session = null; h.guest = undefined; h.cards = [card()]; h.events = []; h.raw = []; h.findManyArgs = []; h.throwOnFind = false;
  invalidateCatalogue();
});

describe('GET /api/v1/soundtrack', () => {
  it('house + in-rotation cards, slim, CDN-cached, filtered to adults in rotation at the query', async () => {
    const res = await catalogueGET();
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600');
    const body = await res.json();
    expect(body.tracks).toHaveLength(7);
    const c = body.tracks[6];
    expect(c).toMatchObject({ id: 'card:c1', url: PUB, creator: { name: 'Ada', href: '/card/ada' }, plays: 5 });
    expect(JSON.stringify(body)).not.toContain('secret');
    const where = h.findManyArgs[0].where;
    expect(where).toMatchObject({ primary: 'music', isPublic: true, reviewState: 'approved' });
    expect(where.owner.dobYear.lte).toBe(new Date().getFullYear() - 19);
  });
  it('the database down: the house playlist still answers, briefly cached', async () => {
    h.throwOnFind = true;
    const res = await catalogueGET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60');
    expect((await res.json()).tracks).toHaveLength(6);
  });
});

describe('POST /api/v1/soundtrack/[id]/play', () => {
  it('under 30 s or nobody to dedupe against: not counted', async () => {
    h.session = { user: { id: 'u1' } };
    expect(await (await play('card:c1', 12)).json()).toEqual({ counted: false, reason: 'short' });
    h.session = null;
    expect(await (await play('card:c1', 40)).json()).toEqual({ counted: false, reason: 'anonymous' });
  });
  it('counts once per listener per track per day, atomically on the card', async () => {
    h.session = { user: { id: 'u1' } };
    expect(await (await play('card:c1', 31)).json()).toEqual({ counted: true });
    expect(h.raw).toHaveLength(1);
    expect(String((h.raw[0] as [TemplateStringsArray])[0].join('?'))).toContain('jsonb_set');
    expect(await (await play('card:c1', 90)).json()).toEqual({ counted: false, reason: 'today' });
    expect(h.raw).toHaveLength(1);
    h.session = null; h.guest = 'guest-token-abc';
    expect(await (await play('card:c1', 31)).json()).toEqual({ counted: true });
    expect(h.raw).toHaveLength(2);
  });
  it('yesterday\'s play does not block today\'s (the window is the UTC day)', async () => {
    h.session = { user: { id: 'u1' } };
    h.events.push({ name: 'soundtrack_play', userId: 'u1', props: { trackId: 'card:c1' }, ts: new Date(Date.now() - 26 * 3600_000) });
    expect(await (await play('card:c1', 31)).json()).toEqual({ counted: true });
  });
  it('house plays are recorded, never written to a card', async () => {
    h.session = { user: { id: 'u1' } };
    expect(await (await play('house:warmup', 31)).json()).toEqual({ counted: true });
    expect(h.raw).toHaveLength(0);
    expect(h.events[0]).toMatchObject({ name: 'soundtrack_play', userId: 'u1', props: { trackId: 'house:warmup' } });
  });
  it('a card the public may not hear, an unknown song or a bad id is not counted', async () => {
    h.session = { user: { id: 'u1' } };
    h.cards = [card({ isPublic: false })];
    expect((await play('card:c1', 31)).status).toBe(404);
    expect((await play('house:nope', 31)).status).toBe(404);
    expect((await play('card:..%2Fx', 31)).status).toBe(400);
    expect(h.raw).toHaveLength(0);
  });
});
