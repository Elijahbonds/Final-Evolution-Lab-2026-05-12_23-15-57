import { beforeEach, describe, expect, it, vi } from 'vitest';

// CARD-SAFE-1 (FE PM Oct 12; CREATOR-CARD-UPGRADE-SPEC fix #1, test 1): no public card for under-18 accounts.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prq-entries', () => ({ computeTraceablePrq: vi.fn(async () => 0) }));

import { canPublishCard, getPublicCard, setPublished } from './card-service';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';

const year = new Date().getFullYear();
function fakeDb(dobYear: number | null, published = true) {
  const card = { id: 'card-1', ownerId: 'u1', slug: 'kid', published };
  return {
    card,
    user: { findUnique: vi.fn(async () => (dobYear === undefined ? null : { dobYear })) },
    scanSaveOptIn: { findUnique: vi.fn(async () => null) },
    creatorCard: {
      findUnique: vi.fn(async () => card),
      findFirst: vi.fn(async () => ({ id: card.id })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...card, ...data })),
    },
  } as any;
}

describe('CARD-SAFE-1 minor lock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public lookup returns not-found for an under-18 owner, even if the card is published', async () => {
    const db = fakeDb(year - 15);
    expect(await getPublicCard(db, 'kid')).toBeNull();
    // and the view counter is not bumped for a hidden card
    expect(db.creatorCard.update).not.toHaveBeenCalled();
  });

  it('public lookup returns not-found when the owner has no birth year (unknown age is not an adult)', async () => {
    expect(await getPublicCard(fakeDb(null), 'kid')).toBeNull();
  });

  // PM (11:26 PM PT Oct 12): no birth year on file is treated as a minor.
  it('no birth year on file: publish is refused and canPublish is false (treated as a minor)', async () => {
    const db = fakeDb(null, false);
    expect(await canPublishCard(db, 'u1')).toBe(false);
    expect(await setPublished(db, 'u1', true)).toBe('adults_only');
    expect(db.creatorCard.update).not.toHaveBeenCalled();
  });

  it('owner row missing: the public card stays hidden', async () => {
    const db = fakeDb(null);
    db.user.findUnique = vi.fn(async () => null);
    expect(await getPublicCard(db, 'kid')).toBeNull();
  });

  it('an adult owner\'s published card is unaffected', async () => {
    const db = fakeDb(year - 30);
    const card = await getPublicCard(db, 'kid');
    expect(card?.slug).toBe('kid');
    expect(await canPublishCard(db, 'u1')).toBe(true);
  });

  it('publishing is refused for an under-18 account and nothing is written', async () => {
    const db = fakeDb(year - 16, false);
    expect(await setPublished(db, 'u1', true)).toBe('adults_only');
    expect(db.creatorCard.update).not.toHaveBeenCalled();
  });

  it('an under-18 account can still unpublish', async () => {
    const db = fakeDb(year - 16, true);
    const out = await setPublished(db, 'u1', false);
    expect(out).not.toBe('adults_only');
    expect(db.creatorCard.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: { published: false } });
  });

  it('an adult can publish', async () => {
    const db = fakeDb(year - 25, false);
    const out = await setPublished(db, 'u1', true);
    expect(out && out !== 'adults_only' ? out.published : null).toBe(true);
  });

  it('the under-13 signup block is unchanged', () => {
    expect(ageScreenOutcome(year - 10)).toBe('blocked');
  });
});

describe('CARD-SAFE-1 wiring', () => {
  it('the publish route answers 403 adults_only; GET /api/v1/card reports canPublish; the editor fails closed', async () => {
    const { readFileSync } = await import('node:fs');
    const route = readFileSync('app/api/v1/card/publish/route.ts', 'utf8');
    expect(route).toMatch(/card === 'adults_only'\) return NextResponse\.json\(\{ error: 'adults_only' \}, \{ status: 403 \}\)/);
    expect(readFileSync('app/api/v1/card/route.ts', 'utf8')).toContain('canPublish');
    const editor = readFileSync('components/creator/card-editor.tsx', 'utf8');
    expect(editor).toContain('useState(false);\n');
    expect(editor).toContain("setCanPublish(d?.canPublish === true)");
    expect(editor).toContain('{canPublish || published ? <button onClick={togglePublish}');
    expect(editor).not.toMatch(/coming soon/i);
  });
});
