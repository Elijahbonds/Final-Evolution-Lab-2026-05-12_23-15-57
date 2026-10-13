import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// CARD-SAFE-1, Cyber's bar (FE PM 11:40 PM PT Oct 12).
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prq-entries', () => ({ computeTraceablePrq: vi.fn(async () => ({ score: 0 })) }));
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
vi.mock('@/lib/creator/card-stats-server', () => ({ publicStatsFor: vi.fn(async () => ({ stats: {}, visibility: { highlights: false } })) }));

import { getPublicCard, setPublished, upsertMyCard } from './card-service';
import { GET as publicCardGET } from '@/app/api/v1/card/[slug]/route';

const Y = new Date().getFullYear();
type Opts = { dobYear?: number | null; noUser?: boolean; noCard?: boolean; published?: boolean };
function fakeDb(o: Opts = {}) {
  const card = { id: 'c1', ownerId: 'u1', slug: 'kid', published: o.published ?? true, displayName: 'Kid', accent: '#00E5FF', showStats: null, highlights: [] };
  return {
    card,
    user: { findUnique: vi.fn(async () => (o.noUser ? null : { dobYear: o.dobYear ?? null })) },
    scanSaveOptIn: { findUnique: vi.fn(async () => null) },
    gameSession: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), aggregate: vi.fn(async () => ({ _max: { score: 0 } })) },
    creatorCard: {
      findUnique: vi.fn(async () => (o.noCard ? null : card)),
      findFirst: vi.fn(async () => (o.noCard ? null : card)),
      update: vi.fn(async ({ data }: any) => ({ ...card, ...data })),
      create: vi.fn(async ({ data }: any) => ({ ...card, ...data })),
    },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('(e) age boundary, from the birth year only', () => {
  it.each([
    ['17 (born this year − 17)', Y - 17, false],
    ['the 18 boundary year (born this year − 18: may still be 17, so fail closed)', Y - 18, false],
    ['clearly 18+ (born this year − 19)', Y - 19, true],
    ['adult (born this year − 40)', Y - 40, true],
  ])('%s → public card %s', async (_n, dobYear, visible) => {
    const card = await getPublicCard(fakeDb({ dobYear }), 'kid');
    expect(card !== null).toBe(visible);
  });

  it('unknown age (no birth year) is treated as a minor', async () => {
    expect(await getPublicCard(fakeDb({ dobYear: null }), 'kid')).toBeNull();
  });

  it("a minor's card that is ALREADY published stops showing, and its view count is not bumped", async () => {
    const db = fakeDb({ dobYear: Y - 15, published: true });
    expect(await getPublicCard(db, 'kid')).toBeNull();
    expect(db.creatorCard.update).not.toHaveBeenCalled();
  });
});

describe('(b) age comes only from the server User.dobYear', () => {
  it('reads users.dobYear by the owner id and nothing else; age-like fields on the card are ignored', async () => {
    const db = fakeDb({ dobYear: Y - 15 });
    Object.assign(db.card, { dobYear: Y - 40, age: 40, isAdult: true });
    expect(await getPublicCard(db, 'kid')).toBeNull();
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { dobYear: true } });
  });

  it('the card service never reads a session, cookie, header or request body for age', () => {
    const src = readFileSync('lib/creator/card-service.ts', 'utf8');
    expect(src).not.toMatch(/getServerSession|cookies\(|headers\(|birthYear|ageClaim/);
  });
});

describe('(a) one identical 404', () => {
  const cases: Array<[string, Opts]> = [
    ['minor', { dobYear: Y - 16 }],
    ['unknown age', { dobYear: null }],
    ['no account', { noUser: true }],
    ['card does not exist', { noCard: true }],
  ];
  it('the public card API answers the same status, body and cache header for all four', async () => {
    const answers: string[] = [];
    for (const [, o] of cases) {
      h.db = fakeDb(o);
      const res = await publicCardGET(new Request('http://x/api/v1/card/kid'), { params: { slug: 'kid' } });
      answers.push(JSON.stringify({ s: res.status, b: await res.json(), c: res.headers.get('cache-control') }));
    }
    expect(new Set(answers).size).toBe(1);
    expect(JSON.parse(answers[0])).toEqual({ s: 404, b: { error: 'not_found' }, c: 'no-store' });
  });

  it('the page and the preview image take the same not-found path for every hidden case', () => {
    expect(readFileSync('app/card/[slug]/page.tsx', 'utf8')).toMatch(/if \(!card\) notFound\(\);/);
    expect(readFileSync('app/card/[slug]/opengraph-image.tsx', 'utf8')).toContain("if (!card) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });");
  });
});

describe('(c) every public surface, no stale cache', () => {
  it('page, preview image and public API are dynamic with revalidate 0', () => {
    for (const f of ['app/card/[slug]/page.tsx', 'app/card/[slug]/opengraph-image.tsx', 'app/api/v1/card/[slug]/route.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain("export const dynamic = 'force-dynamic';");
      expect(src).toContain('export const revalidate = 0;');
      expect(src).toContain('getPublicCard(');
    }
  });

  it('no sitemap, leaderboard or embed lists creator cards outside getPublicCard', () => {
    for (const f of ['app/sitemap.ts', 'app/sitemap.xml/route.ts']) {
      if (existsSync(f)) expect(readFileSync(f, 'utf8')).not.toMatch(/creatorCard|\/card\//);
    }
  });
});

describe('(d) publish blocked on the server in create, update and toggle', () => {
  it('create: a new card is always unpublished', async () => {
    const db = fakeDb({ dobYear: Y - 15, noCard: true });
    db.creatorCard.findUnique = vi.fn(async () => null);
    await upsertMyCard(db, 'u1', 'Kid', { displayName: 'Kid' });
    expect(db.creatorCard.create.mock.calls[0][0].data.published).toBe(false);
  });

  it('update: a minor card that is public is taken down on the next write', async () => {
    const db = fakeDb({ dobYear: Y - 15, published: true });
    await upsertMyCard(db, 'u1', 'Kid', { tagline: 'hi' });
    expect(db.creatorCard.update.mock.calls[0][0].data.published).toBe(false);
  });

  it('update: an adult card keeps its published state (not touched)', async () => {
    const db = fakeDb({ dobYear: Y - 30, published: true });
    await upsertMyCard(db, 'u1', 'Adult', { tagline: 'hi' });
    expect('published' in db.creatorCard.update.mock.calls[0][0].data).toBe(false);
  });

  it('toggle: 17 and unknown age are refused; an adult publishes', async () => {
    expect(await setPublished(fakeDb({ dobYear: Y - 17, published: false }), 'u1', true)).toBe('adults_only');
    expect(await setPublished(fakeDb({ dobYear: null, published: false }), 'u1', true)).toBe('adults_only');
    const ok = await setPublished(fakeDb({ dobYear: Y - 30, published: false }), 'u1', true);
    expect(ok && ok !== 'adults_only' ? ok.published : null).toBe(true);
  });
});
