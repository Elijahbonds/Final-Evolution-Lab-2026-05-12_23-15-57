// THE EDITOR CAPS WHERE FINALIZE CAPS — AND ONLY ON WHAT WAS MEASURED.
//
// HOTFIX (2026-09-24): the athlete creator page passed `axes={null}` (no ceilings) while Finalize validated against
// the profile row, so a build the editor called legal came back 422. Both read axesFor now. And the review caught
// that the profile row is not a measurement: getOrCreateProfile seeds it with dice rolls of 40–70, so "no scan, no
// ceiling" was false for nearly every account. axesFor reads measured PrqEntry rows through snapshotFrom instead.
// The database is mocked; the page and the route are held by their source (app/ is not a vitest root).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../testing/sourceScan';
import { axisValue, measurementFor, DEFAULT_MAX_SCAN_AGE_DAYS } from '../profile/scanToSnapshot';
import { ceilingFor, NO_PRQ_CAP } from './schema/ceilings';

const findMany = vi.fn();
const profileRead = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    prqEntry: { findMany: (...a: unknown[]) => findMany(...a) },
    playerProfile: { findUnique: (...a: unknown[]) => profileRead(...a) },
  },
}));

import { axesFor } from './athleteAxes-server';

const ROOT = join(__dirname, '..', '..');
const src = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));
const NOW = Date.parse('2026-09-24T12:00:00Z');
const DAY = 86_400_000;
type Row = { attribute: string; value: number; unit: string; source: string; measuredAt: Date };
/** The PrqEntry table, honouring the route's `where` the way Prisma would (attribute IN, measuredAt gte). */
function table(rows: Row[]) {
  findMany.mockImplementation(async ({ where }: { where: { userId: string; attribute?: { in: string[] }; measuredAt?: { gte: Date } } }) =>
    rows
      .filter((r) => !where.attribute || where.attribute.in.includes(r.attribute))
      .filter((r) => !where.measuredAt || r.measuredAt >= where.measuredAt.gte)
      .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()));
}
const speedRow = { id: 'speed', prqAxis: 'speed' as const, max: 99 };

describe('axesFor reads measurements, never the dice-seeded profile row', () => {
  beforeEach(() => { findMany.mockReset(); profileRead.mockReset(); });

  it('an account with a profile row and no measurement has no axes — and so no ceiling anywhere', async () => {
    // the row getOrCreateProfile makes on a first visit: random 40–70 on every axis
    profileRead.mockResolvedValue({ strength: 41, speed: 69, endurance: 55, agility: 60, power: 44, flexibility: 50, recovery: 62, mental: 58 });
    table([]);
    const axes = await axesFor('u1', NOW);
    expect(axes).toBeNull();
    expect(profileRead).not.toHaveBeenCalled();
    expect(ceilingFor(speedRow, axes)).toBe(NO_PRQ_CAP);
  });

  it('the drillResult rows a game session writes (the profile value, under the axis name) are not measurements', async () => {
    table([
      { attribute: 'speed', value: 69.5, unit: 'score', source: 'drillResult', measuredAt: new Date(NOW - DAY) },
      { attribute: 'power', value: 44, unit: 'in', source: 'manual', measuredAt: new Date(NOW - DAY) },
    ]);
    expect(await axesFor('u1', NOW)).toBeNull();
  });

  it('a real measurement becomes its axis — and only that axis is capped', async () => {
    table([{ attribute: 'sprint10m', value: 1.9, unit: 'sec', source: 'manual', measuredAt: new Date(NOW - 2 * DAY) }]);
    const axes = await axesFor('u1', NOW);
    const expected = axisValue(measurementFor('sprint10m')!, 1.9)!;
    expect(axes).toEqual({ speed: expected });
    expect(ceilingFor(speedRow, axes)).toBe(Math.max(55, Math.min(99, expected + 22)));
    expect(ceilingFor({ prqAxis: 'strength', max: 99 }, axes)).toBe(NO_PRQ_CAP);   // never measured: never capped
    // the query asks the table for measurement keys inside the freshness window, not a user's whole history
    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.attribute.in).toContain('sprint10m');
    expect(where.attribute.in).not.toContain('speed');
    expect(where.measuredAt.gte.getTime()).toBe(NOW - DEFAULT_MAX_SCAN_AGE_DAYS * DAY);
  });

  it('a measurement older than the snapshot\'s freshness window stops capping — absence is never a penalty', async () => {
    table([{ attribute: 'verticalJump', value: 30, unit: 'in', source: 'manual', measuredAt: new Date(NOW - (DEFAULT_MAX_SCAN_AGE_DAYS + 5) * DAY) }]);
    expect(await axesFor('u1', NOW)).toBeNull();
  });
});

describe('the page and Finalize read the same axes', () => {
  it('the creator page hands the editor axesFor, not a hard-coded null', () => {
    const page = src('app/creator/athlete/page.tsx');
    expect(page).not.toMatch(/axes=\{null\}/);
    expect(page).toMatch(/await axesFor\(/);
  });

  it('Finalize validates against axesFor too', () => {
    const route = src('app/api/v1/creator/athlete/route.ts');
    expect(route).toMatch(/from '@\/lib\/creator\/athleteAxes-server'/);
    expect(route).toMatch(/validateForSave\(values, prq\)/);
    expect(route).toMatch(/const prq = await axesFor\(userId\)/);
  });

  it('axesFor never touches the profile row', () => {
    expect(src('lib/creator/athleteAxes-server.ts')).not.toMatch(/playerProfile/);
  });
});
