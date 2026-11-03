// lib/teach/store.ts — the teacher platform's rows, in raw SQL (platform phase 10, 2026-11-03).
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-11-03-teacher.sql, which the owner applies.
// Until then (and in CI) every read answers "not available" and nothing 500s: /teach says "Opens soon", the queue is
// empty, no badge shows. The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL switches it all on
// within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { TeacherApplication, TeacherApplicationInput, ApplicationStatus } from './apply';
import { cleanCourse, type Course } from './course';

export type { RawDb };

// three tables in one file; TeachCourse is created last, so its presence means all three are there
const probe = pendingProbe('teach', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'TeachCourse' LIMIT 1`);

/** Tests only. */
export function resetTeachProbe(): void { probe.reset(); }
export function teachReady(db: RawDb, now: number = Date.now()): Promise<boolean> { return probe.ready(db, now); }

const APP_COLS = `"id", "userId", "discipline", "bio", "sample", "links", "status", "note", "createdAt", "decidedAt"`;
const COURSE_COLS = `"id", "teacherId", "title", "summary", "lessons", "status"`;

export const SQL = {
  insertApplication:
    `INSERT INTO "TeacherApplication" ("id", "userId", "discipline", "bio", "sample", "links", "status", "createdAt") VALUES ($1, $2, $3, $4, $5, $6::text[], 'pending', (NOW() AT TIME ZONE 'UTC'))`,
  latestApplication: `SELECT ${APP_COLS} FROM "TeacherApplication" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
  pendingApplications: `SELECT ${APP_COLS} FROM "TeacherApplication" WHERE "status" = 'pending' ORDER BY "createdAt" ASC LIMIT 200`,
  applicationById: `SELECT ${APP_COLS} FROM "TeacherApplication" WHERE "id" = $1`,
  decide: `UPDATE "TeacherApplication" SET "status" = $2, "note" = $3, "decidedAt" = (NOW() AT TIME ZONE 'UTC'), "decidedBy" = $4 WHERE "id" = $1 AND "status" = 'pending'`,
  grantRole:
    `INSERT INTO "TeacherRole" ("userId", "source", "grantedBy", "grantedAt") VALUES ($1, 'owner', $2, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("userId") DO UPDATE SET "source" = 'owner', "grantedBy" = EXCLUDED."grantedBy", "grantedAt" = EXCLUDED."grantedAt", "revokedAt" = NULL`,
  roleOf: `SELECT "userId" FROM "TeacherRole" WHERE "userId" = $1 AND "revokedAt" IS NULL`,
  insertCourse:
    `INSERT INTO "TeachCourse" ("id", "teacherId", "title", "summary", "lessons", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, 'draft', (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC'))`,
  updateCourse:
    `UPDATE "TeachCourse" SET "title" = $3, "summary" = $4, "lessons" = $5::jsonb, "status" = $6, "updatedAt" = (NOW() AT TIME ZONE 'UTC'), ` +
    `"publishedAt" = CASE WHEN $6 = 'published' THEN COALESCE("publishedAt", (NOW() AT TIME ZONE 'UTC')) ELSE "publishedAt" END WHERE "id" = $1 AND "teacherId" = $2`,
  coursesOf: `SELECT ${COURSE_COLS} FROM "TeachCourse" WHERE "teacherId" = $1 ORDER BY "updatedAt" DESC LIMIT 50`,
  courseById: `SELECT ${COURSE_COLS} FROM "TeachCourse" WHERE "id" = $1`,
} as const;

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : null);

function asApplication(r: Record<string, unknown>): TeacherApplication {
  const status = (['pending', 'approved', 'rejected'] as const).find((s) => s === r.status) ?? 'pending';
  return {
    id: String(r.id), userId: String(r.userId), discipline: String(r.discipline) as TeacherApplication['discipline'], bio: String(r.bio ?? ''),
    sample: String(r.sample ?? ''), links: Array.isArray(r.links) ? r.links.map(String) : [], status, note: r.note == null ? null : String(r.note),
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(), decidedAt: iso(r.decidedAt),
  };
}
const asCourse = (r: Record<string, unknown>): Course =>
  cleanCourse({ title: r.title, summary: r.summary, lessons: typeof r.lessons === 'string' ? JSON.parse(r.lessons) : r.lessons, status: r.status }, { id: String(r.id), teacherId: String(r.teacherId) });

async function guarded<T>(db: RawDb, event: string, empty: T, now: number, run: () => Promise<T>): Promise<T> {
  if (!(await teachReady(db, now))) return empty;
  try { return await run(); } catch (e) { probe.fail(event, e, now); return empty; }
}

// ── applications and the role ───────────────────────────────────────────────────────────────────────────────────────

/** Write a checked application. null when the tables are not there (the route answers "opens soon"). */
export function submitApplication(db: RawDb, userId: string, a: TeacherApplicationInput, now = Date.now()): Promise<string | null> {
  return guarded(db, 'teach_apply_failed', null as string | null, now, async () => {
    const id = randomUUID();
    await db.$executeRawUnsafe(SQL.insertApplication, id, userId, a.discipline, a.bio, a.sample, a.links);
    return id;
  });
}

export function latestApplication(db: RawDb, userId: string, now = Date.now()): Promise<TeacherApplication | null> {
  return guarded(db, 'teach_read_failed', null as TeacherApplication | null, now, async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.latestApplication, userId);
    return rows[0] ? asApplication(rows[0]) : null;
  });
}

export function pendingApplications(db: RawDb, now = Date.now()): Promise<TeacherApplication[]> {
  return guarded(db, 'teach_queue_failed', [] as TeacherApplication[], now, async () =>
    (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.pendingApplications)).map(asApplication));
}

/** The owner's decision on a pending application; an approval grants the role. false when nothing was pending. */
export function decideApplication(db: RawDb, id: string, decision: Exclude<ApplicationStatus, 'pending'>, note: string | null, ownerId: string, now = Date.now()): Promise<boolean> {
  return guarded(db, 'teach_decide_failed', false, now, async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.applicationById, id);
    const app = rows[0] ? asApplication(rows[0]) : null;
    if (!app || app.status !== 'pending') return false;
    const n = await db.$executeRawUnsafe(SQL.decide, id, decision, note, ownerId);
    if (!n) return false;
    if (decision === 'approved') await db.$executeRawUnsafe(SQL.grantRole, app.userId, ownerId);
    return true;
  });
}

/** Does this user hold the owner-granted role (not revoked)? false when the tables are not there. */
export function hasTeacherRow(db: RawDb, userId: string, now = Date.now()): Promise<boolean> {
  return guarded(db, 'teach_role_failed', false, now, async () => (await db.$queryRawUnsafe<unknown[]>(SQL.roleOf, userId)).length > 0);
}

// ── courses ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function createCourse(db: RawDb, teacherId: string, title: string, now = Date.now()): Promise<string | null> {
  return guarded(db, 'teach_course_failed', null as string | null, now, async () => {
    const id = randomUUID();
    await db.$executeRawUnsafe(SQL.insertCourse, id, teacherId, title.slice(0, 200), '', JSON.stringify([]));
    return id;
  });
}

/** Save a teacher's own course (the WHERE holds the owner); false when it is not theirs or the tables are not there. */
export function saveCourse(db: RawDb, c: Course, now = Date.now()): Promise<boolean> {
  return guarded(db, 'teach_course_failed', false, now, async () =>
    (await db.$executeRawUnsafe(SQL.updateCourse, c.id, c.teacherId, c.title, c.summary, JSON.stringify(c.lessons), c.status)) > 0);
}

export function coursesOf(db: RawDb, teacherId: string, now = Date.now()): Promise<Course[]> {
  return guarded(db, 'teach_course_failed', [] as Course[], now, async () =>
    (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.coursesOf, teacherId)).map(asCourse));
}

export function courseById(db: RawDb, id: string, now = Date.now()): Promise<Course | null> {
  return guarded(db, 'teach_course_failed', null as Course | null, now, async () => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.courseById, id);
    return rows[0] ? asCourse(rows[0]) : null;
  });
}
