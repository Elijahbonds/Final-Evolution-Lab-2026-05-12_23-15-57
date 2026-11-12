// lib/vbt/store.ts — VBT (2026-10-25): the kept sets and the coaches' zone targets, in raw SQL.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-26-vbt.sql, which the owner applies. Until
// then (and in CI) every read answers "not available" and nothing 500s — sets are kept on the athlete's phone, a coach
// sees no client sets, the zone editor waits. The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL
// switches it all on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { isZoneId, type ZoneId } from './lifts';
import { cleanSet, type KeptSet } from './sets';

export type { RawDb };

// two tables in one file; VbtZoneTarget is created last, so its presence means both are there
const probe = pendingProbe('vbt', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'VbtZoneTarget' LIMIT 1`);

/** Tests only. */
export function resetVbtProbe(): void { probe.reset(); }
export function vbtReady(db: RawDb, now: number = Date.now()): Promise<boolean> { return probe.ready(db, now); }

const SET_COLS = `"day", "lift", "loadKg", "source", "fps", "reps", "partials", "bestMcv", "meanMcv", "lastMcv", "bestPv", "lossPct", "stopPct", "repMcvs", "warmup", "band"`;

export const SQL = {
  insertSet:
    `INSERT INTO "VbtSet" ("id", "userId", ${SET_COLS}, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::double precision[], $17, $18, (NOW() AT TIME ZONE 'UTC'))`,
  setsFor: `SELECT "id", "userId", ${SET_COLS}, "createdAt" FROM "VbtSet" WHERE "userId" = $1 AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT $3`,
  setsForUsers: `SELECT "id", "userId", ${SET_COLS}, "createdAt" FROM "VbtSet" WHERE "userId" = ANY($1::text[]) AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT 2000`,
  deleteSets: `DELETE FROM "VbtSet" WHERE "userId" = $1`,
  upsertTarget:
    `INSERT INTO "VbtZoneTarget" ("id", "coachId", "sessionExerciseId", "zone", "lossStopPct", "updatedAt") VALUES ($1, $2, $3, $4, $5, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("sessionExerciseId") DO UPDATE SET "coachId" = EXCLUDED."coachId", "zone" = EXCLUDED."zone", "lossStopPct" = EXCLUDED."lossStopPct", "updatedAt" = EXCLUDED."updatedAt"`,
  deleteTarget: `DELETE FROM "VbtZoneTarget" WHERE "sessionExerciseId" = $1 AND "coachId" = $2`,
  targetsFor: `SELECT "sessionExerciseId", "zone", "lossStopPct" FROM "VbtZoneTarget" WHERE "sessionExerciseId" = ANY($1::text[])`,
} as const;

export interface StoredSet extends KeptSet { id: string; userId: string; createdAt: string }
export interface ZoneTarget { sessionExerciseId: string; zone: ZoneId; lossStopPct: number }

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function asSet(r: Record<string, unknown>): StoredSet | null {
  const createdAt = iso(r.createdAt);
  const s = cleanSet({
    day: r.day, at: Date.parse(createdAt), lift: r.lift, loadKg: numOrNull(r.loadKg), source: r.source, fps: Number(r.fps), reps: Number(r.reps),
    partials: Number(r.partials), bestMcv: numOrNull(r.bestMcv), meanMcv: numOrNull(r.meanMcv), lastMcv: numOrNull(r.lastMcv), bestPv: numOrNull(r.bestPv),
    lossPct: numOrNull(r.lossPct), stopPct: Number(r.stopPct), repMcvs: Array.isArray(r.repMcvs) ? r.repMcvs.map(Number) : [], warmup: r.warmup === true || r.warmup === 't',
    band: r.band ?? null,
  });
  return s ? { ...s, id: String(r.id), userId: String(r.userId), createdAt } : null;
}

export async function keepSet(db: RawDb, userId: string, s: KeptSet, now: number = Date.now()): Promise<string | null> {
  if (!(await vbtReady(db, now))) return null;
  const id = randomUUID();
  try {
    await db.$executeRawUnsafe(SQL.insertSet, id, userId, s.day, s.lift, s.loadKg, s.source, s.fps, s.reps, s.partials, s.bestMcv, s.meanMcv, s.lastMcv, s.bestPv, s.lossPct, s.stopPct, s.repMcvs, s.warmup, s.band);
    return id;
  } catch (e) {
    probe.fail('vbt_keep_failed', e, now);
    return null;
  }
}

/** One athlete's sets since `since`, newest first; null when the tables are not there. */
export async function setsFor(db: RawDb, userId: string, since: Date, limit = 300, now: number = Date.now()): Promise<StoredSet[] | null> {
  if (!(await vbtReady(db, now))) return null;
  try {
    return (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.setsFor, userId, since, limit)).map(asSet).filter((x): x is StoredSet => !!x);
  } catch (e) {
    probe.fail('vbt_read_failed', e, now);
    return null;
  }
}

export async function setsForUsers(db: RawDb, userIds: readonly string[], since: Date, now: number = Date.now()): Promise<StoredSet[]> {
  if (!userIds.length || !(await vbtReady(db, now))) return [];
  try {
    return (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.setsForUsers, [...userIds], since)).map(asSet).filter((x): x is StoredSet => !!x);
  } catch (e) {
    probe.fail('vbt_read_failed', e, now);
    return [];
  }
}

export async function deleteSets(db: RawDb, userId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await vbtReady(db, now))) return false;
  try { await db.$executeRawUnsafe(SQL.deleteSets, userId); return true; } catch (e) { probe.fail('vbt_delete_failed', e, now); return false; }
}

export async function setTarget(db: RawDb, coachId: string, t: ZoneTarget, now: number = Date.now()): Promise<boolean> {
  if (!(await vbtReady(db, now))) return false;
  try { await db.$executeRawUnsafe(SQL.upsertTarget, randomUUID(), coachId, t.sessionExerciseId, t.zone, t.lossStopPct); return true; } catch (e) { probe.fail('vbt_target_failed', e, now); return false; }
}

export async function clearTarget(db: RawDb, coachId: string, sessionExerciseId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await vbtReady(db, now))) return false;
  try { await db.$executeRawUnsafe(SQL.deleteTarget, sessionExerciseId, coachId); return true; } catch (e) { probe.fail('vbt_target_failed', e, now); return false; }
}

export async function targetsFor(db: RawDb, sessionExerciseIds: readonly string[], now: number = Date.now()): Promise<ZoneTarget[]> {
  if (!sessionExerciseIds.length || !(await vbtReady(db, now))) return [];
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.targetsFor, [...sessionExerciseIds]);
    return rows.filter((r) => isZoneId(r.zone)).map((r) => ({ sessionExerciseId: String(r.sessionExerciseId), zone: r.zone as ZoneId, lossStopPct: Number(r.lossStopPct) }));
  } catch (e) {
    probe.fail('vbt_read_failed', e, now);
    return [];
  }
}
