// lib/coach/formReview/store.ts — COACH-VIDEO-REVIEW (2026-10-24): the sent sets, in raw SQL.
//
// THE TABLE IS NOT ON PRODUCTION YET: it arrives with prisma/pending/2026-10-24-coach-form-review.sql, which the owner
// applies. Until then (and in CI) every read here answers "not available" and nothing 500s: the client still records and
// reads their flags on the phone, sending answers 503 form_review_not_ready, and the coach's queue is empty with a line
// saying why. The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL switches it on within minutes,
// with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here (node:crypto
// randomUUID): the generated client never sees this table until the owner regenerates it.

import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '../pendingSchema';
import type { RepFlag, ScoredRep, SetSummary } from './score';
import type { PoseTrack } from './payload';
import type { ReviewMovement } from './movements';

export type { RawDb };

const probe = pendingProbe('coach_form_review', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachFormReview' LIMIT 1`);

/** Tests only. */
export function resetFormReviewProbe(): void {
  probe.reset();
}

export function formReviewsReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** How long the keypoint tracks are kept. The numbers stay for the trend. TUNE(elijah) (new; owner call) */
export const TRACKS_KEEP_DAYS = 90;
/** The reviewed sets a coach's queue still lists (the unreviewed ones are always listed). */
export const REVIEWED_SHOWN_DAYS = 14;
/** At most this many rows in one queue read. */
export const QUEUE_LIMIT = 50;

const COLS = `"id", "clientId", "coachId", "programId", "sessionExerciseId", "exerciseName", "movement", "band", "reps", "setScore", "flagCount", "summary", "status", "reviewedAt", "replyMessageId", "createdAt"`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insert:
    `INSERT INTO "CoachFormReview" ("id", "clientId", "coachId", "programId", "sessionExerciseId", "exerciseName", "movement", "band", "reps", "setScore", "flagCount", "summary", "tracks", "tracksDeleteAt", "status", "createdAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, 'unreviewed', (NOW() AT TIME ZONE 'UTC'))`,
  queue:
    `SELECT ${COLS} FROM "CoachFormReview" WHERE "coachId" = $1 AND ("status" = 'unreviewed' OR "createdAt" >= $2) ` +
    `ORDER BY ("status" = 'unreviewed') DESC, ("flagCount" > 0) DESC, "createdAt" DESC LIMIT ${QUEUE_LIMIT}`,
  countUnreviewed: `SELECT "clientId", COUNT(*)::int AS "n" FROM "CoachFormReview" WHERE "coachId" = $1 AND "status" = 'unreviewed' GROUP BY "clientId"`,
  byId: `SELECT ${COLS}, "tracks", "tracksDeleteAt" FROM "CoachFormReview" WHERE "id" = $1`,
  trend:
    `SELECT "clientId", "movement", "setScore", "createdAt" FROM "CoachFormReview" WHERE "coachId" = $1 AND "clientId" = ANY($2::text[]) ` +
    `AND "createdAt" >= $3 ORDER BY "createdAt" ASC`,
  mine: `SELECT ${COLS} FROM "CoachFormReview" WHERE "clientId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
  claim: `UPDATE "CoachFormReview" SET "status" = 'reviewed', "reviewedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $1 AND "coachId" = $2 AND "status" = 'unreviewed' RETURNING "id"`,
  setReply: `UPDATE "CoachFormReview" SET "replyMessageId" = $2 WHERE "id" = $1`,
  unclaim: `UPDATE "CoachFormReview" SET "status" = 'unreviewed', "reviewedAt" = NULL WHERE "id" = $1 AND "coachId" = $2`,
  remove: `DELETE FROM "CoachFormReview" WHERE "id" = $1 AND "clientId" = $2`,
  purgeTracks:
    `UPDATE "CoachFormReview" SET "tracks" = NULL WHERE "id" IN (SELECT "id" FROM "CoachFormReview" WHERE "tracks" IS NOT NULL AND "tracksDeleteAt" <= $1 LIMIT 100)`,
} as const;

/** What the summary JSON holds (everything but the tracks). */
export interface StoredSummary {
  v: 1;
  aspect: number;
  durationMs: number;
  reps: ScoredRep[];
  flags: RepFlag[];
  set: SetSummary;
}

export interface FormReviewRow {
  id: string;
  clientId: string;
  coachId: string;
  programId: string;
  sessionExerciseId: string | null;
  exerciseName: string;
  movement: ReviewMovement;
  band: 'adult' | 'teen';
  reps: number;
  setScore: number | null;
  flagCount: number;
  summary: StoredSummary;
  status: 'unreviewed' | 'reviewed';
  reviewedAt: string | null;
  replyMessageId: string | null;
  createdAt: string;
}

export interface FormReviewFull extends FormReviewRow {
  /** Null once the retention clock ran out (or never kept). */
  tracks: PoseTrack[] | null;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const json = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

function asRow(r: Record<string, unknown>): FormReviewRow | null {
  const summary = json(r.summary) as StoredSummary | null;
  if (!summary || summary.v !== 1 || !Array.isArray(summary.reps) || !Array.isArray(summary.flags)) return null;
  return {
    id: String(r.id), clientId: String(r.clientId), coachId: String(r.coachId), programId: String(r.programId),
    sessionExerciseId: r.sessionExerciseId == null ? null : String(r.sessionExerciseId), exerciseName: String(r.exerciseName),
    movement: String(r.movement) as ReviewMovement, band: r.band === 'teen' ? 'teen' : 'adult', reps: Number(r.reps),
    setScore: r.setScore == null ? null : Number(r.setScore), flagCount: Number(r.flagCount), summary,
    status: r.status === 'reviewed' ? 'reviewed' : 'unreviewed', reviewedAt: isoOrNull(r.reviewedAt),
    replyMessageId: r.replyMessageId == null ? null : String(r.replyMessageId), createdAt: iso(r.createdAt),
  };
}

async function guarded<T>(db: RawDb, event: string, now: number, empty: T, run: () => Promise<T>): Promise<T> {
  if (!(await formReviewsReady(db, now))) return empty;
  try {
    return await run();
  } catch (e) {
    probe.fail(event, e, now);
    return empty;
  }
}

export interface NewFormReview {
  clientId: string;
  coachId: string;
  programId: string;
  sessionExerciseId: string | null;
  exerciseName: string;
  movement: ReviewMovement;
  band: 'adult' | 'teen';
  summary: StoredSummary;
  tracks: PoseTrack[];
}

/** Keep one sent set. Its id, or null when the table is not there (or the write failed). */
export async function insertFormReview(db: RawDb, row: NewFormReview, now: number = Date.now()): Promise<string | null> {
  return guarded(db, 'coach_form_review_insert_failed', now, null, async () => {
    const id = randomUUID();
    const deleteAt = new Date(now + TRACKS_KEEP_DAYS * 86_400_000);
    await db.$executeRawUnsafe(SQL.insert, id, row.clientId, row.coachId, row.programId, row.sessionExerciseId, row.exerciseName,
      row.movement, row.band, row.summary.set.reps, row.summary.set.setScore, row.summary.flags.length,
      JSON.stringify(row.summary), JSON.stringify(row.tracks), deleteAt);
    return id;
  });
}

/** The coach's queue: every unreviewed set, and the reviewed ones of the last REVIEWED_SHOWN_DAYS. Null: not available. */
export async function queueForCoach(db: RawDb, coachId: string, now: number = Date.now()): Promise<FormReviewRow[] | null> {
  return guarded(db, 'coach_form_review_queue_failed', now, null, async () => {
    // the retention clock, on the reads that already run: no cron
    await db.$executeRawUnsafe(SQL.purgeTracks, new Date(now));
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.queue, coachId, new Date(now - REVIEWED_SHOWN_DAYS * 86_400_000));
    return rows.map(asRow).filter((r): r is FormReviewRow => !!r);
  });
}

/** Unreviewed sets per client for this coach. Null: not available. */
export async function unreviewedByClient(db: RawDb, coachId: string, now: number = Date.now()): Promise<Map<string, number> | null> {
  return guarded(db, 'coach_form_review_count_failed', now, null, async () => {
    const rows = await db.$queryRawUnsafe<{ clientId: string; n: number }[]>(SQL.countUnreviewed, coachId);
    return new Map(rows.map((r) => [String(r.clientId), Number(r.n)]));
  });
}

export async function formReviewById(db: RawDb, id: string, now: number = Date.now()): Promise<FormReviewFull | null> {
  return guarded(db, 'coach_form_review_read_failed', now, null, async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.byId, id);
    const r = rows[0];
    const row = r ? asRow(r) : null;
    if (!r || !row) return null;
    const expired = r.tracksDeleteAt != null && new Date(iso(r.tracksDeleteAt)).getTime() <= now;
    const tracks = expired ? null : (json(r.tracks) as PoseTrack[] | null);
    return { ...row, tracks: Array.isArray(tracks) ? tracks : null };
  });
}

/** Set scores per client × movement since `sinceMs`, oldest first. */
export async function trendRows(db: RawDb, coachId: string, clientIds: string[], sinceMs: number, now: number = Date.now()): Promise<{ clientId: string; movement: string; setScore: number | null; at: string }[]> {
  if (!clientIds.length) return [];
  return guarded(db, 'coach_form_review_trend_failed', now, [], async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.trend, coachId, clientIds, new Date(sinceMs));
    return rows.map((r) => ({ clientId: String(r.clientId), movement: String(r.movement), setScore: r.setScore == null ? null : Number(r.setScore), at: iso(r.createdAt) }));
  });
}

export async function mySentReviews(db: RawDb, clientId: string, now: number = Date.now()): Promise<FormReviewRow[] | null> {
  return guarded(db, 'coach_form_review_mine_failed', now, null, async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.mine, clientId);
    return rows.map(asRow).filter((r): r is FormReviewRow => !!r);
  });
}

/** Mark reviewed, once: true when this call did it (a second tap, or another tab, gets false). */
export async function claimReview(db: RawDb, id: string, coachId: string, now: number = Date.now()): Promise<boolean> {
  return guarded(db, 'coach_form_review_claim_failed', now, false, async () => {
    const rows = await db.$queryRawUnsafe<{ id: string }[]>(SQL.claim, id, coachId);
    return rows.length === 1;
  });
}

export async function setReplyMessage(db: RawDb, id: string, messageId: string, now: number = Date.now()): Promise<void> {
  await guarded(db, 'coach_form_review_reply_link_failed', now, undefined, async () => { await db.$executeRawUnsafe(SQL.setReply, id, messageId); });
}

/** The reply could not be posted: the set goes back to unreviewed, so it is not lost from the queue. */
export async function unclaimReview(db: RawDb, id: string, coachId: string, now: number = Date.now()): Promise<void> {
  await guarded(db, 'coach_form_review_unclaim_failed', now, undefined, async () => { await db.$executeRawUnsafe(SQL.unclaim, id, coachId); });
}

/** The client deletes a set they sent. True when a row went. */
export async function deleteMine(db: RawDb, id: string, clientId: string, now: number = Date.now()): Promise<boolean> {
  return guarded(db, 'coach_form_review_delete_failed', now, false, async () => (await db.$executeRawUnsafe(SQL.remove, id, clientId)) > 0);
}
