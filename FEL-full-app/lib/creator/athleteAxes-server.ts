// THE ATHLETE'S MEASURED AXES, ONE READ FOR BOTH CALLERS.
//
// HOTFIX (2026-09-24): the creator's ceilings (lib/creator/schema/ceilings.ts) are resolved against these axes.
// Finalize — POST /api/v1/creator/athlete — read them, but the page handed the editor `axes={null}` (no ceiling),
// so the editor called a build legal that Finalize then refused with a 422. Both read this function now; it moved
// out of the route because a route file may only export its handlers.
//
// HOTFIX (2026-09-24): and it reads MEASUREMENTS, not the profile row. It used to return the eight numbers on
// PlayerProfile — but getOrCreateProfile seeds that row with dice rolls (40–70 per axis) on an account's first
// /api/profile call, which every GameShell makes, so nearly every account "had axes" without ever being measured.
// Two unscanned players COULD be capped at, say, Speed 63 and Speed 91 by the roll alone, against the owner's rule
// (ceilings.ts, 2026-09-14): no PRQ means NO CEILING, never a worse athlete than the person beside you.
//
// So the axes come from the one producer that turns a measurement into an axis — `snapshotFrom`
// (lib/profile/scanToSnapshot.ts) over the athlete's PrqEntry rows. It only knows real measurement keys
// (verticalJump, sprint10m, backSquat …), so the per-attribute `drillResult` rows a game session writes — which
// copy the dice-seeded profile value — never count. An axis nobody measured is ABSENT (no ceiling on it); no
// fresh measurement at all is null (no ceiling anywhere). A reading older than the snapshot's own freshness
// window (DEFAULT_MAX_SCAN_AGE_DAYS) stops capping — absence is upside, never a penalty.
//
// Read off this tree's code (not a live measurement): nothing writes a measurement key yet — createPrqEntry only
// takes the eight axis names, which POST /api/prq/entries, the session drillResult rows and the movement-play camera
// estimate all write under. So today every athlete is uncapped, in the editor and at Finalize alike, and the
// ceilings wake up on their own when the System Scan intake starts writing measurements. That is the honest state
// — a ceiling from a dice roll was the dishonest one.

import 'server-only';
import { prisma } from '@/lib/db';
import { snapshotFrom, MEASUREMENTS, DEFAULT_MAX_SCAN_AGE_DAYS } from '@/lib/profile/scanToSnapshot';
import type { ScanRecord } from '@/lib/profile/sharedProfile';
import type { PrqAxisId } from './schema/types';

export type Axes = Partial<Record<PrqAxisId, number>> | null;

const AXIS_IDS: readonly PrqAxisId[] = ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental'];
/** Only rows snapshotFrom can read: a session writes up to eight drillResult rows, and they are never measurements. */
const MEASUREMENT_KEYS = MEASUREMENTS.map((m) => m.key);

/** The axes the athlete has actually been measured on, or null when there is no fresh measurement at all. */
export async function axesFor(userId: string, now: number = Date.now()): Promise<Axes> {
  const since = new Date(now - DEFAULT_MAX_SCAN_AGE_DAYS * 86_400_000);
  const rows = await prisma.prqEntry.findMany({
    where: { userId, attribute: { in: MEASUREMENT_KEYS }, measuredAt: { gte: since } },
    orderBy: { measuredAt: 'desc' },
    select: { attribute: true, value: true, unit: true, source: true, measuredAt: true },
  });
  const scans: ScanRecord[] = rows.map((r) => ({
    attribute: r.attribute,
    value: r.value,
    unit: r.unit ?? '',
    source: r.source ?? 'manual',
    measuredAt: r.measuredAt.toISOString(),
  }));
  const snap = snapshotFrom(scans, { now });
  if (!snap) return null;
  const axes: Partial<Record<PrqAxisId, number>> = {};
  for (const id of AXIS_IDS) {
    const v = snap.axes[id];
    if (Number.isFinite(v)) axes[id] = v;
  }
  return Object.keys(axes).length ? axes : null;
}
