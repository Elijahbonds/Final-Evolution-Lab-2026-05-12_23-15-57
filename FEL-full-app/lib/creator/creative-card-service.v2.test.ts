// CREATE HUB phase 1 (owner, 2026-10-06): createCard under the payload v2 contract — every discipline asked to be public
// waits for review, the rights record is required on media and re-stamped with the server's time, the dance tempo and
// cooking allergens survive the round trip, and a teen's card never goes public. In-memory Prisma stand-in.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rows: new Map<string, any>(), users: new Map<string, { dobYear: number | null }>(), grants: [] as { playerId: string; reasonCode: string; idempotencyKey: string }[], ledgerIdempotent: true }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: async (_p: unknown, a: { playerId: string; reasonCode: string; idempotencyKey: string }) => {
    if (h.ledgerIdempotent && h.grants.some((g) => g.idempotencyKey === a.idempotencyKey)) return {};
    h.grants.push(a); return {};
  },
  spend: async () => ({}), WalletError: class extends Error {},
}));

import { createCard, reviewCard, myCards, CardError, type CreateCardInput } from './creative-card-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { DISCIPLINES, defaultRarity, defaultStats, rightsRecordFor, type ArtPayload, type Discipline } from './creative-card-types';

/** A Prisma `where` on plain fields, `{not}` and `{in}`; unknown relation filters (owner) match everything. */
const matches = (r: any, where: any) => Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
  if (k === 'owner') return true;
  if (v && typeof v === 'object' && 'not' in v) return r[k] !== v.not;
  if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
  return r[k] === v;
});
const prisma: any = {
  creativeCard: {
    count: async ({ where }: any) => [...h.rows.values()].filter((r) => matches(r, where)).length,
    findMany: async ({ where }: any) => [...h.rows.values()].filter((r) => matches(r, where)),
    create: async ({ data }: any) => { const row = { ...data, createdAt: new Date() }; h.rows.set(data.id, row); return row; },
    findUnique: async ({ where }: any) => h.rows.get(where.id) ?? null,
    update: async ({ where, data }: any) => { const row = { ...h.rows.get(where.id), ...data }; h.rows.set(where.id, row); return row; },
  },
  cardSlot: { findUnique: async () => ({ extra: 100 }) },
  ownedWearable: { findMany: async () => [{ itemId: 'top_lab' }] },
  user: { findUnique: async ({ where }: any) => h.users.get(where.id) ?? null },
};

const step = { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: true };
/** One valid payload per discipline, rights ticked the way the hub ticks them. */
function payloadFor(d: Discipline): ArtPayload {
  const base: Record<Discipline, Record<string, unknown>> = {
    sport: { kind: 'sport', signatureMoveId: 'windmill' },
    music: { kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 96, keySignature: 'Am', mixUrl: 'https://s/x.mp3', mime: 'audio/mpeg', durationSec: 60 },
    art: { kind: 'art', canvasDataUrl: 'data:image/png;base64,AA', palette: [], brushSetId: 'b', appliedSurface: 'board' },
    dance: { kind: 'dance', choreographyId: 'c', sequence: [step], bpm: 120 },
    acting: { kind: 'acting', sceneId: 's', performanceUrl: 'https://s/l.webm', voiceLineIds: ['player_intro'] },
    scene: { kind: 'scene', venueId: 'tennis', cameraPath: 'sweep', questions: [{ prompt: 'Which court?', options: ['a', 'b', 'c', 'd'], answer: 0 }] },
    cooking: { kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: [], allergens: ['egg'] },
    fashion: { kind: 'fashion', lookId: 'l', wearableIds: ['top_lab'], palette: [] },
    writing: { kind: 'writing', text: 'A story about the court at dawn.' },
  };
  return { ...base[d], rights: rightsRecordFor(d, new Date('2001-01-01T00:00:00Z')) } as ArtPayload;
}
const input = (d: Discipline, over: Partial<CreateCardInput> = {}): CreateCardInput => ({
  title: `My ${d}`, primary: d, secondary: [], sportDesignation: d === 'sport' ? 'basketball' : undefined,
  art: payloadFor(d), stats: defaultStats(), rarity: defaultRarity(), isPublic: true, licenseAccepted: true, ...over,
} as CreateCardInput);

const ADULT = 'u_adult', TEEN = 'u_teen';
let clock = 1_900_000_000_000;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => ++clock);
  h.rows.clear(); h.users.clear(); h.grants = []; h.ledgerIdempotent = true;
  h.users.set(ADULT, { dobYear: 1990 });
  h.users.set(TEEN, { dobYear: new Date().getFullYear() - 15 });
});

describe('everything public needs approval, in all nine disciplines', () => {
  it.each(DISCIPLINES)('%s asked public → pending and not public', async (d) => {
    const c = await createCard(prisma, ADULT, input(d));
    expect(c.reviewState).toBe('pending_review');
    expect(c.isPublic).toBe(false);
  });
});

describe('rights on media cards', () => {
  it('a media card without rights is a 422 naming rights', async () => {
    const art = { ...payloadFor('music') } as Record<string, unknown>; delete art.rights;
    await expect(createCard(prisma, ADULT, input('music', { art: art as ArtPayload }))).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/rights/) });
    await expect(createCard(prisma, ADULT, input('music', { art: art as ArtPayload }))).rejects.toBeInstanceOf(CardError);
  });
  it("the stored record keeps the owner's words and version and the SERVER's time", async () => {
    const before = Date.parse(new Date().toISOString()) - 1000;
    const c = await createCard(prisma, ADULT, input('music'));
    const r = (c.art as { rights?: { text: string; version: string; at: string } }).rights!;
    expect(r.version).toBe('music-2026-10-06');
    expect(r.text).toBe(rightsRecordFor('music').text);
    expect(Date.parse(r.at)).toBeGreaterThanOrEqual(before);   // not the fixture's 2001
  });
});

describe('fields that used to be dropped survive', () => {
  it('dance bpm and cooking allergens are stored', async () => {
    const d = await createCard(prisma, ADULT, input('dance'));
    expect((d.art as { bpm?: number }).bpm).toBe(120);
    const k = await createCard(prisma, ADULT, input('cooking'));
    expect((k.art as { allergens?: string[] }).allergens).toEqual(['egg']);
  });
});

describe('teen privacy', () => {
  it.each(DISCIPLINES)("a teen's %s card asked public is approved but never goes public", async (d) => {
    const c = await createCard(prisma, TEEN, input(d));
    expect(c.isPublic).toBe(false);
    const res = await reviewCard(prisma, c.id, 'approved', { by: 'founder' });
    expect(res.isPublic).toBe(false);
    expect(h.rows.get(c.id).isPublic).toBe(false);
  });
  it("an adult's approved card does go public (the control)", async () => {
    const c = await createCard(prisma, ADULT, input('writing'));
    expect((await reviewCard(prisma, c.id, 'approved', { by: 'founder' })).isPublic).toBe(true);
  });
});

describe('remix pay is capped (owner 2026-10-06): +25 on the first remix of each card only', () => {
  const OTHER = 'u_other', THIRD = 'u_third';
  const royalties = () => h.grants.filter((g) => g.reasonCode === REASON.CREATIVE_CARD_REMIX_ROYALTY);
  beforeEach(() => { h.users.set(OTHER, { dobYear: 1985 }); h.users.set(THIRD, { dobYear: 1980 }); });

  it('the first remix by someone else pays the original creator once; the second and third pay nothing', async () => {
    const orig = await createCard(prisma, ADULT, input('writing'));
    await createCard(prisma, OTHER, input('writing', { remixOf: orig.id }));
    await createCard(prisma, THIRD, input('writing', { remixOf: orig.id }));
    await createCard(prisma, OTHER, input('writing', { remixOf: orig.id }));
    expect(royalties()).toEqual([{ playerId: ADULT, reasonCode: REASON.CREATIVE_CARD_REMIX_ROYALTY, idempotencyKey: `${REASON.CREATIVE_CARD_REMIX_ROYALTY}:remix_first_${orig.id}` }]);
  });
  it('the cap holds even if the ledger did not dedupe (the earlier-remix count is its own lock)', async () => {
    h.ledgerIdempotent = false;
    const orig = await createCard(prisma, ADULT, input('writing'));
    await createCard(prisma, OTHER, input('writing', { remixOf: orig.id }));
    await createCard(prisma, THIRD, input('writing', { remixOf: orig.id }));
    expect(royalties()).toHaveLength(1);
  });
  it('remixing your own card pays nothing and does not use up the first-remix pay', async () => {
    const orig = await createCard(prisma, ADULT, input('writing'));
    await createCard(prisma, ADULT, input('writing', { remixOf: orig.id }));
    expect(royalties()).toHaveLength(0);
    await createCard(prisma, OTHER, input('writing', { remixOf: orig.id }));
    expect(royalties()).toHaveLength(1);
  });
  it('each original card has its own first remix', async () => {
    const a = await createCard(prisma, ADULT, input('writing'));
    const b = await createCard(prisma, ADULT, input('dance'));
    await createCard(prisma, OTHER, input('writing', { remixOf: a.id }));
    await createCard(prisma, OTHER, input('dance', { remixOf: b.id }));
    expect(royalties()).toHaveLength(2);
  });
  it('credit on both cards: "remixed by N" on the original, the parent named on the remix only when visible', async () => {
    const orig = await createCard(prisma, ADULT, input('writing', { title: 'Dawn' }));
    await createCard(prisma, OTHER, input('writing', { remixOf: orig.id }));
    await createCard(prisma, THIRD, input('writing', { remixOf: orig.id }));
    const [mine] = await myCards(prisma, ADULT);
    expect(mine.remixedBy).toBe(2);
    // the original is still pending (not public): another player's remix keeps only the id
    let [theirs] = await myCards(prisma, OTHER);
    expect(theirs.remixOf).toBe(orig.id);
    expect(theirs.remixedFrom).toBeUndefined();
    await reviewCard(prisma, orig.id, 'approved', { by: 'founder' });
    [theirs] = await myCards(prisma, OTHER);
    expect(theirs.remixedFrom).toEqual({ id: orig.id, title: 'Dawn' });
  });
});
