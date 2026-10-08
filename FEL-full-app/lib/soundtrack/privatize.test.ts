// CREATOR SOUNDTRACK phase 0: the plan the owner's privatize script follows (dry run first; nothing deleted).
import { describe, expect, it } from 'vitest';
import { planPrivatize, privatizedStats } from './privatize';
import { queueWhere, toQueueItem } from './reviewQueue';

const NOW = new Date('2026-10-06T00:00:00Z');
const row = (id: string, dobYear: number | null, isPublic = true, primary = 'acting') => ({ id, ownerId: `o_${id}`, primary, isPublic, stats: {}, owner: { dobYear } });

describe('planPrivatize', () => {
  it('flips public cards of minors and unknown ages in the chosen disciplines; leaves adults and private cards alone', () => {
    const plan = planPrivatize([
      row('teen', 2012), row('unknown', null), row('adult', 1990), row('privateTeen', 2012, false),
      row('teenMusic', 2012, true, 'music'), row('edge', 2008),   // 2026 − 2008 = 18: not verified 18+ (strict)
    ], ['acting'], NOW);
    expect(plan.flip.map((f) => f.id)).toEqual(['teen', 'unknown', 'edge']);
    expect(plan.skippedAdult).toBe(1);
    expect(plan.alreadyPrivate).toBe(1);
    expect(planPrivatize([row('teenMusic', 2012, true, 'music')], ['acting', 'music'], NOW).flip).toHaveLength(1);
  });
  it('stamps the time and keeps every other stat', () => {
    expect(privatizedStats({ plays: 3 }, NOW)).toEqual({ plays: 3, privatizedAt: NOW.toISOString() });
  });
});

describe('review queue views', () => {
  it('each view is one filter', () => {
    expect(queueWhere('pending')).toEqual({ reviewState: 'pending_review' });
    expect(queueWhere('approved', 'music')).toEqual({ reviewState: 'approved', primary: 'music' });
    expect(queueWhere('flagged')).toMatchObject({ stats: { path: ['flags'], array_contains: [] } });
    expect(queueWhere('rotation')).toMatchObject({ reviewState: 'approved', primary: 'music' });
  });
  it('an item says what approval will do', () => {
    const it1 = toQueueItem({
      id: 'c', ownerId: 'o', title: 't', primary: 'music', art: { kind: 'music', mixUrl: 'https://x/m.mp3', stemUrls: ['https://x/s.wav'] },
      stats: { wantsPublic: false, flags: [{ by: 'm', at: 'x', note: 'n' }], soundtrack: { rotation: 'featured' }, plays: 4 },
      isPublic: false, reviewState: 'pending_review', createdAt: NOW, owner: { name: ' ', dobYear: 1990 },
    }, NOW);
    expect(it1).toMatchObject({ wantsPublic: false, staysPrivate: false, flags: 1, rotation: 'featured', plays: 4, mediaCount: 2, owner: { name: 'Creator', publicCreator: true } });
  });
});
