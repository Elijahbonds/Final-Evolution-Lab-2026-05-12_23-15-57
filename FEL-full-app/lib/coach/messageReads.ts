// lib/coach/messageReads.ts — COACH-AI Phase 8 (2026-10-07): read markers on the coach ↔ athlete thread (plan #13).
//
// THE COLUMN IS NOT ON PRODUCTION YET. ProgramMessage.readAt arrives with prisma/pending/2026-10-07-coach-ai-1-
// message-read-markers.sql, which the owner applies (owner decision 9). Until then — and in CI, whose database is
// pushed from schema.prisma, which does not carry the column either — every function here answers "not available"
// and the thread works exactly as before. Nothing here may 500 (the Knowledge Feed precedent: its routes answer 503
// without their tables; here the read markers simply do not show).
//
// WHY RAW SQL, NOT THE GENERATED CLIENT. The committed client (public/_prisma/client, a deploy artifact this lane does
// not regenerate) has never heard of readAt, so `prisma.programMessage.update({ data: { readAt } })` would not even
// type-check, and a schema.prisma change without the regenerated client turns lib/db/prismaSchemaSync.test.ts red.
// The three statements below name the column themselves (parameterised: $1, $2 — never string-built from input), and
// they work the same before and after the owner regenerates the client.
//
// FEATURE-DETECTED, NOT FLAGGED. One information_schema probe, cached: a "yes" is kept for the process (the column does
// not go away; if it ever did, the failing statement resets the cache), a "no" is re-asked after PROBE_TTL_MS so the
// markers switch on within minutes of the SQL being applied, with no deploy and no env change.
//
// MEANING. A thread has two people, the coach and the athlete. `readAt` on a message is when the OTHER person (not its
// author) first opened the thread after it was sent. So "unread" for me = written by the other side, readAt null.

import { PROBE_TTL_MS, pendingProbe, type RawDb } from './pendingSchema';

export { PROBE_TTL_MS, type RawDb };

const PROBE_SQL =
  `SELECT 1 AS "ok" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ProgramMessage' AND column_name = 'readAt' LIMIT 1`;

const UNREAD_SQL =
  `SELECT m."programId" AS "programId", COUNT(*)::int AS "n" FROM "ProgramMessage" m JOIN "CoachingProgram" p ON p."id" = m."programId" ` +
  `WHERE (p."coachId" = $1 OR p."clientId" = $1) AND m."authorId" <> $1 AND m."readAt" IS NULL GROUP BY m."programId"`;

const MARK_SQL =
  `UPDATE "ProgramMessage" SET "readAt" = (NOW() AT TIME ZONE 'UTC') WHERE "programId" = $1 AND "authorId" <> $2 AND "readAt" IS NULL`;

const STATES_SQL = `SELECT "id", "readAt" FROM "ProgramMessage" WHERE "programId" = $1`;

const probe = pendingProbe('message_reads', PROBE_SQL);

/** Tests only: forget the cached probe. */
export function resetReadMarkerProbe(): void {
  probe.reset();
}

/** Is ProgramMessage.readAt there? Never throws. */
export function readMarkersReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

const failed = (event: string, e: unknown, now: number) => probe.fail(event, e, now);

export type UnreadCounts = { available: false } | { available: true; total: number; byProgram: Record<string, number> };

/** Unread messages for this user in every thread they are part of (as coach or as athlete), by program. */
export async function unreadCounts(db: RawDb, userId: string, now: number = Date.now()): Promise<UnreadCounts> {
  if (!(await readMarkersReady(db, now))) return { available: false };
  try {
    const rows = await db.$queryRawUnsafe<{ programId: string; n: number | bigint }[]>(UNREAD_SQL, userId);
    const byProgram: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      if (n > 0) { byProgram[r.programId] = n; total += n; }
    }
    return { available: true, total, byProgram };
  } catch (e) {
    failed('message_reads_count_failed', e, now);
    return { available: false };
  }
}

/** Mark the other side's messages in one thread read. The caller has checked the user is the coach or the athlete. */
export async function markThreadRead(db: RawDb, programId: string, userId: string, now: number = Date.now()): Promise<{ available: boolean; marked: number }> {
  if (!(await readMarkersReady(db, now))) return { available: false, marked: 0 };
  try {
    const marked = await db.$executeRawUnsafe(MARK_SQL, programId, userId);
    return { available: true, marked: Number(marked) || 0 };
  } catch (e) {
    failed('message_reads_mark_failed', e, now);
    return { available: false, marked: 0 };
  }
}

/** readAt by message id for one thread, or null when the markers are not available. */
export async function threadReadStates(db: RawDb, programId: string, now: number = Date.now()): Promise<Map<string, Date | null> | null> {
  if (!(await readMarkersReady(db, now))) return null;
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; readAt: Date | string | null }[]>(STATES_SQL, programId);
    return new Map(rows.map((r) => [r.id, r.readAt ? new Date(r.readAt) : null]));
  } catch (e) {
    failed('message_reads_states_failed', e, now);
    return null;
  }
}

export interface ThreadMessage { id: string; authorId: string; body: string; createdAt: Date; programId: string }

/**
 * The thread as the route returns it. `readAt`/`unread` are present only when the markers are available (`reads` is
 * null otherwise): an unknown read state is never shown as "read" or as "0 unread".
 */
export function decorateThread(messages: readonly ThreadMessage[], userId: string, coachId: string, reads: Map<string, Date | null> | null) {
  return messages.map((m) => {
    const mine = m.authorId === userId;
    const base = { ...m, mine, fromCoach: m.authorId === coachId };
    if (!reads) return base;
    const readAt = reads.get(m.id) ?? null;
    return { ...base, readAt: readAt ? readAt.toISOString() : null, unread: !mine && !readAt };
  });
}
