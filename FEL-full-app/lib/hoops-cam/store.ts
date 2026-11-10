// lib/hoops-cam/store.ts — BBS-04 (2026-11-03): an adult's kept shot and dribble sessions, in raw SQL.
//
// THE TABLE IS NOT ON PRODUCTION YET: it arrives with prisma/pending/2026-11-03-hoops-cam.sql, which the owner applies.
// Until then (and in CI) every read answers "not available" and nothing 500s: sessions stay on the player's phone and a
// coach's shot charts stay dark. The probe is the shared one (lib/coach/pendingSchema.ts), as the VBT store's is
// (lib/vbt/store.ts): applying the SQL switches it on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here. What is
// written is cleanSession's output (numbers only, never a frame).
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { cleanSession, type HoopsSession } from './log';

export type { RawDb };

const probe = pendingProbe('hoopscam', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'HoopsCamSession' LIMIT 1`);

/** Tests only. */
export function resetHoopsProbe(): void { probe.reset(); }
export function hoopsReady(db: RawDb, now: number = Date.now()): Promise<boolean> { return probe.ready(db, now); }

/** (new) The most sessions one coach read returns (a team of 15, a few weeks of daily sessions). */
export const READ_CAP = 600;

export const SQL = {
  insertSession: `INSERT INTO "HoopsCamSession" ("id", "userId", "kind", "day", "startedAt", "data", "createdAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, (NOW() AT TIME ZONE 'UTC'))`,
  sessionsForUsers: `SELECT "userId", "data", "createdAt" FROM "HoopsCamSession" WHERE "userId" = ANY($1::text[]) AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT ${READ_CAP}`,
  deleteSessions: `DELETE FROM "HoopsCamSession" WHERE "userId" = $1`,
} as const;

export interface StoredSession { userId: string; session: HoopsSession }

const parse = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

/** Keep one session. null when the table is not there or the write failed (the caller answers 503). */
export async function keepSession(db: RawDb, userId: string, s: HoopsSession, now: number = Date.now()): Promise<string | null> {
  const clean = cleanSession(s);
  if (!clean || !(await hoopsReady(db, now))) return null;
  const id = randomUUID();
  try {
    await db.$executeRawUnsafe(SQL.insertSession, id, userId, clean.kind, clean.day, new Date(clean.at), JSON.stringify(clean));
    return id;
  } catch (e) {
    probe.fail('hoopscam_keep_failed', e, now);
    return null;
  }
}

/** These players' sessions since `since`, newest first (each one shape-checked again on the way out). */
export async function sessionsForUsers(db: RawDb, userIds: readonly string[], since: Date, now: number = Date.now()): Promise<StoredSession[]> {
  if (!userIds.length || !(await hoopsReady(db, now))) return [];
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.sessionsForUsers, [...userIds], since);
    return rows.flatMap((r) => { const s = cleanSession(parse(r.data)); return s ? [{ userId: String(r.userId), session: s }] : []; });
  } catch (e) {
    probe.fail('hoopscam_read_failed', e, now);
    return [];
  }
}

export async function deleteSessions(db: RawDb, userId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await hoopsReady(db, now))) return false;
  try { await db.$executeRawUnsafe(SQL.deleteSessions, userId); return true; } catch (e) { probe.fail('hoopscam_delete_failed', e, now); return false; }
}
