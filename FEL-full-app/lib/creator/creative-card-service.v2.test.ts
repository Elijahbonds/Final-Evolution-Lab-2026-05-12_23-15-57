// CREATE HUB phase 1 (owner, 2026-10-06): createCard under the payload v2 contract — every discipline asked to be public
// waits for review, the rights record is required on media and re-stamped with the server's time, the dance tempo and
// cooking allergens survive the round trip, and a teen's card never goes public. In-memory Prisma stand-in.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rows: new Map<string, any>(), users: new Map<string, { dobYear: number | null }>() }));
vi.mock('@/lib/wallet/wallet-service', () => ({ grantServerReward: async () => ({}), spend: async () => ({}), WalletError: class extends Error {} }));

import { createCard, reviewCard, CardError, type CreateCardInput } from './creative-card-service';
import { DISCIPLINES, defaultRarity, defaultStats, rightsRecordFor, type ArtPayload, type Discipline } from './creative-card-types';

const prisma: any = {
  creativeCard: {
    count: async ({ where }: any) => [...h.rows.values()].filter((r) => Object.entries(where).every(([k, v]) => typeof v !== 'object' && r[k] === v)).length,
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
  h.rows.clear(); h.users.clear();
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
