/**
 * lib/prq-entries.ts — PRQ / Digital-Twin Foundation.
 *
 * HONEST data model: every PRQ value has { source, measuredAt, unit }.
 * source enum: manual | device | drillResult | camera.
 * ‘device’ is a typed SEAM (interface only) — no integration in v1.
 * ‘camera’ is a body-camera ESTIMATE (movement play, 2026-09-24): the session's best measured jump as power, written
 * by /api/sessions only. It counts in the vector; no verified shield stands on it (lib/prq.ts isPrqEstimate).
 *
 * Integrity rules enforced in code:
 *   - No value without source + timestamp.
 *   - Unmeasured attribute = null (“not measured”) — never a guess.
 *   - drillResult entries flow through the session-result path only.
 *   - Client cannot write PRQ directly (server-owned create path).
 */

import { Prisma, type PrismaClient } from '@/public/_prisma/client';
import { PRQ_ATTRS, PRQ_CAMERA_SOURCE, type PrqAttr } from '@/lib/prq';

export type DbClient = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Source enum
// ---------------------------------------------------------------------------
// 'camera' is its own value rather than 'device': 'device' is the seam for synced wearables (DeviceSource below:
// provider + deviceId), and a camera estimate has neither.
export const PRQ_SOURCES = ['manual', 'device', 'drillResult', PRQ_CAMERA_SOURCE] as const;
export type PrqSource = (typeof PRQ_SOURCES)[number];

// ---------------------------------------------------------------------------
// Device source seam (typed interface, no integration in v1)
// ---------------------------------------------------------------------------
export interface DeviceSource {
  provider: string;        // e.g. 'apple_health', 'garmin', 'whoop'
  deviceId: string;
  syncedAt: Date;
  rawPayload?: unknown;
}

// Placeholder — future integration will implement this interface.
// v1 does NOT call this; it exists solely as the typed seam.
export function isDeviceSourceValid(_ds: DeviceSource): boolean {
  return !!_ds.provider && !!_ds.deviceId && _ds.syncedAt instanceof Date;
}

// ---------------------------------------------------------------------------
// Attribute unit hints (for the manual entry UI)
// ---------------------------------------------------------------------------
export const ATTR_UNITS: Record<PrqAttr, string[]> = {
  strength:    ['lbs', 'kg', 'score'],
  speed:       ['mph', 'sec', 'score'],
  endurance:   ['min', 'reps', 'score'],
  agility:     ['sec', 'score'],
  power:       ['in', 'cm', 'watts', 'score'],
  flexibility: ['in', 'cm', 'score'],
  recovery:    ['hrs', 'score'],
  mental:      ['score'],
};

export const ATTR_LABELS: Record<PrqAttr, string> = {
  strength:    'Strength',
  speed:       'Speed',
  endurance:   'Endurance',
  agility:     'Agility',
  power:       'Power',
  flexibility: 'Flexibility',
  recovery:    'Recovery',
  mental:      'Mental',
};

// ---------------------------------------------------------------------------
// Create entry (server-owned)
// ---------------------------------------------------------------------------
export interface CreatePrqEntryInput {
  userId: string;
  attribute: PrqAttr;
  value: number;
  unit: string;
  source: PrqSource;
  measuredAt: Date;
  sessionId?: string | null;
}

/** Validates and creates a PrqEntry. Throws on integrity violations. */
export async function createPrqEntry(
  db: DbClient,
  input: CreatePrqEntryInput
): Promise<{ id: string }> {
  if (!PRQ_ATTRS.includes(input.attribute as any)) {
    throw new Error(`Invalid PRQ attribute: ${input.attribute}`);
  }
  if (!PRQ_SOURCES.includes(input.source)) {
    throw new Error(`Invalid PRQ source: ${input.source}`);
  }
  if (!Number.isFinite(input.value)) {
    throw new Error('PRQ value must be a finite number');
  }
  if (!input.unit || typeof input.unit !== 'string') {
    throw new Error('PRQ unit is required');
  }
  if (!(input.measuredAt instanceof Date) || isNaN(input.measuredAt.getTime())) {
    throw new Error('PRQ measuredAt must be a valid Date');
  }
  if (input.source === 'drillResult' && !input.sessionId) {
    throw new Error('drillResult entries require a sessionId');
  }
  // a camera estimate is traceable to the session that measured it, like a drill result
  if (input.source === PRQ_CAMERA_SOURCE && !input.sessionId) {
    throw new Error('camera entries require a sessionId');
  }

  const row = await (db as any).prqEntry.create({
    data: {
      userId: input.userId,
      attribute: input.attribute,
      value: input.value,
      unit: input.unit,
      source: input.source,
      sessionId: input.sessionId ?? null,
      measuredAt: input.measuredAt,
    },
    select: { id: true },
  });
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Query: latest value per attribute (the “honest PRQ vector”)
// ---------------------------------------------------------------------------
export interface PrqAttributeValue {
  attribute: PrqAttr;
  value: number;
  unit: string;
  source: PrqSource;
  measuredAt: Date;
  entryId: string;
}

/**
 * MIRROR-COACH P9 fix (2026-09-30, code review): A GAME'S RECOVERY IS NOT A MEASUREMENT ANY MORE.
 *
 * Owner decision #12 moved PRQ recovery onto recovery work (cool-downs, off days, easy-cardio minutes — lib/prq-engine.ts
 * "PRQ recovery"), settled on PlayerProfile.recovery. The only PrqEntry rows that ever carried recovery were game
 * sessions' 'drillResult' copies of that profile value (app/api/sessions/route.ts), for the modes whose MODE_ATTRS row
 * named recovery — trivia (Brain Brawl, Who Scene It) and the Iron Paradise gym game. P9 took recovery off all three
 * rows, so no new such row is written; but this vector is latest-wins, so the last trivia-era row stood as "recovery"
 * in the traceable PRQ (/api/prq/vector, the creator card's PRQ) for good — trivia's inflation, frozen, while the
 * profile's number fell. Those rows are read as NOT A MEASUREMENT of recovery: recovery is then "not measured" here
 * (absent, and so not averaged — the vector's own rule for an unmeasured axis) unless a manual or device entry says
 * otherwise. Nothing is deleted (the rows stay, for export and history); every other attribute and source is read
 * exactly as before.
 */
export const RECOVERY_RETIRED_SOURCES: readonly PrqSource[] = ['drillResult'];

/** Whether a stored entry counts in the latest-value vector (false only for a retired recovery source, above). */
export function countsInVector(entry: { attribute: string; source: string }): boolean {
  return !(entry.attribute === 'recovery' && (RECOVERY_RETIRED_SOURCES as readonly string[]).includes(entry.source));
}

/** Returns the latest entry per attribute. Missing attrs → absent from the map. */
export async function getLatestPrqVector(
  db: DbClient,
  userId: string
): Promise<Map<PrqAttr, PrqAttributeValue>> {
  const map = new Map<PrqAttr, PrqAttributeValue>();

  // Single query: fetch all entries for this user, ordered by measuredAt desc.
  // Then pick the first (latest) per attribute in JS — avoids 8 parallel DB connections.
  const allEntries = await (db as any).prqEntry.findMany({
    where: { userId },
    orderBy: { measuredAt: 'desc' },
    select: { id: true, attribute: true, value: true, unit: true, source: true, measuredAt: true },
  });

  for (const entry of allEntries) {
    const attr = entry.attribute as PrqAttr;
    if (!countsInVector(entry)) continue;   // MIRROR-COACH P9 fix: a game's recovery copy (RECOVERY_RETIRED_SOURCES)
    if (!map.has(attr) && PRQ_ATTRS.includes(attr)) {
      map.set(attr, {
        attribute: attr,
        value: entry.value,
        unit: entry.unit,
        source: entry.source as PrqSource,
        measuredAt: entry.measuredAt,
        entryId: entry.id,
      });
    }
  }

  return map;
}

/** All entries for a user, most recent first. */
export async function listPrqEntries(
  db: DbClient,
  userId: string,
  opts?: { limit?: number }
): Promise<Array<{
  id: string;
  attribute: string;
  value: number;
  unit: string;
  source: string;
  sessionId: string | null;
  measuredAt: Date;
  createdAt: Date;
}>> {
  return (db as any).prqEntry.findMany({
    where: { userId },
    orderBy: { measuredAt: 'desc' },
    take: opts?.limit ?? 200,
  });
}

/** Hard delete all PRQ entries for a user. Returns count deleted. */
export async function deletePrqEntries(
  db: DbClient,
  userId: string
): Promise<number> {
  const result = await (db as any).prqEntry.deleteMany({ where: { userId } });
  return result.count;
}

/**
 * Compute the traceable PRQ score from stored entries.
 * Each attribute’s latest value is normalized to 0-100 (assumed score scale for now);
 * the PRQ = average. Unmeasured attrs do NOT count toward the average.
 * Returns { score, measured, total }.
 */
export async function computeTraceablePrq(
  db: DbClient,
  userId: string
): Promise<{ score: number; measured: number; total: number }> {
  const vec = await getLatestPrqVector(db, userId);
  if (vec.size === 0) return { score: 0, measured: 0, total: PRQ_ATTRS.length };
  let sum = 0;
  for (const v of vec.values()) sum += v.value;
  return {
    score: Math.round((sum / vec.size) * 10) / 10,
    measured: vec.size,
    total: PRQ_ATTRS.length,
  };
}
