import { describe, expect, it } from 'vitest';
import { DEFAULT_VISIBILITY, bestSample, candidateHighlights, maskStats, masteryLabel, normalizeHighlights, normalizeVisibility, recordsByMode, type PublicStats } from './card-stats';

describe('visibility mask', () => {
  it('defaults, drops unknown keys, keeps booleans only', () => {
    expect(normalizeVisibility(null)).toEqual(DEFAULT_VISIBILITY);
    expect(normalizeVisibility({ prq: false, bogus: true, movement: 'yes' })).toEqual({ ...DEFAULT_VISIBILITY, prq: false });
  });
  it('masks blocks to a stable wire shape', () => {
    const s: PublicStats = { prq: { strength: 1 }, prqSource: 'measured', prqMeasuredAt: '2026-09-10T00:00:00Z', prqFreshness: 'fresh', prqNote: 'Measured 3 days ago.', mastery: [{ mode: 'dunk', tier: 3, label: 'Gold', best: 40 }], records: [{ mode: 'dunk', best: 40, sessions: 2, wins: 1 }], resiliency: { attempts: 2, retryRate: 0.5, returnedAfterLoss: true }, movement: { latestAt: null, delta: null }, ladder: { mode: 'dunk', bestScore: 40, weekStart: '2026-09-01' }, verified: true };
    const m = maskStats(s, { ...DEFAULT_VISIBILITY, prq: false, records: false });
    expect(m.prq).toBeNull(); expect(m.prqSource).toBeNull(); expect(m.records).toEqual([]); expect(m.ladder).toBeNull(); expect(m.mastery.length).toBe(1); expect(m.verified).toBe(true);
    // hiding the block hides WHEN it was taken too — a date with no number is still a fact about the owner
    expect(m.prqMeasuredAt).toBeNull(); expect(m.prqFreshness).toBeNull(); expect(m.prqNote).toBeNull();
  });
});

describe('highlights', () => {
  const sessions = [
    { id: 'a', mode: 'dunk', score: 30, won: true, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'b', mode: 'dunk', score: 45, won: false, createdAt: '2026-09-03T00:00:00Z' },
    { id: 'c', mode: 'tennis', score: 12, won: true, createdAt: '2026-09-02T00:00:00Z' },
  ];
  const sigs = [{ id: 's1', mode: 'dunk', score: 38, createdAt: '2026-09-04T00:00:00Z' }];
  it('offers one PB per mode first, then wins, then signature attempts', () => {
    const c = candidateHighlights(sessions, sigs);
    expect(c.slice(0, 2).map((x) => x.id)).toEqual(['b', 'c']);
    expect(c.map((x) => x.id)).toContain('a'); expect(c.at(-1)).toMatchObject({ id: 's1', kind: 'signature' });
  });
  it('pins only owned candidates, max six, no duplicates, labels clamped', () => {
    const c = candidateHighlights(sessions, sigs);
    const pins = normalizeHighlights([{ kind: 'session', id: 'b', label: 'x'.repeat(50) }, { kind: 'session', id: 'b' }, { kind: 'session', id: 'stolen' }, { kind: 'signature', id: 's1' }, 'junk'], c);
    expect(pins.map((p) => p.id)).toEqual(['b', 's1']); expect(pins[0].label?.length).toBe(40);
    const many = normalizeHighlights(Array.from({ length: 10 }, () => ({ kind: 'session', id: 'b' })), c);
    expect(many.length).toBe(1);
    expect(normalizeHighlights('nope', c)).toEqual([]);
  });
});

describe('records and mastery', () => {
  it('records per mode, best first', () => {
    expect(recordsByMode([{ mode: 'dunk', score: 30, won: true }, { mode: 'dunk', score: 45, won: false }, { mode: 'golf', score: 50, won: true }]))
      .toEqual([{ mode: 'golf', best: 50, sessions: 1, wins: 1 }, { mode: 'dunk', best: 45, sessions: 2, wins: 1 }]);
  });
  it('mastery labels clamp and samples reduce to a best', () => {
    expect(masteryLabel(5)).toBe('Venice Legend'); expect(masteryLabel(-2)).toBe('Unranked'); expect(masteryLabel(9)).toBe('Venice Legend');
    expect(bestSample([3, 9, 'x', 4])).toBe(9); expect(bestSample('nope')).toBeNull(); expect(bestSample([])).toBeNull();
  });
});
