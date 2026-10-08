// The traceable PRQ (lib/prq-entries.ts: /api/prq/vector, the creator card's PRQ) no longer carries a game's copy of
// recovery (MIRROR-COACH P9 fix, 2026-09-30, code review).
//
// P9 moved PRQ recovery onto recovery work (owner decision #12) and took recovery off every game row (lib/prq.ts
// MODE_ATTRS). The traceable vector is latest-wins over PrqEntry rows, and the only rows that ever named recovery were
// game sessions' 'drillResult' copies — so a trivia-era value stood there for good while the profile's number fell.
// These hold the read: a drillResult recovery row is not a measurement; every other attribute and source reads as before.
import { describe, expect, it } from 'vitest';
import { RECOVERY_RETIRED_SOURCES, computeTraceablePrq, countsInVector, getLatestPrqVector } from './prq-entries';
import { MODE_ATTRS } from './prq';

type Entry = { id: string; attribute: string; value: number; unit: string; source: string; measuredAt: Date; userId: string };
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const db = (rows: Entry[]) => ({
  prqEntry: {
    findMany: async ({ where }: { where: { userId: string } }) =>
      rows.filter((r) => r.userId === where.userId).sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()),
  },
});
const e = (id: string, attribute: string, value: number, source: string, day: string): Entry =>
  ({ id, attribute, value, unit: 'score', source, measuredAt: at(day), userId: 'u' });

describe('a game\'s recovery copy is not a measurement of recovery', () => {
  it('a trivia-era drillResult recovery (68.4) does not survive as the traceable recovery after the rule', async () => {
    const rows = [
      e('r1', 'recovery', 68.4, 'drillResult', '2026-09-29'),     // Brain Brawl's copy, the day before P9
      e('m1', 'mental', 61, 'drillResult', '2026-09-29'),
      e('s1', 'strength', 55, 'drillResult', '2026-09-28'),
    ];
    const vec = await getLatestPrqVector(db(rows) as never, 'u');
    expect(vec.has('recovery')).toBe(false);
    expect([...vec.keys()].sort()).toEqual(['mental', 'strength']);
    // recovery is unmeasured, so it is not averaged (the vector's own rule): (61 + 55) / 2
    expect(await computeTraceablePrq(db(rows) as never, 'u')).toEqual({ score: 58, measured: 2, total: 8 });
  });

  it('the control: with the rule off, that same row WOULD have been the traceable recovery (so the test can fail)', async () => {
    const rows = [e('r1', 'recovery', 68.4, 'drillResult', '2026-09-29'), e('m1', 'mental', 61, 'drillResult', '2026-09-29')];
    const naive = [...rows].sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()).find((r) => r.attribute === 'recovery');
    expect(naive?.value).toBe(68.4);
    expect(countsInVector(naive!)).toBe(false);
  });

  it('a manual or device recovery entry still counts; drillResult on every other attribute still counts', async () => {
    const rows = [
      e('r-old', 'recovery', 72, 'drillResult', '2026-09-29'),
      e('r-man', 'recovery', 57, 'manual', '2026-09-20'),
      e('p1', 'power', 64, 'drillResult', '2026-09-29'),
    ];
    const vec = await getLatestPrqVector(db(rows) as never, 'u');
    expect(vec.get('recovery')).toMatchObject({ value: 57, source: 'manual', entryId: 'r-man' });
    expect(vec.get('power')).toMatchObject({ value: 64, source: 'drillResult' });
    for (const a of ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'mental']) {
      expect(countsInVector({ attribute: a, source: 'drillResult' }), a).toBe(true);
    }
  });

  it('only drillResult is retired, and no game row can write a new one (no MODE_ATTRS row names recovery)', () => {
    expect(RECOVERY_RETIRED_SOURCES).toEqual(['drillResult']);
    expect(Object.values(MODE_ATTRS).some((attrs) => attrs.includes('recovery'))).toBe(false);
  });
});
