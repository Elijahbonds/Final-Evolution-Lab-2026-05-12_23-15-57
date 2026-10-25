// lib/safety/store.ts — SAFETY lane (SAF-04, SAF-05, 2026-10-25): the four safety tables, read and written with raw,
// parameterised SQL ($1…; nothing from a request is ever put into SQL text) behind the pendingSchema seam.
//
// The tables arrive with prisma/pending/2026-10-25-user-reports.sql, which the OWNER applies. Until then every call here
// is a safe no-op: ready() says no, a write answers 'not_ready', a read answers null, nothing 500s. Within ~5 minutes of
// the SQL being applied, ready() says yes (lib/coach/pendingSchema.ts pendingProbe), with no deploy. The committed Prisma
// client does not know these tables, so there is no generated model to use.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';

export type { RawDb } from '@/lib/coach/pendingSchema';

const TABLES = ['UserReport', 'UserModeration', 'ModerationAudit', 'ProblemReport'];
const PROBE_SQL =
  `SELECT count(*) AS "n" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('UserReport', 'UserModeration', 'ModerationAudit', 'ProblemReport') HAVING count(*) = ${TABLES.length}`;
const probe = pendingProbe('safety_tables', PROBE_SQL);

/** Tests only. */
export function resetSafetyProbe(): void { probe.reset(); }

export async function safetyReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

export type Write = { ok: true; id: string } | { ok: false; error: 'not_ready' | 'failed' };

async function exec(db: RawDb, event: string, sql: string, values: unknown[], now: number): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(sql, ...values);
    return true;
  } catch (e) {
    probe.fail(event, e, now);
    return false;
  }
}

async function query<T>(db: RawDb, event: string, sql: string, values: unknown[], now: number): Promise<T[] | null> {
  try {
    const rows = await db.$queryRawUnsafe<T[]>(sql, ...values);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    probe.fail(event, e, now);
    return null;
  }
}

export const SQL = {
  insertProblem: `INSERT INTO "ProblemReport" ("id", "route", "buildId", "deviceClass", "diagKind", "clientAt", "text") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  listProblems: `SELECT "id", "route", "buildId", "deviceClass", "diagKind", "clientAt", "text", "status", "createdAt" FROM "ProblemReport" ORDER BY "createdAt" DESC LIMIT $1`,
  setProblemStatus: `UPDATE "ProblemReport" SET "status" = $2 WHERE "id" = $1`,
  insertReport: `INSERT INTO "UserReport" ("id", "reporterId", "reportedId", "targetKind", "targetRef", "reason", "note") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  countRecentReports: `SELECT count(*)::int AS "n" FROM "UserReport" WHERE "reporterId" = $1 AND "createdAt" > (CURRENT_TIMESTAMP - make_interval(mins => $2::int))`,
  duplicateReport: `SELECT "id" FROM "UserReport" WHERE "reporterId" = $1 AND "targetKind" = $2 AND "targetRef" = $3 AND "status" = 'open' LIMIT 1`,
  listReports: `SELECT "id", "reportedId", "targetKind", "targetRef", "reason", "note", "status", "action", "createdAt" FROM "UserReport" WHERE "status" = ANY($1::text[]) ORDER BY "createdAt" DESC LIMIT $2`,
  reportById: `SELECT "id", "reportedId", "status" FROM "UserReport" WHERE "id" = $1`,
  closeReport: `UPDATE "UserReport" SET "status" = $2, "action" = $3, "reviewerId" = $4, "reviewedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "status" = 'open'`,
  insertModeration: `INSERT INTO "UserModeration" ("id", "userId", "kind", "reason", "reportId", "moderatorId", "endsAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  moderationsFor: `SELECT "id", "kind", "reason", "createdAt", "endsAt", "liftedAt", "appealStatus", "appealReason", "appealedAt", "appealDecidedAt" FROM "UserModeration" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
  moderationById: `SELECT "id", "userId", "kind", "reason", "createdAt", "endsAt", "liftedAt", "appealStatus" FROM "UserModeration" WHERE "id" = $1`,
  fileAppeal: `UPDATE "UserModeration" SET "appealStatus" = 'open', "appealReason" = $3, "appealNote" = $4, "appealedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "userId" = $2 AND "appealStatus" = 'none'`,
  openAppeals: `SELECT "id", "userId", "kind", "reason", "createdAt", "endsAt", "appealReason", "appealNote", "appealedAt" FROM "UserModeration" WHERE "appealStatus" = 'open' ORDER BY "appealedAt" ASC LIMIT $1`,
  decideAppeal: `UPDATE "UserModeration" SET "appealStatus" = $2, "appealDecidedAt" = CURRENT_TIMESTAMP, "liftedAt" = CASE WHEN $2 = 'lifted' THEN CURRENT_TIMESTAMP ELSE "liftedAt" END WHERE "id" = $1 AND "appealStatus" = 'open'`,
  insertAudit: `INSERT INTO "ModerationAudit" ("id", "actorId", "action", "subjectKind", "subjectId", "detail") VALUES ($1, $2, $3, $4, $5, $6)`,
  auditFor: `SELECT "action", "subjectKind", "subjectId", "detail", "createdAt" FROM "ModerationAudit" WHERE "subjectKind" = $1 AND "subjectId" = $2 ORDER BY "createdAt" ASC`,
} as const;

// ── problem reports ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface ProblemRow {
  route: string; buildId: string; deviceClass: string; diagKind: string | null; clientAt: Date | null; text: string | null;
}

export async function insertProblem(db: RawDb, r: ProblemRow, now = Date.now()): Promise<Write> {
  if (!(await probe.ready(db, now))) return { ok: false, error: 'not_ready' };
  const id = randomUUID();
  return (await exec(db, 'problem_insert_failed', SQL.insertProblem, [id, r.route, r.buildId, r.deviceClass, r.diagKind, r.clientAt, r.text], now))
    ? { ok: true, id } : { ok: false, error: 'failed' };
}

export interface ProblemListRow extends ProblemRow { id: string; status: string; createdAt: Date }

export async function listProblems(db: RawDb, limit = 100, now = Date.now()): Promise<ProblemListRow[] | null> {
  if (!(await probe.ready(db, now))) return null;
  return query<ProblemListRow>(db, 'problem_list_failed', SQL.listProblems, [limit], now);
}

export async function setProblemStatus(db: RawDb, id: string, status: 'new' | 'done', now = Date.now()): Promise<boolean> {
  if (!(await probe.ready(db, now))) return false;
  return exec(db, 'problem_status_failed', SQL.setProblemStatus, [id, status], now);
}

// ── user reports, moderation, appeals, audit ────────────────────────────────────────────────────────────────────────

export async function audit(db: RawDb, actorId: string | null, action: string, subjectKind: 'report' | 'moderation', subjectId: string, detail: Record<string, string | number | null> | null, now = Date.now()): Promise<boolean> {
  return exec(db, 'audit_insert_failed', SQL.insertAudit, [randomUUID(), actorId, action, subjectKind, subjectId, detail ? JSON.stringify(detail) : null], now);
}

export async function rawQuery<T>(db: RawDb, event: string, sql: string, values: unknown[], now = Date.now()): Promise<T[] | null> {
  if (!(await probe.ready(db, now))) return null;
  return query<T>(db, event, sql, values, now);
}

/** Rows changed (0 = the WHERE matched nothing, e.g. already decided), or why nothing ran. */
export async function rawExec(db: RawDb, event: string, sql: string, values: unknown[], now = Date.now()): Promise<number | 'not_ready' | 'failed'> {
  if (!(await probe.ready(db, now))) return 'not_ready';
  try {
    const n = await db.$executeRawUnsafe(sql, ...values);
    return typeof n === 'number' ? n : 0;
  } catch (e) {
    probe.fail(event, e, now);
    return 'failed';
  }
}

export const newId = (): string => randomUUID();
