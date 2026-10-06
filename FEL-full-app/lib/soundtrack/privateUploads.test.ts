// PIPELINES (owner, 2026-10-06, "teen private uploads YES: owner-only private area, never public; acting/voice stays
// adults-only"): the pure rules, the storage seams, the five routes and the service, each checked against every path by
// which a teen's private upload could become public, reach a reviewer, or play for someone else.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
  users: new Map<string, { role?: string; dobYear?: number | null; name?: string }>(),
  cards: new Map<string, any>(),
  signedPuts: [] as { objectName: string }[],
  signedGets: [] as string[],
  grants: [] as unknown[],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: async (_p: unknown, a: unknown) => { h.grants.push(a); return {}; },
  spend: async () => ({}),
  WalletError: class extends Error {},
}));
const prismaStub = vi.hoisted(() => ({
  user: { findUnique: async ({ where }: any) => h.users.get(where.id) ?? null },
  creativeCard: {
    findUnique: async ({ where }: any) => h.cards.get(where.id) ?? null,
    update: async (a: any) => { const r = { ...h.cards.get(a.where.id), ...a.data }; h.cards.set(a.where.id, r); return r; },
    findMany: async () => [...h.cards.values()].map((c) => ({ ...c, owner: h.users.get(c.ownerId) ?? null })),
    count: async () => 0,
    create: async ({ data }: any) => { const row = { ...data, createdAt: new Date() }; h.cards.set(data.id, row); return row; },
  },
  cardSlot: { findUnique: async () => ({ extra: 50 }) },
  ownedWearable: { findMany: async () => [] },
}));
vi.mock('@/lib/db', () => ({ prisma: prismaStub }));
vi.mock('@/lib/soundtrack/storage', async (orig) => {
  const real = await orig<typeof import('@/lib/soundtrack/storage')>();
  return {
    ...real,
    signCreatorPut: async (i: { objectName: string }) => {
      h.signedPuts.push(i);
      return { url: `https://signed/${i.objectName}`, headers: {}, pendingUrl: `https://storage.googleapis.com/fel-pending/${i.objectName}` };
    },
    signPrivateGet: async (name: string, seg: string) => { h.signedGets.push(name); return real.signPrivateGet(name, seg, { sign: async () => 'ab', env: { CREATOR_MEDIA_BUCKET: 'fel-pending', CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-public' } as any, now: () => new Date('2026-10-06T00:00:00Z') }); },
    promoteCardMedia: async (art: unknown) => real.promoteCardMedia(art, { env: { CREATOR_MEDIA_BUCKET: 'fel-pending', CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-public' } as any, fetchImpl: (() => { throw new Error('no network in tests'); }) as any, token: async () => ({ accessToken: 't', email: 'e' }) }),
  };
});

import {
  TEEN_ACTING_LINE, TEEN_PRIVATE_UPLOADS, cardHasPrivateMedia, isPrivateMediaUrl, ownerSegment, privateObjectOfOwner, teenUploadGate,
} from './privateUploads';
import {
  PRIVATE_PREFIX, pendingObjectOf, privateObjectName, publicObjectName, promoteCardMedia, signCreatorPut, signPrivateGet,
} from './storage';
import { cardTrack } from './catalogue';
import { createCard, reviewCard, type CreateCardInput } from '@/lib/creator/creative-card-service';
import { defaultRarity, defaultStats, rightsRecordFor } from '@/lib/creator/creative-card-types';
import { POST as uploadPOST } from '@/app/api/v1/creative-card/upload-url/route';
import { POST as reviewPOST } from '@/app/api/v1/creative-card/[id]/review/route';
import { POST as rotationPOST } from '@/app/api/v1/creative-card/[id]/rotation/route';
import { GET as queueGET } from '@/app/api/v1/creative-card/review-queue/route';
import { GET as cardGET } from '@/app/api/v1/creative-card/[id]/route';

const ENV = { CREATOR_MEDIA_BUCKET: 'fel-pending', CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-public' } as unknown as NodeJS.ProcessEnv;
const PRIV = 'https://storage.googleapis.com/fel-pending/private/teen/abc123.mp3';
const PEND = 'https://storage.googleapis.com/fel-pending/pending/owner/abc123.mp3';
const Y = new Date().getFullYear();

const req = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
const as = (id: string | null) => { h.session = id ? { user: { id } } : null; };
const musicArt = (mixUrl: string) => ({
  kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 100, keySignature: '', mixUrl, mime: 'audio/mpeg', bytes: 1000,
  durationSec: 30, origin: 'upload', rights: rightsRecordFor('music'),
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1', ownerId: 'teen', title: 'Mine', primary: 'music', secondary: [], sportDesignation: null, art: musicArt(PRIV),
  stats: {}, rarityTier: 'common', rarityMult: 1, createdAt: new Date(), isPublic: false, remixOf: null, reviewState: 'approved', ...over,
});

beforeEach(() => {
  h.session = null; h.cards.clear(); h.signedPuts = []; h.signedGets = []; h.grants = [];
  h.users.clear();
  h.users.set('teen', { role: 'player', dobYear: Y - 15, name: 'Kid' });
  h.users.set('noage', { role: 'player', dobYear: null });
  h.users.set('owner', { role: 'player', dobYear: 1990, name: 'Ada' });
  h.users.set('admin1', { role: 'admin', dobYear: 1980 });
  h.users.set('founder1', { role: 'founder', dobYear: 1980 });
});

describe('teenUploadGate: music and images only; acting never', () => {
  it('acting is refused with the adults-only line, whatever the file', () => {
    expect(teenUploadGate({ discipline: 'acting', kind: 'audio' })).toMatchObject({ ok: false, error: 'device_only', message: TEEN_ACTING_LINE });
    expect(teenUploadGate({ discipline: 'acting', kind: 'image' })).toMatchObject({ ok: false });
  });
  it('music takes audio and a cover; image-only disciplines take images only', () => {
    expect(teenUploadGate({ discipline: 'music', kind: 'audio' }).ok).toBe(true);
    expect(teenUploadGate({ discipline: 'music', kind: 'image' }).ok).toBe(true);
    for (const d of ['art', 'cooking', 'writing', 'fashion']) {
      expect(teenUploadGate({ discipline: d, kind: 'image' }).ok).toBe(true);
      expect(teenUploadGate({ discipline: d, kind: 'audio' }).ok).toBe(false);
    }
  });
  it('no discipline, an unknown one, or one that carries no media → refused', () => {
    for (const d of [undefined, '', 'dance', 'scene', 'sport', 'MUSIC', 42]) {
      expect(teenUploadGate({ discipline: d, kind: 'audio' }).ok).toBe(false);
    }
  });
  it('the table never lists acting', () => { expect(Object.keys(TEEN_PRIVATE_UPLOADS)).not.toContain('acting'); });
});

describe('private URLs are recognised anywhere in a payload, however they are written', () => {
  it('isPrivateMediaUrl', () => {
    expect(isPrivateMediaUrl(PRIV)).toBe(true);
    expect(isPrivateMediaUrl('https://storage.googleapis.com/another-bucket/private/x/y.png')).toBe(true);
    expect(isPrivateMediaUrl('https://storage.googleapis.com/fel-pending%2Fprivate%2Fx/y.png')).toBe(true);
    expect(isPrivateMediaUrl(PEND)).toBe(false);
    expect(isPrivateMediaUrl('https://storage.googleapis.com/fel-public/tracks/x/y.mp3')).toBe(false);
    expect(isPrivateMediaUrl('https://example.com/private/x.mp3')).toBe(false);
    expect(isPrivateMediaUrl(null)).toBe(false);
  });
  it('cardHasPrivateMedia looks in every field, nested too', () => {
    expect(cardHasPrivateMedia(musicArt(PRIV))).toBe(true);
    expect(cardHasPrivateMedia({ kind: 'music', stemUrls: [PEND, PRIV] })).toBe(true);
    expect(cardHasPrivateMedia({ kind: 'writing', text: 'x', extra: { deep: [PRIV] } })).toBe(true);
    expect(cardHasPrivateMedia(musicArt(PEND))).toBe(false);
    expect(cardHasPrivateMedia(null)).toBe(false);
  });
  it('privateObjectOfOwner signs only the owner\'s own folder', () => {
    expect(privateObjectOfOwner(PRIV, 'teen')).toBe('private/teen/abc123.mp3');
    expect(privateObjectOfOwner(PRIV, 'someone')).toBe(null);
    expect(privateObjectOfOwner(PEND, 'owner')).toBe(null);
    expect(ownerSegment('a.b@c')).toBe('a_b_c');
  });
});

describe('storage: the private prefix can never be promoted', () => {
  it('names land under private/, and private/ never maps to a public name', () => {
    expect(privateObjectName('teen', 'f1', 'mp3')).toBe(`${PRIVATE_PREFIX}teen/f1.mp3`);
    expect(() => publicObjectName('private/teen/f1.mp3')).toThrow();
    expect(pendingObjectOf(PRIV, ENV)).toBe(null);
  });
  it('promoteCardMedia copies nothing from a private card (and makes no network call)', async () => {
    const fetchImpl = vi.fn();
    const map = await promoteCardMedia(musicArt(PRIV), { env: ENV, fetchImpl: fetchImpl as never, token: async () => ({ accessToken: 't', email: 'e' }) });
    expect(map).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('a private PUT signs into the PRIVATE bucket; a tracks/ PUT is refused', async () => {
    const deps = { env: ENV, sign: async () => 'ab', now: () => new Date('2026-10-06T00:00:00Z') };
    const real = await vi.importActual<typeof import('./storage')>('./storage');
    const put = await real.signCreatorPut({ objectName: 'private/teen/f1.mp3', contentType: 'audio/mpeg', bytes: 10 }, deps);
    expect(put.url).toContain('/fel-pending/private/teen/f1.mp3');
    expect(put.url).not.toContain('fel-public');
    await expect(real.signCreatorPut({ objectName: 'tracks/teen/f1.mp3', contentType: 'audio/mpeg', bytes: 10 }, deps)).rejects.toThrow();
    void signCreatorPut;
  });
  it('signPrivateGet refuses another owner\'s object', async () => {
    const real = await vi.importActual<typeof import('./storage')>('./storage');
    const deps = { env: ENV, sign: async () => 'ab', now: () => new Date('2026-10-06T00:00:00Z') };
    await expect(real.signPrivateGet('private/teen/f1.mp3', 'other', deps)).rejects.toThrow();
    await expect(real.signPrivateGet('pending/teen/f1.mp3', 'teen', deps)).rejects.toThrow();
    expect(await real.signPrivateGet('private/teen/f1.mp3', 'teen', deps)).toContain('/fel-pending/private/teen/f1.mp3');
    void signPrivateGet;
  });
});

describe('POST upload-url: teens get the private area, never pending/', () => {
  const post = (body: unknown) => uploadPOST(req('/api/v1/creative-card/upload-url', body));
  const song = { contentType: 'audio/mpeg', bytes: 3_000_000, durationSec: 150 };
  it('a teen uploading a song for a music card gets a private/ object and private: true', async () => {
    as('teen');
    const res = await post({ ...song, discipline: 'music' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.private).toBe(true);
    expect(body.objectName.startsWith('private/teen/')).toBe(true);
    expect(body.publicUrl).toContain('/private/');
    expect(h.signedPuts.every((p) => !p.objectName.startsWith('pending/'))).toBe(true);
  });
  it('an unknown-age creator is treated the same (private area)', async () => {
    as('noage');
    expect((await (await post({ contentType: 'image/png', bytes: 1000, discipline: 'art' })).json()).objectName.startsWith('private/noage/')).toBe(true);
  });
  it('a teen voice line (acting) is refused, and so is audio for an image-only discipline or no discipline', async () => {
    as('teen');
    const acting = await post({ contentType: 'audio/webm', bytes: 1000, durationSec: 5, discipline: 'acting' });
    expect(acting.status).toBe(403);
    expect((await acting.json()).error).toBe('device_only');
    expect((await post({ ...song, discipline: 'art' })).status).toBe(403);
    expect((await post(song)).status).toBe(403);
    expect(h.signedPuts).toEqual([]);
  });
  it('an adult still uploads for review under pending/, not flagged private', async () => {
    as('owner');
    const body = await (await post({ ...song, discipline: 'music' })).json();
    expect(body.objectName.startsWith('pending/owner/')).toBe(true);
    expect(body.private).toBeUndefined();
  });
});

describe('createCard and reviewCard: a private upload is the owner\'s alone, by any path', () => {
  const input = (over: Partial<CreateCardInput> = {}): CreateCardInput => ({
    title: 'T', primary: 'music', secondary: [], art: musicArt(PRIV) as never, stats: defaultStats(), rarity: defaultRarity(),
    isPublic: true, licenseAccepted: true, ...over,
  } as CreateCardInput);
  it('created private, ready for its owner, never queued, never asked public, even when the client asks', async () => {
    const c = await createCard(prismaStub as never, 'teen', input());
    expect(c.isPublic).toBe(false);
    expect(c.reviewState).toBe('approved');
    expect((h.cards.get(c.id).stats as any).wantsPublic).toBe(false);
  });
  it('an ADULT re-using a private URL in a new card gets a private card too (no laundering through an adult)', async () => {
    const c = await createCard(prismaStub as never, 'owner', input());
    expect(c.isPublic).toBe(false);
    expect((h.cards.get(c.id).stats as any).wantsPublic).toBe(false);
  });
  it('an acting card (or acting as a secondary) carrying a private upload is refused', async () => {
    const acting = { kind: 'acting', sceneId: 's', performanceUrl: PRIV, voiceLineIds: ['player_intro'], rights: rightsRecordFor('acting') };
    await expect(createCard(prismaStub as never, 'teen', input({ primary: 'acting', art: acting as never }))).rejects.toMatchObject({ status: 403 });
    await expect(createCard(prismaStub as never, 'teen', input({ secondary: ['acting'] }))).rejects.toMatchObject({ status: 403 });
  });
  it('reviewCard never makes it public, even when the owner is now an adult and asked', async () => {
    h.cards.set('c1', row({ ownerId: 'owner', stats: { wantsPublic: true }, reviewState: 'pending_review' }));
    const r = await reviewCard(prismaStub as never, 'c1', 'approved', { by: 'admin1' });
    expect(r.isPublic).toBe(false);
    expect(h.cards.get('c1').isPublic).toBe(false);
  });
});

describe('the routes refuse it: review, rotation, queue, catalogue; only the owner gets a link', () => {
  it('approving an owner-only card is 422 and changes nothing', async () => {
    h.cards.set('c1', row({ stats: { wantsPublic: true } }));
    as('founder1');
    const res = await reviewPOST(req('/api/v1/creative-card/c1/review', { decision: 'approved', rotation: 'featured' }), { params: { id: 'c1' } });
    expect(res.status).toBe(422);
    expect(h.cards.get('c1').isPublic).toBe(false);
    expect(h.cards.get('c1').stats.soundtrack).toBeUndefined();
  });
  it('rotation on/featured is 422 for it', async () => {
    h.cards.set('c1', row({ ownerId: 'owner' }));
    as('admin1');
    for (const r of ['on', 'featured']) {
      expect((await rotationPOST(req('/api/v1/creative-card/c1/rotation', { rotation: r }), { params: { id: 'c1' } })).status).toBe(422);
    }
  });
  it('the review queue never lists it, in any view', async () => {
    h.cards.set('c1', row());
    h.cards.set('c2', row({ id: 'c2', ownerId: 'owner', art: musicArt(PEND), reviewState: 'pending_review' }));
    as('admin1');
    for (const view of ['pending', 'approved', 'flagged', 'rotation', 'rejected']) {
      const body = await (await queueGET(req(`/api/v1/creative-card/review-queue?view=${view}`))).json();
      expect(body.items.map((i: { id: string }) => i.id)).not.toContain('c1');
    }
  });
  it('the catalogue never plays it, even if a row were somehow approved, public, adult and in rotation', () => {
    const t = cardTrack({ ...row({ ownerId: 'owner', isPublic: true, stats: { soundtrack: { rotation: 'featured' } } }), owner: { dobYear: 1990, name: 'Ada', creatorCards: [] } } as never);
    expect(t).toBe(null);
    const control = cardTrack({ ...row({ ownerId: 'owner', isPublic: true, art: musicArt('https://storage.googleapis.com/fel-public/tracks/owner/a.mp3'), stats: { soundtrack: { rotation: 'featured' } } }), owner: { dobYear: 1990, name: 'Ada', creatorCards: [] } } as never);
    expect(control).not.toBe(null);   // the control: the same row with a public copy plays
  });
  it('?media=1 signs the owner\'s private upload for the owner only; staff get no private link', async () => {
    h.cards.set('c1', row());
    as('teen');
    const mine = await (await cardGET(req('/api/v1/creative-card/c1?media=1'), { params: { id: 'c1' } })).json();
    expect(Object.keys(mine.media)).toEqual([PRIV]);
    expect(h.signedGets).toEqual(['private/teen/abc123.mp3']);
    as('admin1');
    const staff = await (await cardGET(req('/api/v1/creative-card/c1?media=1'), { params: { id: 'c1' } })).json();
    expect(staff.media).toBeUndefined();
    as('owner');
    expect((await cardGET(req('/api/v1/creative-card/c1?media=1'), { params: { id: 'c1' } })).status).toBe(404);
  });
});
