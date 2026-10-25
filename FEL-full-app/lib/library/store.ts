// lib/library/store.ts — EXERCISE-LIBRARY (2026-10-25): the library's run-time state, in raw SQL behind a probe.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-exercise-library.sql, which the owner
// applies. Until then (and in CI) every read here answers "not ready" and every write answers null, and nothing 500s:
// the library still searches every data-file entry (as drafts), and the four writes — review decisions, submissions,
// moderation, and a catalogue copy's link — are refused by the routes with 503 library_not_ready (the copy itself still
// lands in the coach's catalogue). The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL switches
// the writes on within ~5 minutes, with no deploy. The generated client never sees these tables until the owner
// regenerates it, so ids are made here (node:crypto randomUUID) and every statement is parameterised.

import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { LibraryExercise, SubmissionPayload, SubmissionStatus } from './types';

export type { RawDb };

// the file adds the column first and LibrarySubmission last: its table being there means all of it is
const probe = pendingProbe('exercise_library', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'LibrarySubmission' LIMIT 1`);

export function libraryReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** Tests only. */
export function resetLibraryProbe(): void {
  probe.reset();
}

const COLS = [
  'id', 'slug', 'name', 'aliases', 'family', 'variation', 'pattern', 'plane', 'laterality', 'category', 'level', 'equipment',
  'primaryMuscles', 'secondaryMuscles', 'sportTags', 'goals', 'skillLayer', 'braceMode', 'setup', 'cues', 'faults',
  'regressionId', 'progressionId', 'cautions', 'lowLoad', 'youthOk', 'prehabNote', 'dosage', 'clipKey', 'videoUrl', 'imageRef',
  'sourceKind', 'sourceRef', 'sourceUrl', 'licence', 'reviewStatus', 'reviewerId', 'reviewBatch',
] as const;
const JSONB = new Set(['faults', 'dosage']);

const placeholders = COLS.map((c, i) => `$${i + 1}${JSONB.has(c) ? '::jsonb' : ''}`).join(', ');
const updates = COLS.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

export const SQL = {
  overlay: `SELECT ${COLS.map((c) => `"${c}"`).join(', ')}, "updatedAt" FROM "LibraryExercise"`,
  version: `SELECT COUNT(*)::int AS "n", MAX("updatedAt") AS "at" FROM "LibraryExercise"`,
  upsert:
    `INSERT INTO "LibraryExercise" (${COLS.map((c) => `"${c}"`).join(', ')}, "reviewedAt", "updatedAt") VALUES (${placeholders}, (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("id") DO UPDATE SET ${updates}, "reviewedAt" = EXCLUDED."reviewedAt", "updatedAt" = EXCLUDED."updatedAt"`,
  insertSubmission:
    `INSERT INTO "LibrarySubmission" ("id", "coachId", "programExerciseId", "payload", "status", "createdAt") VALUES ($1, $2, $3, $4::jsonb, 'pending', (NOW() AT TIME ZONE 'UTC'))`,
  pendingForExercise: `SELECT "id" FROM "LibrarySubmission" WHERE "programExerciseId" = $1 AND "status" = 'pending' LIMIT 1`,
  mySubmissions: `SELECT "id", "programExerciseId", "status", "moderatorNote", "libraryExerciseId", "createdAt", "decidedAt" FROM "LibrarySubmission" WHERE "coachId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
  queue: `SELECT s."id", s."coachId", s."programExerciseId", s."payload", s."status", s."createdAt", u."name" AS "coachName" FROM "LibrarySubmission" s LEFT JOIN "User" u ON u."id" = s."coachId" WHERE s."status" = 'pending' ORDER BY s."createdAt" ASC LIMIT 200`,
  submissionById: `SELECT "id", "coachId", "programExerciseId", "payload", "status" FROM "LibrarySubmission" WHERE "id" = $1`,
  decide: `UPDATE "LibrarySubmission" SET "status" = $2, "moderatorId" = $3, "moderatorNote" = $4, "libraryExerciseId" = $5, "decidedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $1 AND "status" = 'pending'`,
  withdraw: `UPDATE "LibrarySubmission" SET "status" = 'withdrawn', "decidedAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $1 AND "coachId" = $2 AND "status" = 'pending'`,
  link: `UPDATE "ProgramExercise" SET "libraryExerciseId" = $1 WHERE "id" = $2 AND "coachId" = $3`,
  links: `SELECT "id", "libraryExerciseId" FROM "ProgramExercise" WHERE "coachId" = $1 AND "libraryExerciseId" IS NOT NULL`,
} as const;

type Row = Record<(typeof COLS)[number], unknown> & { updatedAt?: unknown };

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};

/** A table row → an entry (the shapes the validator checks; a row the owner edited has been validated on write). */
export function rowToEntry(r: Row): LibraryExercise {
  return {
    id: String(r.id), slug: String(r.slug), name: String(r.name), aliases: arr(r.aliases), family: String(r.family), variation: String(r.variation),
    pattern: r.pattern as LibraryExercise['pattern'], plane: r.plane as LibraryExercise['plane'], laterality: r.laterality as LibraryExercise['laterality'],
    category: r.category as LibraryExercise['category'], level: r.level as LibraryExercise['level'], equipment: arr(r.equipment) as LibraryExercise['equipment'],
    primaryMuscles: arr(r.primaryMuscles) as LibraryExercise['primaryMuscles'], secondaryMuscles: arr(r.secondaryMuscles) as LibraryExercise['secondaryMuscles'],
    sportTags: arr(r.sportTags) as LibraryExercise['sportTags'], goals: arr(r.goals) as LibraryExercise['goals'],
    skillLayer: str(r.skillLayer), braceMode: str(r.braceMode) as LibraryExercise['braceMode'], setup: String(r.setup ?? ''), cues: arr(r.cues),
    faults: json(r.faults, []), regressionId: str(r.regressionId), progressionId: str(r.progressionId), cautions: arr(r.cautions),
    lowLoad: arr(r.lowLoad) as LibraryExercise['lowLoad'], youthOk: r.youthOk !== false, prehabNote: str(r.prehabNote),
    dosage: json(r.dosage, { sets: 1, reps: '8', restSec: 60 }),
    demo: { clipKey: (str(r.clipKey) ?? 'idle') as LibraryExercise['demo']['clipKey'], videoUrl: str(r.videoUrl), imageRef: str(r.imageRef) },
    source: { kind: r.sourceKind as LibraryExercise['source']['kind'], ref: str(r.sourceRef), url: str(r.sourceUrl), licence: String(r.licence ?? '') },
    review: { status: r.reviewStatus as LibraryExercise['review']['status'], reviewer: str(r.reviewerId), batch: String(r.reviewBatch ?? '') },
  };
}

export function entryToParams(e: LibraryExercise): unknown[] {
  const v: Record<(typeof COLS)[number], unknown> = {
    id: e.id, slug: e.slug, name: e.name, aliases: e.aliases, family: e.family, variation: e.variation, pattern: e.pattern, plane: e.plane,
    laterality: e.laterality, category: e.category, level: e.level, equipment: e.equipment, primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles, sportTags: e.sportTags, goals: e.goals, skillLayer: e.skillLayer, braceMode: e.braceMode, setup: e.setup,
    cues: e.cues, faults: JSON.stringify(e.faults), regressionId: e.regressionId, progressionId: e.progressionId, cautions: e.cautions, lowLoad: e.lowLoad,
    youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: JSON.stringify(e.dosage), clipKey: e.demo.clipKey, videoUrl: e.demo.videoUrl,
    imageRef: e.demo.imageRef, sourceKind: e.source.kind, sourceRef: e.source.ref, sourceUrl: e.source.url, licence: e.source.licence,
    reviewStatus: e.review.status, reviewerId: e.review.reviewer, reviewBatch: e.review.batch,
  };
  return COLS.map((c) => v[c]);
}

/** Every row the owner has acted on, or null when the tables are not there. */
export async function readOverlay(db: RawDb, now: number = Date.now()): Promise<{ rows: LibraryExercise[]; version: string } | null> {
  if (!(await libraryReady(db, now))) return null;
  try {
    const rows = await db.$queryRawUnsafe<Row[]>(SQL.overlay);
    const latest = rows.reduce((m, r) => Math.max(m, r.updatedAt instanceof Date ? r.updatedAt.getTime() : new Date(String(r.updatedAt ?? 0)).getTime() || 0), 0);
    return { rows: rows.map(rowToEntry), version: `${rows.length}:${latest}` };
  } catch (e) {
    probe.fail('exercise_library_overlay_failed', e, now);
    return null;
  }
}

/** Cheap change check for the cache: row count and last update. */
export async function overlayVersion(db: RawDb, now: number = Date.now()): Promise<string | null> {
  if (!(await libraryReady(db, now))) return null;
  try {
    const [r] = await db.$queryRawUnsafe<{ n: number; at: unknown }[]>(SQL.version);
    const at = r?.at instanceof Date ? r.at.getTime() : r?.at ? new Date(String(r.at)).getTime() : 0;
    return `${Number(r?.n ?? 0)}:${at}`;
  } catch (e) {
    probe.fail('exercise_library_version_failed', e, now);
    return null;
  }
}

/** Write (insert or replace) full entries. False when the tables are not there. */
export async function upsertEntries(db: RawDb, entries: readonly LibraryExercise[], now: number = Date.now()): Promise<boolean> {
  if (!entries.length) return true;
  if (!(await libraryReady(db, now))) return false;
  for (const e of entries) await db.$executeRawUnsafe(SQL.upsert, ...entryToParams(e));
  return true;
}

export interface SubmissionRow { id: string; coachId: string; programExerciseId: string | null; payload: SubmissionPayload; status: SubmissionStatus; createdAt?: string; coachName?: string | null }

export async function createSubmission(db: RawDb, coachId: string, programExerciseId: string, payload: SubmissionPayload, now: number = Date.now()): Promise<{ id: string; already: boolean } | null> {
  if (!(await libraryReady(db, now))) return null;
  const [have] = await db.$queryRawUnsafe<{ id: string }[]>(SQL.pendingForExercise, programExerciseId);
  if (have) return { id: have.id, already: true };
  const id = randomUUID();
  await db.$executeRawUnsafe(SQL.insertSubmission, id, coachId, programExerciseId, JSON.stringify(payload));
  return { id, already: false };
}

export async function mySubmissions(db: RawDb, coachId: string, now: number = Date.now()): Promise<{ id: string; programExerciseId: string | null; status: SubmissionStatus; moderatorNote: string | null }[] | null> {
  if (!(await libraryReady(db, now))) return null;
  return db.$queryRawUnsafe(SQL.mySubmissions, coachId);
}

export async function submissionQueue(db: RawDb, now: number = Date.now()): Promise<SubmissionRow[] | null> {
  if (!(await libraryReady(db, now))) return null;
  const rows = await db.$queryRawUnsafe<(Omit<SubmissionRow, 'payload' | 'createdAt'> & { payload: unknown; createdAt: unknown })[]>(SQL.queue);
  return rows.map((r) => ({ ...r, payload: json(r.payload, {} as SubmissionPayload), createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? '') }));
}

export async function submissionById(db: RawDb, id: string): Promise<SubmissionRow | null> {
  const [r] = await db.$queryRawUnsafe<(Omit<SubmissionRow, 'payload'> & { payload: unknown })[]>(SQL.submissionById, id);
  return r ? { ...r, payload: json(r.payload, {} as SubmissionPayload) } : null;
}

/** Settle a pending submission once. False when it was not pending (decided already, or withdrawn). */
export async function decideSubmission(db: RawDb, id: string, status: 'approved' | 'rejected', moderatorId: string, note: string | null, libraryExerciseId: string | null): Promise<boolean> {
  return Number(await db.$executeRawUnsafe(SQL.decide, id, status, moderatorId, note, libraryExerciseId)) > 0;
}

export async function withdrawSubmission(db: RawDb, id: string, coachId: string): Promise<boolean> {
  return Number(await db.$executeRawUnsafe(SQL.withdraw, id, coachId)) > 0;
}

/** Keep the library link on a coach's own catalogue row. False when the column is not there yet. */
export async function linkCatalogueRow(db: RawDb, programExerciseId: string, coachId: string, libraryId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await libraryReady(db, now))) return false;
  try {
    return Number(await db.$executeRawUnsafe(SQL.link, libraryId, programExerciseId, coachId)) > 0;
  } catch (e) {
    probe.fail('exercise_library_link_failed', e, now);
    return false;
  }
}

/** This coach's catalogue rows that came from the library: { programExerciseId → libraryId }. */
export async function catalogueLinks(db: RawDb, coachId: string, now: number = Date.now()): Promise<Record<string, string>> {
  if (!(await libraryReady(db, now))) return {};
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; libraryExerciseId: string }[]>(SQL.links, coachId);
    return Object.fromEntries(rows.map((r) => [r.id, r.libraryExerciseId]));
  } catch (e) {
    probe.fail('exercise_library_links_failed', e, now);
    return {};
  }
}
