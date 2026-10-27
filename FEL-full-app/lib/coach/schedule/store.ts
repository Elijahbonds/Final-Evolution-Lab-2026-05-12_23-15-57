// lib/coach/schedule/store.ts — COACH-DELIVERY COA-05 (2026-10-26): CoachRosterSession and CoachCalendarFeed in raw SQL behind
// the lane's probe (lib/coach/delivery/probe.ts). Before prisma/pending/2026-10-26-coach-delivery.sql is applied every read
// answers null and every write null/false; nothing 500s. Every statement is parameterised; ids are made here.
import { randomUUID } from 'node:crypto';
import { asIso, readRows, strOrNull, writeRows, type RawDb } from '../delivery/probe';
import type { CleanSession, SessionScope } from './rules';

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const S = `"id", "coachId", "title", "startsAt", "minutes", "place", "scope", "scopeId", "cancelledAt", "updatedAt"`;

export const SQL = {
  insert: `INSERT INTO "CoachRosterSession" ("id", "coachId", "title", "startsAt", "minutes", "place", "scope", "scopeId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${NOW}, ${NOW})`,
  update: `UPDATE "CoachRosterSession" SET "title" = $3, "startsAt" = $4, "minutes" = $5, "place" = $6, "scope" = $7, "scopeId" = $8, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "cancelledAt" IS NULL`,
  cancel: `UPDATE "CoachRosterSession" SET "cancelledAt" = ${NOW}, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "cancelledAt" IS NULL`,
  forCoach: `SELECT ${S} FROM "CoachRosterSession" WHERE "coachId" = $1 AND "startsAt" >= $2 AND "startsAt" < $3 ORDER BY "startsAt" ASC LIMIT 500`,
  forCoaches: `SELECT ${S} FROM "CoachRosterSession" WHERE "coachId" = ANY($1::text[]) AND "startsAt" >= $2 AND "startsAt" < $3 ORDER BY "startsAt" ASC LIMIT 1000`,
  feedNonce: `SELECT "nonce" FROM "CoachCalendarFeed" WHERE "userId" = $1`,
  setFeed: `INSERT INTO "CoachCalendarFeed" ("userId", "nonce", "createdAt") VALUES ($1, $2, ${NOW}) ON CONFLICT ("userId") DO UPDATE SET "nonce" = EXCLUDED."nonce", "createdAt" = EXCLUDED."createdAt"`,
  dropFeed: `DELETE FROM "CoachCalendarFeed" WHERE "userId" = $1`,
} as const;

export interface SessionRow { id: string; coachId: string; title: string; startsAt: Date; minutes: number; place: string | null; scope: SessionScope; scopeId: string | null; cancelledAt: string | null; updatedAt: Date }

const asSession = (r: Record<string, unknown>): SessionRow => ({
  id: String(r.id), coachId: String(r.coachId), title: String(r.title), startsAt: new Date(asIso(r.startsAt)), minutes: Number(r.minutes), place: strOrNull(r.place),
  scope: (r.scope === 'athlete' || r.scope === 'team' ? r.scope : 'roster') as SessionScope, scopeId: strOrNull(r.scopeId),
  cancelledAt: r.cancelledAt == null ? null : asIso(r.cancelledAt), updatedAt: new Date(asIso(r.updatedAt)),
});

export async function insertSession(db: RawDb, coachId: string, s: CleanSession, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await writeRows(db, now, 'schedule_write_failed', () => db.$executeRawUnsafe(SQL.insert, id, coachId, s.title, s.startsAt, s.minutes, s.place, s.scope, s.scopeId));
  return n ? id : null;
}
export async function updateSession(db: RawDb, id: string, coachId: string, s: CleanSession, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'schedule_write_failed', () => db.$executeRawUnsafe(SQL.update, id, coachId, s.title, s.startsAt, s.minutes, s.place, s.scope, s.scopeId))) ?? 0) > 0;
}
export async function cancelSession(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'schedule_write_failed', () => db.$executeRawUnsafe(SQL.cancel, id, coachId))) ?? 0) > 0;
}
export function sessionsForCoach(db: RawDb, coachId: string, from: Date, to: Date, now = Date.now()): Promise<SessionRow[] | null> {
  return readRows(db, now, 'schedule_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forCoach, coachId, from, to)).map(asSession));
}
export async function sessionsForCoaches(db: RawDb, coachIds: readonly string[], from: Date, to: Date, now = Date.now()): Promise<SessionRow[] | null> {
  if (!coachIds.length) return [];
  return readRows(db, now, 'schedule_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forCoaches, [...coachIds], from, to)).map(asSession));
}
export async function feedNonce(db: RawDb, userId: string, now = Date.now()): Promise<string | null> {
  const rows = await readRows(db, now, 'schedule_read_failed', () => db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.feedNonce, userId));
  return rows?.[0]?.nonce ? String(rows[0].nonce) : null;
}
export async function setFeedNonce(db: RawDb, userId: string, nonce: string, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'schedule_write_failed', () => db.$executeRawUnsafe(SQL.setFeed, userId, nonce))) ?? 0) > 0;
}
export async function dropFeed(db: RawDb, userId: string, now = Date.now()): Promise<boolean> {
  return (await writeRows(db, now, 'schedule_write_failed', () => db.$executeRawUnsafe(SQL.dropFeed, userId))) !== null;
}
