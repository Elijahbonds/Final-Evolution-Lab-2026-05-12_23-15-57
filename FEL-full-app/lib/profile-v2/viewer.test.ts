import { describe, it, expect } from 'vitest';
import { recordCheckValues } from '@/lib/mirror/baselines';
import { assembleProfile, type ProfileRows } from './assemble';
import { redactForViewer } from './viewer';

const now = new Date('2026-10-24T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const rows: ProfileRows = {
  user: { name: 'Jordan', dobYear: 1990, createdAt: day(200) },
  profile: { xp: 500, streakDays: 2, avatarKey: null, cosmeticAssetId: null },
  optIn: { scope: 'jump_numbers', granted: true, revokedAt: null },
  prqEntries: [
    { id: 'a', attribute: 'power', value: 62, unit: 'score', source: 'camera', measuredAt: day(1) },
    { id: 'b', attribute: 'speed', value: 55, unit: 'score', source: 'drillResult', measuredAt: day(1) },
  ],
  mastery: [{ mode: 'dunkContest', tier: 2 }],
  jumpScans: [{ kind: 'dunk', metrics: { verticalCm: 60 }, createdAt: day(1) }],
  mirrorSessions: [{ patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.8 }), createdAt: day(1) }],
  bests: [{ mode: 'dunkContest', best: 9000, runs: 3 }], recentScores: [], playedAt: [day(1)],
  matches: [{ kind: 'online', status: 'settled', hostId: 'u1', hostName: 'Jordan', guestId: 'x', guestName: 'Rival Name', winnerId: 'u1', mode: 'threePoint', updatedAt: day(1) }],
  links: { count: 1, opened: 4, attempted: 2, beaten: 1 },
  card: { slug: 'jordan', published: true, displayName: 'Jordan', highlights: [{ mode: 'dunkContest', score: 9000 }] },
  coaches: [{ name: 'Coach K' }], credentials: [], triumphs: [],
};
const full = assembleProfile('u1', rows, now);

describe('redactForViewer', () => {
  for (const as of ['coach', 'public', 'friend'] as const) {
    it(`${as}: no Mirror numbers, no tiles, no opponents, no privacy controls`, () => {
      const v = redactForViewer(full, as, null);
      const json = JSON.stringify(v);
      expect(v.tiles).toEqual([]);
      expect(v.stats.jumpWeeks).toBeNull();
      expect(v.stats.formWeeks).toBeNull();
      expect(v.stats.jumpBestIn).toBeNull();
      expect(v.stats.skills.some((s) => s.estimate)).toBe(false);
      expect(json).not.toContain('Rival Name');
      expect(json).not.toContain('Coach K');
      expect(v.privacy.cardSlug).toBeNull();
      expect(v.gates.canSaveScan).toBe(false);
    });
  }
  it('public honours the card mask the owner set (the same one /card/[slug] uses)', () => {
    const v = redactForViewer(full, 'public', { prq: false, mastery: false, records: false, highlights: false });
    expect(v.prq.score).toBeNull();
    expect(v.stats.skills).toEqual([]);
    expect(v.stats.modes).toEqual([]);
    expect(v.badges.mastery).toEqual([]);
    expect(v.highlights.pinned).toEqual([]);
  });
  it('a coach sees bests, mastery and the PRQ whatever the public mask says', () => {
    const v = redactForViewer(full, 'coach', { prq: false, mastery: false, records: false, highlights: false });
    expect(v.prq.score).not.toBeNull();
    expect(v.stats.modes).toHaveLength(1);
    expect(v.badges.mastery).toHaveLength(1);
  });
});
