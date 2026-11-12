// lib/coach/habits/store.ts — COACH-PARITY (2026-10-26): coach habits and the athletes' ticks, in raw SQL behind the
// pending-schema seam (lib/coach/parity/probe.ts). Before prisma/pending/2026-10-26-coach-parity.sql is applied every read
// answers null and every write false; nothing 500s. Every statement is parameterised; ids are made here.
import { randomUUID } from 'node:crypto';
import { parityFail, parityReady, type RawDb } from '../parity/probe';
import type { Topic } from '../parity/topic';
import type { Frequency, HabitKind } from './rules';

export type { RawDb };

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const H = `"id", "coachId", "scope", "scopeId", "preset", "label", "kind", "target", "unit", "frequency", "perWeek", "topic", "archivedAt", "createdAt"`;

export const SQL = {
  insertHabit: `INSERT INTO "CoachHabit" (${H}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, ${NOW})`,
  archiveHabit: `UPDATE "CoachHabit" SET "archivedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  habitsForCoach: `SELECT ${H} FROM "CoachHabit" WHERE "coachId" = $1 AND "archivedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 200`,
  habitsFor:
    `SELECT ${H} FROM "CoachHabit" WHERE "archivedAt" IS NULL AND "coachId" = ANY($3::text[]) ` +
    `AND (("scope" = 'athlete' AND "scopeId" = $1) OR ("scope" = 'team' AND "scopeId" = ANY($2::text[]))) ORDER BY "createdAt" ASC`,
  upsertTick:
    `INSERT INTO "CoachHabitTick" ("id", "habitId", "athleteId", "day", "value", "createdAt") VALUES ($1, $2, $3, $4, $5, ${NOW}) ` +
    `ON CONFLICT ("habitId", "athleteId", "day") DO UPDATE SET "value" = EXCLUDED."value"`,
  deleteTick: `DELETE FROM "CoachHabitTick" WHERE "habitId" = $1 AND "athleteId" = $2 AND "day" = $3`,
  ticksForAthlete: `SELECT "habitId", "athleteId", "day", "value" FROM "CoachHabitTick" WHERE "athleteId" = $1 AND "habitId" = ANY($2::text[]) AND "day" >= $3`,
  ticksForHabits: `SELECT "habitId", "athleteId", "day", "value" FROM "CoachHabitTick" WHERE "habitId" = ANY($1::text[]) AND "day" >= $2`,
} as const;

export interface HabitRow {
  id: string; coachId: string; scope: 'athlete' | 'team'; scopeId: string; preset: string; label: string; kind: HabitKind;
  target: number | null; unit: string | null; frequency: Frequency; perWeek: number | null; topic: Topic; archivedAt: string | null; createdAt: string;
}
export interface TickRow { habitId: string; athleteId: string; day: string; value: number | null }

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function asHabit(r: Record<string, unknown>): HabitRow {
  return {
    id: String(r.id), coachId: String(r.coachId), scope: r.scope === 'team' ? 'team' : 'athlete', scopeId: String(r.scopeId), preset: String(r.preset),
    label: String(r.label), kind: r.kind === 'count' ? 'count' : 'check', target: numOrNull(r.target), unit: r.unit == null ? null : String(r.unit),
    frequency: r.frequency === 'weekly' ? 'weekly' : 'daily', perWeek: numOrNull(r.perWeek), topic: r.topic === 'health' ? 'health' : 'training',
    archivedAt: r.archivedAt == null ? null : iso(r.archivedAt), createdAt: iso(r.createdAt),
  };
}
const asTick = (r: Record<string, unknown>): TickRow => ({ habitId: String(r.habitId), athleteId: String(r.athleteId), day: String(r.day), value: numOrNull(r.value) });

async function read<T>(db: RawDb, now: number, run: () => Promise<T>): Promise<T | null> {
  if (!(await parityReady(db, now))) return null;
  try { return await run(); } catch (e) { parityFail('habit_read_failed', e, now); return null; }
}
async function write(db: RawDb, now: number, run: () => Promise<number>): Promise<number | null> {
  if (!(await parityReady(db, now))) return null;
  try { return Number(await run()); } catch (e) { parityFail('habit_write_failed', e, now); return null; }
}

export type NewHabit = Omit<HabitRow, 'id' | 'archivedAt' | 'createdAt'>;

export async function insertHabit(db: RawDb, h: NewHabit, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await write(db, now, () => db.$executeRawUnsafe(SQL.insertHabit, id, h.coachId, h.scope, h.scopeId, h.preset, h.label, h.kind, h.target, h.unit, h.frequency, h.perWeek, h.topic));
  return n ? id : null;
}
export async function archiveHabit(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<boolean> {
  return ((await write(db, now, () => db.$executeRawUnsafe(SQL.archiveHabit, id, coachId))) ?? 0) > 0;
}
export function habitsForCoach(db: RawDb, coachId: string, now = Date.now()): Promise<HabitRow[] | null> {
  return read(db, now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.habitsForCoach, coachId)).map(asHabit));
}
export async function habitsFor(db: RawDb, athleteId: string, teamIds: readonly string[], coachIds: readonly string[], now = Date.now()): Promise<HabitRow[] | null> {
  if (!coachIds.length) return (await parityReady(db, now)) ? [] : null;
  return read(db, now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.habitsFor, athleteId, [...teamIds], [...coachIds])).map(asHabit));
}
export async function setTick(db: RawDb, habitId: string, athleteId: string, day: string, value: number | null, now = Date.now()): Promise<boolean> {
  return ((await write(db, now, () => db.$executeRawUnsafe(SQL.upsertTick, randomUUID(), habitId, athleteId, day, value))) ?? 0) > 0;
}
export async function clearTick(db: RawDb, habitId: string, athleteId: string, day: string, now = Date.now()): Promise<boolean | null> {
  const n = await write(db, now, () => db.$executeRawUnsafe(SQL.deleteTick, habitId, athleteId, day));
  return n === null ? null : true;
}
export async function ticksForAthlete(db: RawDb, athleteId: string, habitIds: readonly string[], sinceDay: string, now = Date.now()): Promise<TickRow[] | null> {
  if (!habitIds.length) return [];
  return read(db, now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.ticksForAthlete, athleteId, [...habitIds], sinceDay)).map(asTick));
}
export async function ticksForHabits(db: RawDb, habitIds: readonly string[], sinceDay: string, now = Date.now()): Promise<TickRow[] | null> {
  if (!habitIds.length) return [];
  return read(db, now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.ticksForHabits, [...habitIds], sinceDay)).map(asTick));
}
