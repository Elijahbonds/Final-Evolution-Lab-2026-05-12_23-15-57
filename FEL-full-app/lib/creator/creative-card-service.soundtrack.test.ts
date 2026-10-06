// CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): the creative-card service's approval, privacy and coin rules, against
// an in-memory Prisma stand-in. The DB-backed acceptance suite (scripts/creative-card-tests.ts) covers the same rules on a
// real database when DATABASE_URL is set; this runs everywhere.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  grants: [] as { playerId: string; reasonCode: string; idempotencyKey: string }[],
  rows: new Map<string, any>(),
  users: new Map<string, { dobYear: number | null; role?: string }>(),
  findManyArgs: [] as any[],
}));

vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: async (_p: unknown, a: { playerId: string; reasonCode: string; idempotencyKey: string }) => {
    if (h.grants.some((g) => g.idempotencyKey === a.idempotencyKey)) return {};   // the ledger's idempotency
    h.grants.push(a); return {};
  },
  spend: async () => ({}),
  WalletError: class extends Error {},
}));

import { createCard, reviewCard, browse, type CreateCardInput } from './creative-card-service';
import { defaultRarity, defaultStats } from './creative-card-types';
import { REASON } from '@/lib/wallet/reward-rules';

const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
  if (k === 'id' && v && typeof v === 'object' && 'not' in v) return row.id !== v.not;
  if (k === 'owner') { const u = h.users.get(row.ownerId); const y = u?.dobYear; return y != null && y >= v.dobYear.gte && y <= v.dobYear.lte; }
  return row[k] === v;
});

const prisma: any = {
  creativeCard: {
    count: async ({ where }: any) => [...h.rows.values()].filter((r) => matches(r, where)).length,
    create: async ({ data }: any) => { const row = { ...data, createdAt: new Date() }; h.rows.set(data.id, row); return row; },
    findUnique: async ({ where }: any) => h.rows.get(where.id) ?? null,
    update: async ({ where, data }: any) => { const row = { ...h.rows.get(where.id), ...data }; h.rows.set(where.id, row); return row; },
    findMany: async (args: any) => { h.findManyArgs.push(args); return [...h.rows.values()].filter((r) => matches(r, args.where)); },
  },
  cardSlot: { findUnique: async () => ({ extra: 50 }) },
  ownedWearable: { findMany: async () => [] },
  user: { findUnique: async ({ where }: any) => h.users.get(where.id) ?? null },
};

const music = (n: number) => ({ kind: 'music', trackId: `t${n}`, stemUrls: [], coverArtUrl: '', bpm: 100, keySignature: 'C' }) as any;
const art = () => ({ kind: 'art', canvasDataUrl: 'data:image/png;base64,AAAA', palette: [], brushSetId: 'b', appliedSurface: 'board' }) as any;
const input = (over: Partial<CreateCardInput> = {}): CreateCardInput => ({
  title: 'T', primary: 'music', secondary: [], art: music(1), stats: defaultStats(), rarity: defaultRarity(),
  isPublic: true, licenseAccepted: true, ...over,
} as CreateCardInput);

const ADULT = 'u_adult', TEEN = 'u_teen', UNKNOWN = 'u_unknown';
let clock = 1_800_000_000_000;
beforeEach(() => {
  // createCard names a card by Date.now(): two cards in one millisecond would share an id in this fast test.
  vi.spyOn(Date, 'now').mockImplementation(() => ++clock);
  h.grants = []; h.rows.clear(); h.findManyArgs = [];
  h.users.clear();
  h.users.set(ADULT, { dobYear: 1990 });
  h.users.set(TEEN, { dobYear: new Date().getFullYear() - 15 });
  h.users.set(UNKNOWN, { dobYear: null });
});

describe('createCard: everything public needs approval; no pay on publish', () => {
  it('a card asked to be public is pending and not public, in a discipline that never needed review too', async () => {
    const a = await createCard(prisma, ADULT, input({ primary: 'art', art: art() }));
    expect(a.reviewState).toBe('pending_review');
    expect(a.isPublic).toBe(false);
  });
  it('a private card of a no-review discipline is ready for its owner, still private', async () => {
    const a = await createCard(prisma, ADULT, input({ primary: 'art', art: art(), isPublic: false }));
    expect(a.reviewState).toBe('approved');
    expect(a.isPublic).toBe(false);
  });
  it('music stays pending even when private', async () => {
    const m = await createCard(prisma, ADULT, input({ isPublic: false }));
    expect(m.reviewState).toBe('pending_review');
  });
  it('pays no coin on create (the +50 publish faucet is gone)', async () => {
    await createCard(prisma, ADULT, input({ primary: 'art', art: art(), isPublic: false }));
    expect(h.grants.filter((g) => g.reasonCode === REASON.CREATIVE_CARD_PUBLISH)).toEqual([]);
  });
  it('a client cannot smuggle server-only stats (review, rotation, plays) into a new card; the public wish is recorded', async () => {
    const c = await createCard(prisma, ADULT, input({
      stats: { ...defaultStats(), plays: 9999, soundtrack: { rotation: 'featured' }, review: { decision: 'approved' }, wantsPublic: false } as any,
    }));
    const stats = h.rows.get(c.id).stats;
    expect(stats.plays).toBeUndefined();
    expect(stats.soundtrack).toBeUndefined();
    expect(stats.review).toBeUndefined();
    expect(stats.wantsPublic).toBe(true);
    expect(stats.hypeMultiplier).toBe(1);
  });
});

describe('reviewCard: honours the creator, keeps teens private, pays once per discipline', () => {
  it('approval makes an adult\'s card public only when they asked for it', async () => {
    const pub = await createCard(prisma, ADULT, input());
    const priv = await createCard(prisma, ADULT, input({ art: music(2), isPublic: false }));
    expect((await reviewCard(prisma, pub.id, 'approved')).isPublic).toBe(true);
    expect((await reviewCard(prisma, priv.id, 'approved')).isPublic).toBe(false);
    expect(h.rows.get(priv.id).isPublic).toBe(false);
  });
  it('a teen\'s or an unknown-age creator\'s approved card stays private', async () => {
    for (const who of [TEEN, UNKNOWN]) {
      const c = await createCard(prisma, who, input());
      const r = await reviewCard(prisma, c.id, 'approved');
      expect(r.isPublic).toBe(false);
      expect(h.rows.get(c.id).isPublic).toBe(false);
      expect(h.rows.get(c.id).reviewState).toBe('approved');
    }
  });
  it('legacy cards (no wantsPublic flag) are treated as asked-public, as the old client always sent', async () => {
    h.rows.set('legacy', { id: 'legacy', ownerId: ADULT, primary: 'music', reviewState: 'pending_review', isPublic: false, stats: {}, art: music(9) });
    expect((await reviewCard(prisma, 'legacy', 'approved')).isPublic).toBe(true);
  });
  it('the first approved card in a discipline pays one coin; the second, a re-approval and another discipline\'s are separate', async () => {
    const a = await createCard(prisma, ADULT, input());
    const b = await createCard(prisma, ADULT, input({ art: music(2) }));
    expect((await reviewCard(prisma, a.id, 'approved')).coin).toBe(true);
    expect((await reviewCard(prisma, b.id, 'approved')).coin).toBe(false);
    await reviewCard(prisma, a.id, 'approved');
    const pays = h.grants.filter((g) => g.reasonCode === REASON.CREATIVE_CARD_PUBLISH);
    expect(pays).toHaveLength(1);
    expect(pays[0].idempotencyKey).toBe(`${REASON.CREATIVE_CARD_PUBLISH}:first_${ADULT}_music`);
    const s = await createCard(prisma, ADULT, input({ primary: 'scene', art: { kind: 'scene', venueId: 'v', cameraPath: 'c', questions: [{ prompt: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 0 }] } as any }));
    await reviewCard(prisma, s.id, 'approved');
    expect(h.grants.filter((g) => g.reasonCode === REASON.CREATIVE_CARD_PUBLISH)).toHaveLength(2);
  });
  it('no coin when an earlier public approved card in that discipline exists (paid +50 at publish under the old rule)', async () => {
    h.rows.set('old', { id: 'old', ownerId: ADULT, primary: 'art', reviewState: 'approved', isPublic: true, stats: {}, art: art() });
    const c = await createCard(prisma, ADULT, input({ primary: 'art', art: art() }));
    expect((await reviewCard(prisma, c.id, 'approved')).coin).toBe(false);
    expect(h.grants).toEqual([]);
  });
  it('a rejection pays nothing, takes the card down and records the note privately', async () => {
    const c = await createCard(prisma, ADULT, input());
    await reviewCard(prisma, c.id, 'approved');
    const before = h.grants.length;
    await reviewCard(prisma, c.id, 'rejected', { by: 'admin1', note: '  samples a song you do not own  ' });
    const row = h.rows.get(c.id);
    expect(h.grants.length).toBe(before);
    expect(row.isPublic).toBe(false);
    expect(row.reviewState).toBe('rejected');
    expect(row.stats.review).toMatchObject({ decision: 'rejected', by: 'admin1', note: 'samples a song you do not own' });
  });
});

describe('browse: adults only, slim', () => {
  it('filters on approved, public and an adult owner, and strips inline images', async () => {
    h.rows.set('a1', { id: 'a1', ownerId: ADULT, primary: 'art', reviewState: 'approved', isPublic: true, stats: { review: { note: 'x' } }, art: art(), rarityTier: 'common', rarityMult: 1, createdAt: new Date(), title: 'A' });
    h.rows.set('t1', { id: 't1', ownerId: TEEN, primary: 'art', reviewState: 'approved', isPublic: true, stats: {}, art: art(), rarityTier: 'common', rarityMult: 1, createdAt: new Date(), title: 'T' });
    const cards = await browse(prisma, 'art');
    expect(cards.map((c) => c.id)).toEqual(['a1']);
    expect((cards[0].art as any).canvasDataUrl).toBe('');
    expect((cards[0].stats as any).review).toBeUndefined();
    expect(h.findManyArgs[0].where).toMatchObject({ isPublic: true, reviewState: 'approved', primary: 'art', owner: { dobYear: { lte: new Date().getFullYear() - 19 } } });
  });
});
