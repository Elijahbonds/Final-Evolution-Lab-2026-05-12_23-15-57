// lib/signature/store.ts — SIGNATURE-PROGRAMS (2026-10-25): the owner's review rows and the athletes' enrollments, in raw SQL.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-signature-programs.sql, which the owner
// applies. Until then (and in CI) every read answers "not ready" and nothing 500s: every program reads as a draft, so no
// athlete sees one; the admin previews them and reads their checks; approving, editing and starting are refused by the
// server with 503 signature_not_ready. The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL switches
// it all on within ~5 minutes, with no deploy. Every statement is parameterised; nothing from a request is put into SQL
// text. Ids are made here (node:crypto randomUUID).
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { Enrollment, PlanEvent, SignatureId } from './types';
import type { ProgramEdits } from './edits';
import type { ReviewStatus } from './access';

export type { RawDb };

// the enrollment table is created last: its presence means both are there
const probe = pendingProbe('signature_programs', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'SignatureEnrollment' LIMIT 1`);

export function signatureReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** Tests only. */
export function resetSignatureProbe(): void {
  probe.reset();
}

const ENROLL_COLS = `"id", "userId", "programId", "startedAt", "done", "events", "endedAt", "updatedAt"`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  reviews: `SELECT "programId", "status", "reviewerId", "note", "edits", "updatedAt" FROM "SignatureProgramReview"`,
  upsertReview:
    `INSERT INTO "SignatureProgramReview" ("programId", "status", "reviewerId", "note", "edits", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("programId") DO UPDATE SET "status" = EXCLUDED."status", "reviewerId" = EXCLUDED."reviewerId", "note" = EXCLUDED."note", "edits" = EXCLUDED."edits", "updatedAt" = EXCLUDED."updatedAt"`,
  enrollments: `SELECT ${ENROLL_COLS} FROM "SignatureEnrollment" WHERE "userId" = $1 AND "endedAt" IS NULL ORDER BY "updatedAt" DESC`,
  enrollment: `SELECT ${ENROLL_COLS} FROM "SignatureEnrollment" WHERE "userId" = $1 AND "programId" = $2 AND "endedAt" IS NULL`,
  // a start is fresh: a new row, or an ended one started over (an active one is left exactly as it is)
  start:
    `INSERT INTO "SignatureEnrollment" (${ENROLL_COLS}) VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'UTC'), '{}'::jsonb, '[]'::jsonb, NULL, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("userId", "programId") DO UPDATE SET "startedAt" = EXCLUDED."startedAt", "done" = '{}'::jsonb, "events" = '[]'::jsonb, "endedAt" = NULL, "updatedAt" = EXCLUDED."updatedAt" ` +
    `WHERE "SignatureEnrollment"."endedAt" IS NOT NULL`,
  // once per session instance: the row only moves when the key is not there yet (two taps, one write)
  markDone:
    `UPDATE "SignatureEnrollment" SET "done" = "done" || jsonb_build_object($3::text, $4::text), "updatedAt" = (NOW() AT TIME ZONE 'UTC') ` +
    `WHERE "userId" = $1 AND "programId" = $2 AND "endedAt" IS NULL AND ("done" -> $3::text) IS NULL`,
  // once per checkpoint week: a decision is never taken twice
  addEvent:
    `UPDATE "SignatureEnrollment" SET "events" = "events" || $4::jsonb, "updatedAt" = (NOW() AT TIME ZONE 'UTC') ` +
    `WHERE "userId" = $1 AND "programId" = $2 AND "endedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("events") AS ev WHERE (ev ->> 'afterWeek') = $3::text)`,
  stop: `UPDATE "SignatureEnrollment" SET "endedAt" = (NOW() AT TIME ZONE 'UTC'), "updatedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "userId" = $1 AND "programId" = $2 AND "endedAt" IS NULL`,
} as const;

export interface StoredReview { programId: string; status: ReviewStatus; reviewerId: string | null; note: string | null; edits: ProgramEdits; updatedAt: string }
export interface StoredEnrollment extends Enrollment { id: string; userId: string; updatedAt: string }

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : new Date(0).toISOString());
const STATUSES: readonly ReviewStatus[] = ['draft', 'approved', 'rejected'];

export function rowToReview(r: Record<string, unknown>): StoredReview {
  const status = STATUSES.includes(r.status as ReviewStatus) ? r.status as ReviewStatus : 'draft';
  const edits = json<unknown>(r.edits, {});
  return {
    programId: String(r.programId), status, reviewerId: typeof r.reviewerId === 'string' ? r.reviewerId : null, note: typeof r.note === 'string' ? r.note : null,
    edits: edits && typeof edits === 'object' && !Array.isArray(edits) ? edits as ProgramEdits : {}, updatedAt: iso(r.updatedAt),
  };
}

export function rowToEnrollment(r: Record<string, unknown>): StoredEnrollment {
  const done = json<unknown>(r.done, {});
  const events = json<unknown>(r.events, []);
  return {
    id: String(r.id), userId: String(r.userId), programId: String(r.programId) as SignatureId, startedAt: iso(r.startedAt),
    done: done && typeof done === 'object' && !Array.isArray(done) ? done as Record<string, string> : {},
    events: Array.isArray(events) ? events as PlanEvent[] : [], updatedAt: iso(r.updatedAt),
  };
}

/** Every review row, by program, or null when the tables are not there. */
export async function readReviews(db: RawDb, now: number = Date.now()): Promise<Map<string, StoredReview> | null> {
  if (!(await signatureReady(db, now))) return null;
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.reviews);
    return new Map(rows.map(rowToReview).map((r) => [r.programId, r]));
  } catch (e) {
    probe.fail('signature_reviews_failed', e, now);
    return null;
  }
}

export async function writeReview(db: RawDb, r: { programId: string; status: ReviewStatus; reviewerId: string; note: string | null; edits: ProgramEdits }, now: number = Date.now()): Promise<boolean> {
  if (!(await signatureReady(db, now))) return false;
  await db.$executeRawUnsafe(SQL.upsertReview, r.programId, r.status, r.reviewerId, r.note, JSON.stringify(r.edits));
  return true;
}

/** The athlete's active enrollments, or null when the tables are not there. */
export async function readEnrollments(db: RawDb, userId: string, now: number = Date.now()): Promise<StoredEnrollment[] | null> {
  if (!(await signatureReady(db, now))) return null;
  try {
    return (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.enrollments, userId)).map(rowToEnrollment);
  } catch (e) {
    probe.fail('signature_enrollments_failed', e, now);
    return null;
  }
}

export async function readEnrollment(db: RawDb, userId: string, programId: SignatureId, now: number = Date.now()): Promise<StoredEnrollment | null | undefined> {
  if (!(await signatureReady(db, now))) return undefined;
  const [r] = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.enrollment, userId, programId);
  return r ? rowToEnrollment(r) : null;
}

/** Start (or start over a stopped) program. False when the tables are not there. */
export async function startEnrollment(db: RawDb, userId: string, programId: SignatureId, now: number = Date.now()): Promise<boolean> {
  if (!(await signatureReady(db, now))) return false;
  await db.$executeRawUnsafe(SQL.start, randomUUID(), userId, programId);
  return true;
}

/** Mark one session instance done. True only for the write that marked it (a second tap changes nothing). */
export async function markDone(db: RawDb, userId: string, programId: SignatureId, sessionId: string, at: Date): Promise<boolean> {
  return Number(await db.$executeRawUnsafe(SQL.markDone, userId, programId, sessionId, at.toISOString())) > 0;
}

/** Keep one checkpoint decision. True only for the write that kept it. */
export async function addEvent(db: RawDb, userId: string, programId: SignatureId, ev: PlanEvent): Promise<boolean> {
  return Number(await db.$executeRawUnsafe(SQL.addEvent, userId, programId, String(ev.afterWeek), JSON.stringify([ev]))) > 0;
}

export async function stopEnrollment(db: RawDb, userId: string, programId: SignatureId): Promise<boolean> {
  return Number(await db.$executeRawUnsafe(SQL.stop, userId, programId)) > 0;
}
