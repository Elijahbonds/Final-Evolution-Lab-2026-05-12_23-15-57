// lib/coach/readiness/surveyStore.ts — COACH-DELIVERY COA-03 (2026-10-26): ReadinessSurvey in raw SQL behind the lane's probe
// (lib/coach/delivery/probe.ts). Before prisma/pending/2026-10-26-coach-delivery.sql is applied every read answers null and
// every write null; nothing 500s. One survey per athlete per day: the day's first stands (the jump check's rule).
import { randomUUID } from 'node:crypto';
import { asIso, readRows, writeRows, type RawDb } from '../delivery/probe';
import type { SurveyAnswers, SurveyBand } from './survey';

const COLS = `"id", "userId", "day", "sleep", "soreness", "energy", "mood", "ready", "lowItems", "band", "createdAt"`;

export const SQL = {
  insert:
    `INSERT INTO "ReadinessSurvey" (${COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("userId", "day") DO NOTHING`,
  forUser: `SELECT ${COLS} FROM "ReadinessSurvey" WHERE "userId" = $1 AND "day" >= $2 ORDER BY "day" DESC LIMIT 60`,
  forUsers: `SELECT ${COLS} FROM "ReadinessSurvey" WHERE "userId" = ANY($1::text[]) AND "day" >= $2 ORDER BY "day" DESC LIMIT 2000`,
  deleteAll: `DELETE FROM "ReadinessSurvey" WHERE "userId" = $1`,
} as const;

export interface StoredSurvey { id: string; userId: string; day: string; answers: SurveyAnswers; lowItems: number; band: SurveyBand; createdAt: string }

const asSurvey = (r: Record<string, unknown>): StoredSurvey => ({
  id: String(r.id), userId: String(r.userId), day: String(r.day),
  answers: { sleep: Number(r.sleep), soreness: Number(r.soreness), energy: Number(r.energy), mood: Number(r.mood), ready: Number(r.ready) },
  lowItems: Number(r.lowItems), band: r.band === 'low' ? 'low' : 'normal', createdAt: asIso(r.createdAt),
});

/** true = saved now, false = the day already had one (it stands), null = the table is not there. */
export async function insertSurvey(db: RawDb, userId: string, day: string, a: SurveyAnswers, lowItems: number, band: SurveyBand, now = Date.now()): Promise<boolean | null> {
  const n = await writeRows(db, now, 'survey_write_failed', () => db.$executeRawUnsafe(SQL.insert, randomUUID(), userId, day, a.sleep, a.soreness, a.energy, a.mood, a.ready, lowItems, band));
  return n === null ? null : n > 0;
}
export function surveysFor(db: RawDb, userId: string, sinceDay: string, now = Date.now()): Promise<StoredSurvey[] | null> {
  return readRows(db, now, 'survey_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forUser, userId, sinceDay)).map(asSurvey));
}
export async function surveysForUsers(db: RawDb, userIds: readonly string[], sinceDay: string, now = Date.now()): Promise<StoredSurvey[]> {
  if (!userIds.length) return [];
  return (await readRows(db, now, 'survey_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forUsers, [...userIds], sinceDay)).map(asSurvey))) ?? [];
}
export async function deleteSurveys(db: RawDb, userId: string, now = Date.now()): Promise<boolean> {
  return (await writeRows(db, now, 'survey_write_failed', () => db.$executeRawUnsafe(SQL.deleteAll, userId))) !== null;
}
