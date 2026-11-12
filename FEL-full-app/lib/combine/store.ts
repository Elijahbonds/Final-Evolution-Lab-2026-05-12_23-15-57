// lib/combine/store.ts — COMBINE-DAY (2026-10-25): saved combines, in raw SQL behind the pending-schema seam.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-combine-day.sql, which the owner
// applies. Until then (and in CI) every read here answers null ("not available") and every write 'not_ready': the routes
// turn that into { available: false } or a 503 combine_not_ready, never a 500, and the coach's combine stays a draft on
// their phone (lib/combine/draft.ts). The probe is the shared one (lib/coach/pendingSchema.ts), so applying the SQL
// switches saving on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';

export type { RawDb };

// the three tables arrive in one file; the results table is created last, so its presence means all three are there
const probe = pendingProbe('combine', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CombineResult' LIMIT 1`);

/** Tests only. */
export function resetCombineProbe(): void {
  probe.reset();
}

export function combineReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const EV = `"id", "coachId", "name", "teamId", "stations", "weights", "createdAt", "updatedAt"`;
const RES = `"eventId", "athleteId", "stationId", "attempt", "value", "touchCm", "method", "recordedAt"`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insertEvent: `INSERT INTO "CombineEvent" (${EV}) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, ${NOW}, ${NOW})`,
  updateEvent: `UPDATE "CombineEvent" SET "name" = $3, "weights" = $4::jsonb, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2`,
  deleteEvent: `DELETE FROM "CombineEvent" WHERE "id" = $1 AND "coachId" = $2`,
  eventById: `SELECT ${EV} FROM "CombineEvent" WHERE "id" = $1 AND "coachId" = $2`,
  eventsForCoach:
    `SELECT e."id", e."name", e."teamId", e."createdAt", e."updatedAt", (SELECT COUNT(*)::int FROM "CombineEntrant" x WHERE x."eventId" = e."id") AS "athletes" ` +
    `FROM "CombineEvent" e WHERE e."coachId" = $1 ORDER BY e."createdAt" DESC LIMIT 50`,
  insertEntrant: `INSERT INTO "CombineEntrant" ("eventId", "athleteId", "position") VALUES ($1, $2, $3) ON CONFLICT ("eventId", "athleteId") DO NOTHING`,
  entrants: `SELECT "athleteId", "position" FROM "CombineEntrant" WHERE "eventId" = $1 ORDER BY "position" ASC`,
  upsertResult:
    `INSERT INTO "CombineResult" ("id", ${RES}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${NOW}) ` +
    `ON CONFLICT ("eventId", "athleteId", "stationId", "attempt") DO UPDATE SET "value" = EXCLUDED."value", "touchCm" = EXCLUDED."touchCm", "method" = EXCLUDED."method", "recordedAt" = EXCLUDED."recordedAt"`,
  deleteResult: `DELETE FROM "CombineResult" WHERE "eventId" = $1 AND "athleteId" = $2 AND "stationId" = $3 AND "attempt" = $4`,
  resultsForEvent: `SELECT ${RES} FROM "CombineResult" WHERE "eventId" = $1`,
  /** The athlete's own entries: the events they are on (no other athlete's row is read by this one). */
  eventsForAthlete:
    `SELECT e."id", e."name", e."stations", e."createdAt" FROM "CombineEntrant" x JOIN "CombineEvent" e ON e."id" = x."eventId" ` +
    `WHERE x."athleteId" = $1 ORDER BY e."createdAt" DESC LIMIT 20`,
  /** Every result of those events, to rank the athlete within each group; only their own rows leave the server. */
  resultsForEvents: `SELECT ${RES} FROM "CombineResult" WHERE "eventId" = ANY($1::text[])`,
} as const;

const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : 0);
const json = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export interface StoredEvent { id: string; coachId: string; name: string; teamId: string | null; stations: unknown; weights: unknown; createdAt: number; updatedAt: number }
export interface EventSummary { id: string; name: string; teamId: string | null; createdAt: number; updatedAt: number; athletes: number }
export interface StoredResult { eventId: string; athleteId: string; stationId: string; attempt: number; value: number | null; touchCm: number | null; method: string; recordedAt: number }
export interface AthleteEvent { id: string; name: string; stations: unknown; createdAt: number }

function asEvent(r: Record<string, unknown>): StoredEvent | null {
  if (typeof r.id !== 'string' || typeof r.coachId !== 'string') return null;
  return {
    id: r.id, coachId: r.coachId, name: String(r.name ?? ''), teamId: typeof r.teamId === 'string' ? r.teamId : null,
    stations: json(r.stations), weights: json(r.weights), createdAt: ms(r.createdAt), updatedAt: ms(r.updatedAt),
  };
}
function asResult(r: Record<string, unknown>): StoredResult | null {
  if (typeof r.eventId !== 'string' || typeof r.athleteId !== 'string' || typeof r.stationId !== 'string') return null;
  const attempt = Number(r.attempt);
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  return { eventId: r.eventId, athleteId: r.athleteId, stationId: r.stationId, attempt, value: num(r.value), touchCm: num(r.touchCm), method: String(r.method ?? ''), recordedAt: ms(r.recordedAt) };
}

export type Write<T = true> = { ok: true; value: T } | { ok: false; error: 'not_ready' | 'failed' };
const NOT_READY = { ok: false as const, error: 'not_ready' as const };

async function read<T>(db: RawDb, event: string, fn: () => Promise<T>, now: number): Promise<T | null> {
  if (!(await combineReady(db, now))) return null;
  try { return await fn(); } catch (e) { probe.fail(`combine_${event}_failed`, e, now); return null; }
}
async function write<T>(db: RawDb, event: string, fn: () => Promise<T>, now: number): Promise<Write<T>> {
  if (!(await combineReady(db, now))) return NOT_READY;
  try { return { ok: true, value: await fn() }; } catch (e) { probe.fail(`combine_${event}_failed`, e, now); return { ok: false, error: 'failed' }; }
}

export function eventsForCoach(db: RawDb, coachId: string, now = Date.now()): Promise<EventSummary[] | null> {
  return read(db, 'list', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.eventsForCoach, coachId)).flatMap((r) =>
    typeof r.id === 'string' ? [{ id: r.id, name: String(r.name ?? ''), teamId: typeof r.teamId === 'string' ? r.teamId : null, createdAt: ms(r.createdAt), updatedAt: ms(r.updatedAt), athletes: Number(r.athletes ?? 0) }] : []), now);
}

/** The coach's own event (another coach's id reads as none). */
export function eventById(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<StoredEvent | null> {
  return read(db, 'event', async () => { const r = (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.eventById, id, coachId))[0]; return r ? asEvent(r) : null; }, now);
}

export function entrants(db: RawDb, eventId: string, now = Date.now()): Promise<string[] | null> {
  return read(db, 'entrants', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.entrants, eventId)).flatMap((r) => (typeof r.athleteId === 'string' ? [r.athleteId] : [])), now);
}

export function resultsForEvent(db: RawDb, eventId: string, now = Date.now()): Promise<StoredResult[] | null> {
  return read(db, 'results', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.resultsForEvent, eventId)).flatMap((r) => { const x = asResult(r); return x ? [x] : []; }), now);
}

export function eventsForAthlete(db: RawDb, athleteId: string, now = Date.now()): Promise<AthleteEvent[] | null> {
  return read(db, 'mine', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.eventsForAthlete, athleteId)).flatMap((r) =>
    typeof r.id === 'string' ? [{ id: r.id, name: String(r.name ?? ''), stations: json(r.stations), createdAt: ms(r.createdAt) }] : []), now);
}

export function resultsForEvents(db: RawDb, eventIds: readonly string[], now = Date.now()): Promise<StoredResult[] | null> {
  if (!eventIds.length) return Promise.resolve([]);
  return read(db, 'results_many', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.resultsForEvents, [...eventIds])).flatMap((r) => { const x = asResult(r); return x ? [x] : []; }), now);
}

export interface NewEvent { coachId: string; name: string; teamId: string | null; stations: unknown; weights: unknown; athleteIds: readonly string[] }

/** The event and its entrants. If an entrant insert fails, the event is removed again (no half-made combine). */
export function createEvent(db: RawDb, e: NewEvent, now = Date.now()): Promise<Write<string>> {
  return write(db, 'create', async () => {
    const id = randomUUID();
    await db.$executeRawUnsafe(SQL.insertEvent, id, e.coachId, e.name, e.teamId, JSON.stringify(e.stations), JSON.stringify(e.weights));
    try {
      for (let i = 0; i < e.athleteIds.length; i++) await db.$executeRawUnsafe(SQL.insertEntrant, id, e.athleteIds[i], i);
    } catch (err) {
      await db.$executeRawUnsafe(SQL.deleteEvent, id, e.coachId).catch(() => 0);
      throw err;
    }
    return id;
  }, now);
}

export function updateEvent(db: RawDb, id: string, coachId: string, name: string, weights: unknown, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'update', async () => (await db.$executeRawUnsafe(SQL.updateEvent, id, coachId, name, JSON.stringify(weights))) > 0, now);
}

export function deleteEvent(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<Write<boolean>> {
  return write(db, 'delete', async () => (await db.$executeRawUnsafe(SQL.deleteEvent, id, coachId)) > 0, now);
}

export interface ResultWrite { athleteId: string; stationId: string; attempt: number; value: number | null; touchCm: number | null; method: string }

/** Set each slot: a result upserts, an emptied slot (`clear`) deletes. Returns how many rows were written. */
export function writeResults(db: RawDb, eventId: string, rows: readonly ResultWrite[], clear: readonly Omit<ResultWrite, 'value' | 'touchCm' | 'method'>[], now = Date.now()): Promise<Write<number>> {
  return write(db, 'results_write', async () => {
    let n = 0;
    for (const r of rows) n += await db.$executeRawUnsafe(SQL.upsertResult, randomUUID(), eventId, r.athleteId, r.stationId, r.attempt, r.value, r.touchCm, r.method);
    for (const c of clear) await db.$executeRawUnsafe(SQL.deleteResult, eventId, c.athleteId, c.stationId, c.attempt);
    return n;
  }, now);
}

/** Add athletes to a saved combine (a latecomer), after the ones already on it. Already there: nothing. */
export function addEntrants(db: RawDb, eventId: string, athleteIds: readonly string[], from: number, now = Date.now()): Promise<Write<number>> {
  return write(db, 'entrants_add', async () => {
    let n = 0;
    for (let i = 0; i < athleteIds.length; i++) n += await db.$executeRawUnsafe(SQL.insertEntrant, eventId, athleteIds[i], from + i);
    return n;
  }, now);
}
