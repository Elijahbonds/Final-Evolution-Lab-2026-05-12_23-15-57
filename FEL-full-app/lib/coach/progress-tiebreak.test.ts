// MIRROR-TZ (2026-10-08): progressSeries' explicit completedAt tie-break — when two logs of one exercise share a
// completedAt (saveClientLog stamps it with `new Date()`, so two saves in one millisecond tie), the LATER-SAVED log
// sorts last: by the log's own createdAt first, then by its id (Prisma's cuid grows in insert order within one server
// process — the last step, never the main rule). A full tie keeps input order (the sort is stable). updatedAt is
// never a key: a coach comment rewrites it later. Pure tests over progressSeries/lastTimeLine — no routes, no DB.
import { describe, expect, it } from 'vitest';
import { lastTimeLine, progressSeries, type LogRow } from './loop';

const AT = '2026-10-08T04:40:00.000Z'; // one shared completedAt: the same millisecond

/** Day 1's log / Day 2's log, shaped like the rows lastTimeFor pushes (the catalogue id is exerciseName there). */
const day1 = (over: Partial<LogRow> = {}): LogRow => ({
  exerciseName: 'pe-goblet', completedAt: AT, actualLoad: '60 kg', actualReps: '8,8,8', rpe: 7, actualSets: 3, ...over,
});
const day2 = (over: Partial<LogRow> = {}): LogRow => ({
  exerciseName: 'pe-goblet', completedAt: AT, actualLoad: '62.5 kg', actualReps: '8,8,7', rpe: 8, actualSets: 3, ...over,
});
/** The newest point, as Today's "last time" reads it. */
const lastOf = (logs: LogRow[]) => progressSeries(logs)['pe-goblet'].at(-1);

describe('progressSeries breaks a completedAt tie by when the log was SAVED', () => {
  it('same completedAt, savedAt 1 s apart: the newer-saved log is last in BOTH input orders', () => {
    const older = day1({ savedAt: new Date('2026-10-08T04:40:01.000Z'), id: 'log-1' });
    const newer = day2({ savedAt: new Date('2026-10-08T04:40:02.000Z'), id: 'log-2' });
    for (const logs of [[older, newer], [newer, older]]) {
      const last = lastOf(logs)!;
      expect(last.loadText).toBe('62.5 kg');
      expect(last.repsText).toBe('8,8,7');
      expect(lastTimeLine(last)).toBe('Last time: 3 sets: 8, 8, 7 @ 62.5 kg');
    }
  });

  it('savedAt as an ISO string sorts the same; an unparseable savedAt reads as missing', () => {
    const older = day1({ savedAt: 'not a date', id: 'log-1' });
    const newer = day2({ savedAt: '2026-10-08T04:40:01.500Z', id: 'log-2' });
    for (const logs of [[older, newer], [newer, older]]) {
      expect(lastOf(logs)!.loadText).toBe('62.5 kg');
    }
  });

  it('same completedAt AND same savedAt: the larger id (cuid-shaped, created later in the same process) is last in BOTH input orders', () => {
    const earlier = day1({ savedAt: new Date('2026-10-08T04:40:01.000Z'), id: 'ckzaaaa0000' });
    const later = day2({ savedAt: new Date('2026-10-08T04:40:01.000Z'), id: 'ckzaaaa0001' });
    for (const logs of [[earlier, later], [later, earlier]]) {
      const last = lastOf(logs)!;
      expect(last.loadText).toBe('62.5 kg');
      expect(lastTimeLine(last)).toBe('Last time: 3 sets: 8, 8, 7 @ 62.5 kg');
    }
  });

  it('completedAt still decides when savedAt and id point the other way', () => {
    const old = day1({ completedAt: '2026-10-01T10:00:00.000Z', savedAt: new Date('2026-10-08T04:40:02.000Z'), id: 'ckzzzzz9999' });
    const fresh = day2({ completedAt: AT, savedAt: new Date('2026-10-01T10:00:01.000Z'), id: 'ckaaaaa0000' });
    for (const logs of [[old, fresh], [fresh, old]]) {
      expect(lastOf(logs)!.at).toBe(AT);
      expect(lastOf(logs)!.loadText).toBe('62.5 kg');
    }
  });

  it('a full tie with no savedAt or id keeps input order (rows from before this change), and the tie keys never reach a point', () => {
    const first = day1();
    const second = day2();
    expect(lastOf([first, second])!.loadText).toBe('62.5 kg'); // stable: the second row stays last
    expect(lastOf([second, first])!.loadText).toBe('60 kg');   // reversed: the other row is last
    expect(Object.keys(lastOf([first, second])!).sort()).toEqual(['at', 'load', 'loadText', 'reps', 'repsText', 'rpe', 'sets']);
  });
});
