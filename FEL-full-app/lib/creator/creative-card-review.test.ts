// CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): who sees a creative card, who approves, what a public reader gets, and
// the four routes that enforce it ([id] GET, [id]/review, upload-url, review-queue), with the session, the database and
// the storage network stood in.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string; role?: string } } | null,
  users: new Map<string, { role?: string; dobYear?: number | null; name?: string }>(),
  cards: new Map<string, any>(),
  updates: [] as any[],
  findMany: [] as any[],
  reviewCalls: [] as any[],
  promoted: [] as unknown[],
  promoteThrows: false,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async ({ where }: any) => h.users.get(where.id) ?? null },
    creativeCard: {
      findUnique: async ({ where }: any) => h.cards.get(where.id) ?? null,
      update: async (a: any) => { h.updates.push(a); const r = { ...h.cards.get(a.where.id), ...a.data }; h.cards.set(a.where.id, r); return r; },
      findMany: async (a: any) => { h.findMany.push(a); return [...h.cards.values()].map((c) => ({ ...c, owner: h.users.get(c.ownerId) ?? null })); },
    },
  },
}));
vi.mock('@/lib/soundtrack/storage', async (orig) => {
  const real = await orig<typeof import('@/lib/soundtrack/storage')>();
  return {
    ...real,
    promoteCardMedia: async (art: unknown) => {
      if (h.promoteThrows) throw new real.UploadsComingSoon();
      h.promoted.push(art); return { 'https://storage.googleapis.com/p/pending/u/f.mp3': 'https://storage.googleapis.com/pub/tracks/u/f.mp3' };
    },
    cardMediaPreview: async () => ({ x: 'signed' }),
  };
});
vi.mock('@/lib/creator/creative-card-service', async (orig) => {
  const real = await orig<typeof import('@/lib/creator/creative-card-service')>();
  return { ...real, reviewCard: async (...a: unknown[]) => { h.reviewCalls.push(a); return { ok: true, isPublic: true, coin: false }; } };
});

import {
  APPROVER_ROLES, adultDobYearMax, canApprove, canFlag, canViewCard, isPublicCreator, publicCardWhere, publicMediaUrl,
  publicStats, slimCard, stripServerStats, wantsPublic,
} from './creative-card-review';
import { GET as cardGET } from '@/app/api/v1/creative-card/[id]/route';
import { POST as reviewPOST } from '@/app/api/v1/creative-card/[id]/review/route';
import { POST as uploadPOST } from '@/app/api/v1/creative-card/upload-url/route';
import { GET as queueGET } from '@/app/api/v1/creative-card/review-queue/route';
import { POST as rotationPOST } from '@/app/api/v1/creative-card/[id]/rotation/route';

const NOW = new Date('2026-10-06T12:00:00Z');
const Y = NOW.getFullYear();

describe('roles: founder and admin approve; mods flag only', () => {
  it('approvers', () => {
    expect([...APPROVER_ROLES].sort()).toEqual(['admin', 'founder']);
    expect(canApprove('mod')).toBe(false);
    expect(canApprove('player')).toBe(false);
    expect(canApprove(null)).toBe(false);
  });
  it('flaggers', () => {
    expect(canFlag('mod')).toBe(true);
    expect(canFlag('founder')).toBe(true);
    expect(canFlag('coach')).toBe(false);
  });
});

describe('public creators: strict 18+, unknown is not', () => {
  it('the boundary year', () => {
    expect(isPublicCreator(Y - 19, NOW)).toBe(true);
    expect(isPublicCreator(Y - 18, NOW)).toBe(false);   // may still be 17
    expect(isPublicCreator(null, NOW)).toBe(false);
    expect(isPublicCreator(undefined, NOW)).toBe(false);
    expect(isPublicCreator(1850, NOW)).toBe(false);
    expect(adultDobYearMax(NOW)).toBe(Y - 19);
  });
  it('the list filter carries the same boundary', () => {
    expect(publicCardWhere(NOW)).toEqual({ isPublic: true, reviewState: 'approved', owner: { dobYear: { gte: 1900, lte: Y - 19 } } });
  });
});

describe('canViewCard', () => {
  const adultOk = async () => true, minor = async () => false;
  const approved = { ownerId: 'o', reviewState: 'approved' as const, isPublic: true };
  it('the owner and staff always; anyone else only an approved, public, adult card', async () => {
    const pending = { ...approved, reviewState: 'pending_review' as const };
    expect(await canViewCard(pending, { id: 'o' }, minor)).toBe(true);
    expect(await canViewCard(pending, { id: 'm', role: 'mod' }, minor)).toBe(true);
    expect(await canViewCard(pending, { id: 'x', role: 'player' }, adultOk)).toBe(false);
    expect(await canViewCard(pending, null, adultOk)).toBe(false);
    expect(await canViewCard({ ...approved, isPublic: false }, null, adultOk)).toBe(false);
    expect(await canViewCard(approved, null, adultOk)).toBe(true);
    expect(await canViewCard(approved, null, minor)).toBe(false);   // a minor's card, even if stored public
  });
});

describe('stats and projections', () => {
  it('server-only stats never come in from a client, and never go out to the public', () => {
    const s = { moveset: ['a'], review: { note: 'n' }, flags: [1], soundtrack: { rotation: 'on' }, plays: 3, publicMedia: {}, wantsPublic: true, privatizedAt: 'x' };
    expect(stripServerStats(s)).toEqual({ moveset: ['a'] });
    expect(publicStats(s)).toEqual({ moveset: ['a'], soundtrack: { rotation: 'on' }, plays: 3 });
  });
  it('wantsPublic defaults to true for legacy rows', () => {
    expect(wantsPublic({})).toBe(true);
    expect(wantsPublic(null)).toBe(true);
    expect(wantsPublic({ wantsPublic: false })).toBe(false);
  });
  it('slimCard drops inline images, keeps links and scene questions, excerpts writing', () => {
    const art = slimCard({ art: { kind: 'art', canvasDataUrl: 'data:image/png;base64,' + 'A'.repeat(1000), palette: ['#fff'] } as any, stats: {} as any });
    expect((art.art as any).canvasDataUrl).toBe('');
    expect(art.slim).toBe(true);
    const cook = slimCard({ art: { kind: 'cooking', photoUrl: 'https://x/y.png' } as any, stats: {} as any });
    expect((cook.art as any).photoUrl).toBe('https://x/y.png');
    const w = slimCard({ art: { kind: 'writing', text: 'w'.repeat(5000) } as any, stats: {} as any });
    expect((w.art as any).text.length).toBe(281);
    const q = [{ prompt: 'p', options: ['a', 'b', 'c', 'd'], answer: 1 }];
    expect((slimCard({ art: { kind: 'scene', questions: q } as any, stats: {} as any }).art as any).questions).toEqual(q);
  });
  it('publicMediaUrl maps an approved pending upload to its public copy', () => {
    expect(publicMediaUrl('https://a/p.mp3', { publicMedia: { 'https://a/p.mp3': 'https://b/t.mp3' } })).toBe('https://b/t.mp3');
    expect(publicMediaUrl('https://a/q.mp3', { publicMedia: {} })).toBe('https://a/q.mp3');
    expect(publicMediaUrl(undefined, {})).toBe(null);
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const req = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
const card = (over: Record<string, unknown> = {}) => ({
  id: 'c1', ownerId: 'owner', title: 'Song', primary: 'music', secondary: [], sportDesignation: null,
  art: { kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 100, keySignature: 'C' },
  stats: { review: { decision: 'approved', note: 'private note', by: 'admin1', at: 'x' }, flags: [{ by: 'm', at: 'x' }] },
  rarityTier: 'common', rarityMult: 1, createdAt: NOW, isPublic: true, remixOf: null, reviewState: 'approved', ...over,
});

beforeEach(() => {
  h.session = null;
  h.users.clear(); h.cards.clear(); h.updates = []; h.findMany = []; h.reviewCalls = []; h.promoted = []; h.promoteThrows = false;
  h.users.set('owner', { role: 'player', dobYear: 1990, name: 'Ada' });
  h.users.set('teen', { role: 'player', dobYear: new Date().getFullYear() - 15, name: 'Kid' });
  h.users.set('stranger', { role: 'player', dobYear: 1985 });
  h.users.set('mod1', { role: 'mod', dobYear: 1980 });
  h.users.set('admin1', { role: 'admin', dobYear: 1980 });
  h.users.set('founder1', { role: 'founder', dobYear: 1980 });
  delete process.env.CREATOR_MEDIA_BUCKET; delete process.env.CREATOR_MEDIA_PUBLIC_BUCKET;
});
const as = (id: string | null) => { h.session = id ? { user: { id } } : null; };

describe('GET /api/v1/creative-card/[id]', () => {
  it('a pending card is a 404 to strangers and signed-out readers, and readable by its owner and a mod', async () => {
    h.cards.set('c1', card({ reviewState: 'pending_review', isPublic: false }));
    as(null); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(404);
    as('stranger'); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(404);
    as('owner'); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(200);
    as('mod1'); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(200);
  });
  it('a teen\'s card stored as approved and public is still a 404 to everyone else (the old acting clips)', async () => {
    h.cards.set('c1', card({ ownerId: 'teen', primary: 'acting' }));
    as('stranger'); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(404);
    as('teen'); expect((await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).status).toBe(200);
  });
  it('an approved public adult card is public, without the review note or flags', async () => {
    h.cards.set('c1', card());
    as(null);
    const res = await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card.stats.review).toBeUndefined();
    expect(body.card.stats.flags).toBeUndefined();
    as('owner');
    expect((await (await cardGET(req('/api/v1/creative-card/c1'), { params: { id: 'c1' } })).json()).card.stats.review.note).toBe('private note');
  });
  it('?preview=1 adds signed media links for staff only', async () => {
    h.cards.set('c1', card());
    as('admin1'); expect((await (await cardGET(req('/api/v1/creative-card/c1?preview=1'), { params: { id: 'c1' } })).json()).media).toEqual({ x: 'signed' });
    as('owner'); expect((await (await cardGET(req('/api/v1/creative-card/c1?preview=1'), { params: { id: 'c1' } })).json()).media).toBeUndefined();
  });
});

describe('POST /api/v1/creative-card/[id]/review', () => {
  beforeEach(() => { h.cards.set('c1', card({ reviewState: 'pending_review', isPublic: false, stats: {} })); });
  const post = (body: unknown) => reviewPOST(req('/api/v1/creative-card/c1/review', body), { params: { id: 'c1' } });
  it('signed out 401, a player 403', async () => {
    as(null); expect((await post({ decision: 'approved' })).status).toBe(401);
    as('stranger'); expect((await post({ decision: 'approved' })).status).toBe(403);
  });
  it('a mod may flag but not approve or reject', async () => {
    as('mod1');
    expect((await post({ decision: 'approved' })).status).toBe(403);
    expect((await post({ decision: 'rejected' })).status).toBe(403);
    expect(h.reviewCalls).toEqual([]);
    const res = await post({ decision: 'flag', note: 'sounds like a known song' });
    expect(res.status).toBe(200);
    expect(h.cards.get('c1').stats.flags).toEqual([expect.objectContaining({ by: 'mod1', note: 'sounds like a known song' })]);
  });
  it('the founder and an admin approve: media promoted first, rotation recorded, reviewCard called with the note', async () => {
    for (const who of ['founder1', 'admin1']) {
      h.reviewCalls = [];
      as(who);
      const res = await post({ decision: 'approved', note: 'great', rotation: 'featured', moods: ['menu', 'nope'] });
      expect(res.status).toBe(200);
      expect(h.reviewCalls[0][2]).toBe('approved');
      expect(h.reviewCalls[0][3]).toMatchObject({ by: who, note: 'great' });
    }
    const stats = h.cards.get('c1').stats;
    expect(stats.publicMedia).toEqual({ 'https://storage.googleapis.com/p/pending/u/f.mp3': 'https://storage.googleapis.com/pub/tracks/u/f.mp3' });
    expect(stats.soundtrack).toMatchObject({ rotation: 'featured', moods: ['menu'] });
  });
  it('approval waits when the copy to the public bucket cannot happen (no bucket): the card stays pending', async () => {
    h.promoteThrows = true;
    as('admin1');
    expect((await post({ decision: 'approved' })).status).toBe(503);
    expect(h.reviewCalls).toEqual([]);
  });
  it('rejects an unknown decision', async () => {
    as('admin1'); expect((await post({ decision: 'publish' })).status).toBe(422);
  });
});

describe('POST /api/v1/creative-card/[id]/rotation', () => {
  const post = (body: unknown) => rotationPOST(req('/api/v1/creative-card/c1/rotation', body), { params: { id: 'c1' } });
  it('approvers only; approved music only (a pull always works)', async () => {
    h.cards.set('c1', card());
    as('mod1'); expect((await post({ rotation: 'featured' })).status).toBe(403);
    as('admin1'); expect((await post({ rotation: 'featured' })).status).toBe(200);
    expect(h.cards.get('c1').stats.soundtrack.rotation).toBe('featured');
    expect((await post({ rotation: 'pulled' })).status).toBe(200);
    expect(h.cards.get('c1').stats.soundtrack.rotation).toBe('pulled');
    h.cards.set('c1', card({ reviewState: 'pending_review' }));
    expect((await post({ rotation: 'on' })).status).toBe(422);
    h.cards.set('c1', card({ primary: 'art' }));
    expect((await post({ rotation: 'on' })).status).toBe(422);
  });
});

describe('POST /api/v1/creative-card/upload-url', () => {
  const post = (body: unknown) => uploadPOST(req('/api/v1/creative-card/upload-url', body));
  const ok = { contentType: 'audio/mpeg', bytes: 3_000_000, durationSec: 150 };
  it('signed out 401', async () => { as(null); expect((await post(ok)).status).toBe(401); });
  it('binds type, size and length before anything else', async () => {
    as('owner');
    expect((await post({ ...ok, contentType: 'video/mp4' })).status).toBe(422);
    expect((await post({ ...ok, bytes: 8 * 1024 * 1024 + 1 })).status).toBe(422);
    expect((await post({ ...ok, bytes: undefined })).status).toBe(422);
    expect((await post({ ...ok, durationSec: 241 })).status).toBe(422);
    expect((await post({ contentType: 'image/png', bytes: 2 * 1024 * 1024 + 1 })).status).toBe(422);
  });
  it('a teen or an unknown-age creator gets device_only, never a URL', async () => {
    as('teen');
    const res = await post(ok);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('device_only');
    h.users.set('noage', { role: 'player', dobYear: null });
    as('noage'); expect((await post(ok)).status).toBe(403);
  });
  it('no bucket configured → 503 uploads coming soon (fail closed)', async () => {
    as('owner');
    const res = await post(ok);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('uploads_coming_soon');
  });
  it('rate limited per account', async () => {
    as('stranger');
    let last = 0;
    for (let i = 0; i < 26; i++) last = (await post(ok)).status;
    expect(last).toBe(429);
  });
});

describe('GET /api/v1/creative-card/review-queue', () => {
  it('staff only; slim items that say when approval keeps a card private', async () => {
    h.cards.set('c1', card({ ownerId: 'teen', reviewState: 'pending_review', isPublic: false, stats: {}, art: { kind: 'art', canvasDataUrl: 'data:image/png;base64,AAAA' } }));
    as('stranger'); expect((await queueGET(req('/api/v1/creative-card/review-queue'))).status).toBe(403);
    as('mod1');
    const res = await queueGET(req('/api/v1/creative-card/review-queue?view=pending&take=999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canApprove).toBe(false);
    expect(body.items[0]).toMatchObject({ id: 'c1', staysPrivate: true, owner: { name: 'Kid', publicCreator: false } });
    expect(body.items[0].art.canvasDataUrl).toBe('');
    expect(h.findMany[0].take).toBe(50);
    expect(h.findMany[0].where).toEqual({ reviewState: 'pending_review' });
  });
});
