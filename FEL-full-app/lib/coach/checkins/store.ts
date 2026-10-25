// lib/coach/checkins/store.ts — COACH-PARITY (2026-10-26): check-in forms, who they are assigned to, and the answers, in raw
// SQL behind the pending-schema seam (lib/coach/parity/probe.ts). Before prisma/pending/2026-10-26-coach-parity.sql is
// applied every read answers null ("not available") and every write false; nothing 500s.
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here.
import { randomUUID } from 'node:crypto';
import { parityFail, parityReady, type RawDb } from '../parity/probe';
import type { AnswerRow, Answers, AssignRow, Cadence, CheckinFormRow, CheckinQuestion, Scope } from './types';

export type { RawDb };

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const F = `"id", "coachId", "title", "cadence", "painCheck", "questions", "archivedAt", "createdAt"`;
const A = `"id", "formId", "coachId", "athleteId", "period", "answers", "health", "createdAt", "updatedAt"`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insertForm: `INSERT INTO "CoachCheckinForm" ("id", "coachId", "title", "cadence", "painCheck", "questions", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, ${NOW}, ${NOW})`,
  updateForm: `UPDATE "CoachCheckinForm" SET "title" = $3, "cadence" = $4, "painCheck" = $5, "questions" = $6::jsonb, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  archiveForm: `UPDATE "CoachCheckinForm" SET "archivedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  formsForCoach: `SELECT ${F} FROM "CoachCheckinForm" WHERE "coachId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
  formsByIds: `SELECT ${F} FROM "CoachCheckinForm" WHERE "id" = ANY($1::text[]) AND "archivedAt" IS NULL`,
  insertAssign: `INSERT INTO "CoachCheckinAssign" ("id", "formId", "coachId", "scope", "scopeId", "createdAt") VALUES ($1, $2, $3, $4, $5, ${NOW}) ON CONFLICT ("formId", "scope", "scopeId") DO NOTHING`,
  deleteAssign: `DELETE FROM "CoachCheckinAssign" WHERE "formId" = $1 AND "coachId" = $2 AND "scope" = $3 AND "scopeId" = $4`,
  assignsForCoach: `SELECT "id", "formId", "coachId", "scope", "scopeId" FROM "CoachCheckinAssign" WHERE "coachId" = $1`,
  assignsFor:
    `SELECT "id", "formId", "coachId", "scope", "scopeId" FROM "CoachCheckinAssign" WHERE "coachId" = ANY($3::text[]) ` +
    `AND (("scope" = 'athlete' AND "scopeId" = $1) OR ("scope" = 'team' AND "scopeId" = ANY($2::text[])))`,
  upsertAnswer:
    `INSERT INTO "CoachCheckinAnswer" (${A}) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, ${NOW}, ${NOW}) ` +
    `ON CONFLICT ("formId", "athleteId", "period") DO UPDATE SET "answers" = EXCLUDED."answers", "health" = COALESCE(EXCLUDED."health", "CoachCheckinAnswer"."health"), "updatedAt" = EXCLUDED."updatedAt"`,
  answersForAthlete: `SELECT ${A} FROM "CoachCheckinAnswer" WHERE "athleteId" = $1 AND "formId" = ANY($2::text[]) ORDER BY "period" DESC LIMIT 200`,
  answersForCoach: `SELECT ${A} FROM "CoachCheckinAnswer" WHERE "coachId" = $1 AND "createdAt" >= $2 ORDER BY "period" DESC LIMIT 2000`,
} as const;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const json = <T,>(v: unknown, empty: T): T => {
  if (v == null) return empty;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return empty; } }
  return v as T;
};

function asForm(r: Record<string, unknown>): CheckinFormRow {
  return {
    id: String(r.id), coachId: String(r.coachId), title: String(r.title), cadence: (r.cadence === 'once' ? 'once' : 'weekly') as Cadence,
    painCheck: r.painCheck === true || r.painCheck === 't', questions: json<CheckinQuestion[]>(r.questions, []),
    archivedAt: isoOrNull(r.archivedAt), createdAt: iso(r.createdAt),
  };
}
const asAssign = (r: Record<string, unknown>): AssignRow => ({ id: String(r.id), formId: String(r.formId), coachId: String(r.coachId), scope: (r.scope === 'team' ? 'team' : 'athlete') as Scope, scopeId: String(r.scopeId) });
function asAnswer(r: Record<string, unknown>): AnswerRow {
  return {
    id: String(r.id), formId: String(r.formId), coachId: String(r.coachId), athleteId: String(r.athleteId), period: String(r.period),
    answers: json<Answers>(r.answers, {}), health: r.health == null ? null : json<Answers | null>(r.health, null), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
  };
}

async function read<T>(db: RawDb, event: string, now: number, run: () => Promise<T>): Promise<T | null> {
  if (!(await parityReady(db, now))) return null;
  try { return await run(); } catch (e) { parityFail(event, e, now); return null; }
}
async function write(db: RawDb, event: string, now: number, run: () => Promise<number>): Promise<number | null> {
  if (!(await parityReady(db, now))) return null;
  try { return Number(await run()); } catch (e) { parityFail(event, e, now); return null; }
}

export interface NewForm { coachId: string; title: string; cadence: Cadence; painCheck: boolean; questions: CheckinQuestion[] }

/** The new form's id, or null (not ready / failed). */
export async function insertForm(db: RawDb, f: NewForm, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await write(db, 'checkin_form_write_failed', now, () => db.$executeRawUnsafe(SQL.insertForm, id, f.coachId, f.title, f.cadence, f.painCheck, JSON.stringify(f.questions)));
  return n ? id : null;
}
export async function updateForm(db: RawDb, id: string, f: NewForm, now = Date.now()): Promise<boolean> {
  return ((await write(db, 'checkin_form_write_failed', now, () => db.$executeRawUnsafe(SQL.updateForm, id, f.coachId, f.title, f.cadence, f.painCheck, JSON.stringify(f.questions)))) ?? 0) > 0;
}
export async function archiveForm(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<boolean> {
  return ((await write(db, 'checkin_form_write_failed', now, () => db.$executeRawUnsafe(SQL.archiveForm, id, coachId))) ?? 0) > 0;
}
export function formsForCoach(db: RawDb, coachId: string, now = Date.now()): Promise<CheckinFormRow[] | null> {
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.formsForCoach, coachId)).map(asForm));
}
export async function formsByIds(db: RawDb, ids: readonly string[], now = Date.now()): Promise<CheckinFormRow[] | null> {
  if (!ids.length) return (await parityReady(db, now)) ? [] : null;
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.formsByIds, [...ids])).map(asForm));
}
export async function assign(db: RawDb, formId: string, coachId: string, scope: Scope, scopeId: string, now = Date.now()): Promise<boolean | null> {
  const n = await write(db, 'checkin_assign_failed', now, () => db.$executeRawUnsafe(SQL.insertAssign, randomUUID(), formId, coachId, scope, scopeId));
  return n === null ? null : n > 0;
}
export async function unassign(db: RawDb, formId: string, coachId: string, scope: Scope, scopeId: string, now = Date.now()): Promise<boolean> {
  return ((await write(db, 'checkin_assign_failed', now, () => db.$executeRawUnsafe(SQL.deleteAssign, formId, coachId, scope, scopeId))) ?? 0) > 0;
}
export function assignsForCoach(db: RawDb, coachId: string, now = Date.now()): Promise<AssignRow[] | null> {
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.assignsForCoach, coachId)).map(asAssign));
}
/** The assignments that reach this athlete: their own, or a team of theirs — from their live coaches only. */
export async function assignsFor(db: RawDb, athleteId: string, teamIds: readonly string[], coachIds: readonly string[], now = Date.now()): Promise<AssignRow[] | null> {
  if (!coachIds.length) return (await parityReady(db, now)) ? [] : null;
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.assignsFor, athleteId, [...teamIds], [...coachIds])).map(asAssign));
}
export async function saveAnswer(db: RawDb, a: Omit<AnswerRow, 'id' | 'createdAt' | 'updatedAt'>, now = Date.now()): Promise<boolean> {
  return ((await write(db, 'checkin_answer_failed', now, () => db.$executeRawUnsafe(
    SQL.upsertAnswer, randomUUID(), a.formId, a.coachId, a.athleteId, a.period, JSON.stringify(a.answers), a.health ? JSON.stringify(a.health) : null,
  ))) ?? 0) > 0;
}
export async function answersForAthlete(db: RawDb, athleteId: string, formIds: readonly string[], now = Date.now()): Promise<AnswerRow[] | null> {
  if (!formIds.length) return (await parityReady(db, now)) ? [] : null;
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.answersForAthlete, athleteId, [...formIds])).map(asAnswer));
}
export function answersForCoach(db: RawDb, coachId: string, since: Date, now = Date.now()): Promise<AnswerRow[] | null> {
  return read(db, 'checkin_read_failed', now, async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.answersForCoach, coachId, since)).map(asAnswer));
}
