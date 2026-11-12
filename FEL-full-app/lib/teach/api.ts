// lib/teach/api.ts — the teacher platform's route logic (platform phase 10, 2026-11-03). The route files are thin: they
// read the session and hand these the user id and the body, so every rule is tested here (api.test.ts) with stand-ins.
//
//   apply     an adult (18+) who is not yet a teacher and has nothing pending; checked and screened (apply.ts); 503
//             opens_soon until the teacher SQL is applied
//   me        the viewer's state: tables ready, their role (owner-granted / Camp / none), may they author, their latest
//             application
//   queue / decide   the owner's (admin) queue; an approval grants the role
//   courses   list / create / save — a teacher (or the env-list fallback) only; anyone else gets 403. Publishing runs the
//             validator (course.ts courseErrors): a course with problems stays a draft and the problems come back.
//   practice  the student's own best score in a game mode, for a practice block (read only, never ranked or shared)
//   pe-plan   EDU-06: a PE lesson plan checked against the format (pePlan.ts); nothing stored
import { checkApplication } from './apply';
import { cleanCourse, courseErrors, type Course } from './course';
import { canAuthor, teacherSource, type RoleDeps } from './role';
import { pePlanErrors, type PePlan } from './pePlan';
import {
  coursesOf, courseById, createCourse, decideApplication, latestApplication, pendingApplications, saveCourse, submitApplication,
  teachReady, type RawDb,
} from './store';

export interface TeachApiDeps {
  db: RawDb;
  role: RoleDeps;
  /** An adult (18+, a birth year on file). */
  isAdult(userId: string): Promise<boolean>;
  /** The best score this user has in a mode (GameSession), or null. */
  bestScore?(userId: string, mode: string): Promise<number | null>;
}

export interface ApiAnswer { status: number; body: Record<string, unknown> }
const ok = (body: Record<string, unknown>, status = 200): ApiAnswer => ({ status, body });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): ApiAnswer => ({ status, body: { error, ...extra } });

export async function apply(userId: string, raw: unknown, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!(await teachReady(d.db))) return err(503, 'opens_soon');
  if (!(await d.isAdult(userId))) return err(403, 'adults_only');
  if (await teacherSource(userId, d.role)) return err(409, 'already_teacher');
  const last = await latestApplication(d.db, userId);
  if (last?.status === 'pending') return err(409, 'already_pending');
  const check = checkApplication(raw);
  if (!check.ok) return err(422, 'invalid_application', { errors: check.errors });
  const id = await submitApplication(d.db, userId, check.value);
  return id ? ok({ id, status: 'pending' }, 201) : err(503, 'opens_soon');
}

export async function me(userId: string, d: TeachApiDeps): Promise<ApiAnswer> {
  const ready = await teachReady(d.db);
  const [source, author, application] = await Promise.all([
    teacherSource(userId, d.role), canAuthor(userId, d.role), ready ? latestApplication(d.db, userId) : Promise.resolve(null),
  ]);
  return ok({ ready, teacher: source, canAuthor: author, application });
}

export async function queue(d: TeachApiDeps): Promise<ApiAnswer> {
  return ok({ ready: await teachReady(d.db), applications: await pendingApplications(d.db) });
}

export async function decide(ownerId: string, raw: unknown, d: TeachApiDeps): Promise<ApiAnswer> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { id?: unknown; decision?: unknown; note?: unknown };
  if (typeof r.id !== 'string' || (r.decision !== 'approved' && r.decision !== 'rejected')) return err(400, 'bad_request');
  const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 600) : null;
  if (!(await teachReady(d.db))) return err(503, 'opens_soon');
  return (await decideApplication(d.db, r.id, r.decision, note, ownerId)) ? ok({ ok: true }) : err(404, 'not_pending');
}

export async function listCourses(userId: string, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!(await canAuthor(userId, d.role))) return err(403, 'not_a_teacher');
  return ok({ ready: await teachReady(d.db), courses: await coursesOf(d.db, userId) });
}

export async function newCourse(userId: string, raw: unknown, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!(await canAuthor(userId, d.role))) return err(403, 'not_a_teacher');
  const title = typeof (raw as { title?: unknown })?.title === 'string' ? ((raw as { title: string }).title.trim() || 'New course') : 'New course';
  const id = await createCourse(d.db, userId, title);
  return id ? ok({ id }, 201) : err(503, 'opens_soon');
}

/** Save (draft) or publish a teacher's own course. A publish with problems is refused with the problems, and not saved. */
export async function putCourse(userId: string, id: string, raw: unknown, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!(await canAuthor(userId, d.role))) return err(403, 'not_a_teacher');
  const existing = await courseById(d.db, id);
  if (!existing || existing.teacherId !== userId) return err(404, 'not_found');
  const course: Course = cleanCourse(raw, { id, teacherId: userId });
  if (course.status === 'published') {
    const problems = courseErrors(course);
    if (problems.length) return err(422, 'not_ready_to_publish', { problems });
  }
  return (await saveCourse(d.db, course)) ? ok({ ok: true, status: course.status }) : err(503, 'opens_soon');
}

/** A published course for a student (or its teacher's draft, for the teacher's own preview). */
export async function readCourse(viewerId: string | null, id: string, d: TeachApiDeps): Promise<Course | null> {
  const c = await courseById(d.db, id);
  if (!c) return null;
  return c.status === 'published' || (viewerId && c.teacherId === viewerId) ? c : null;
}

export async function practiceBest(userId: string, mode: string, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!/^[a-z0-9_]{1,40}$/.test(mode)) return err(400, 'bad_mode');
  return ok({ mode, best: d.bestScore ? await d.bestScore(userId, mode) : null });
}

/** EDU-06: check a PE lesson plan against the format (stores nothing: the plans are the owner's or teachers' to write). */
export async function checkPePlan(userId: string, raw: unknown, d: TeachApiDeps): Promise<ApiAnswer> {
  if (!(await canAuthor(userId, d.role))) return err(403, 'not_a_teacher');
  const problems = pePlanErrors(raw as PePlan);
  return ok({ ok: problems.length === 0, problems });
}
