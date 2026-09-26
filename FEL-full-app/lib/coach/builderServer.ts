// The program builder's server half — save and load (MIRROR-COACH P2, 2026-09-25).
//
// app/api/coach/programs/[id]/exercises (save) and app/api/coach/programs/[id] (load) are this module plus the
// session check. It takes the database as an argument so the dev harness (app/dev/program-builder) can run the SAME
// code over an in-memory store on a lane whose database is offline on purpose; the routes pass the real client.
//
// What the save used to get wrong is written at each fix (and in the route's header): another coach's catalogue row
// could be prescribed by id, an edit reset every field it did not send, removing a logged exercise 500'd, and a
// session could hold two key sets.
import type { PrismaClient } from '@/public/_prisma/client';
import { accessRole, mergeSpecUpdate, validateExerciseSpec, type ProgramTree } from './loop';
import { TREE_INCLUDE, toTree } from './server';
import { moveWithinSection, sessionWarnings, type SessionWarning } from './structure';
import { EMPTY_LOG_WHERE, logHasContent } from './setLog';
import { bandAllowed, youthRules } from './taxonomy';

export type BuilderDb = Pick<PrismaClient, 'coachingProgram' | 'programExercise' | 'session' | 'sessionExercise' | 'exerciseLog' | 'facilitatorProfile' | 'user'>;
export type BuilderResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/** POST /api/coach/programs/:id/exercises — one builder action by the program's certified coach. */
export async function builderAction(db: BuilderDb, userId: string, programId: string, body: Record<string, unknown>): Promise<BuilderResult<{ tree: ProgramTree }>> {
  const program = await db.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, coachId: true, clientId: true } });
  if (!program) return fail(404, 'not_found');
  if (program.coachId !== userId) return fail(403, 'forbidden');
  const fac = await db.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } });
  if (fac?.certificationStatus !== 'certified') return fail(403, 'facilitator_not_certified');

  /** The coach's own catalogue row, or null — another coach's row is "not found", never "forbidden". */
  const ownExercise = async (exerciseId: string) => {
    const ex = await db.programExercise.findUnique({ where: { id: exerciseId }, select: { id: true, coachId: true } });
    return ex && ex.coachId === userId ? ex : null;
  };
  /** One key set per session: the one just marked keeps it. */
  const clearOtherKeySets = (sessionId: string, keep: string) =>
    db.sessionExercise.updateMany({ where: { sessionId, isKeySet: true, id: { not: keep } }, data: { isKeySet: false } });
  /**
   * MIRROR-COACH P2 review (2026-09-26), owner decisions #6 and #20: an adults-only band (Full throttle) is not
   * prescribed to a client under youth rules — under 18 by birth year, or no birth year on file. P2 recorded the band as
   * adults-only and deferred the gate to P5, but the band already reached the client's Today in P2.
   */
  const bandRefused = async (bandId: string | null) => {
    if (bandAllowed(bandId, true)) return false;
    const client = await db.user.findUnique({ where: { id: program.clientId }, select: { dobYear: true } });
    return !bandAllowed(bandId, youthRules(client?.dobYear));
  };
  const ownRow = async () => {
    const se = await db.sessionExercise.findUnique({ where: { id: String(body.sessionExerciseId ?? '') }, include: { session: { include: { block: true } } } });
    return se && se.session.block.programId === programId ? se : null;
  };

  if (body.action === 'remove') {
    const se = await ownRow();
    if (!se) return fail(404, 'not_found');
    // ExerciseLog → SessionExercise is onDelete: Restrict: the delete threw and the route answered 500.
    // MIRROR-COACH P2 review (2026-09-26): only a log with something IN it keeps the exercise — sets, a typed number, a
    // note, a video or the coach's comment. Today's Save used to write an empty row for every untouched exercise (fixed
    // in todayServer.ts, but rows written before that exist), and "Your athlete has already logged this one" was then
    // false. Empty rows are cleared (by a filter that re-checks they are still empty) and the exercise goes; a log that
    // gained content in between makes the delete throw P2003, which answers exercise_logged as before.
    const logs = await db.exerciseLog.findMany({
      where: { sessionExerciseId: se.id },
      select: { id: true, actualSets: true, actualReps: true, actualLoad: true, rpe: true, clientNote: true, videoUrl: true, coachComment: true, setLogs: { select: { id: true }, take: 1 } },
    });
    if (logs.some(logHasContent)) return fail(409, 'exercise_logged');
    try {
      if (logs.length) await db.exerciseLog.deleteMany({ where: { sessionExerciseId: se.id, id: { in: logs.map((l) => l.id) }, ...EMPTY_LOG_WHERE } });
      await db.sessionExercise.delete({ where: { id: se.id } });
    } catch (e) {
      if ((e as { code?: string } | null)?.code === 'P2003') return fail(409, 'exercise_logged');
      throw e;
    }
  } else if (body.action === 'update') {
    const se = await ownRow();
    if (!se) return fail(404, 'not_found');
    // merged over the stored row: the body alone reset every field it left out to its default
    const v = validateExerciseSpec(mergeSpecUpdate(se, body));
    if (!v.ok) return fail(400, v.error);
    if (v.spec.effortBand !== se.effortBand && await bandRefused(v.spec.effortBand)) return fail(400, 'effort_band_adults_only');
    if (v.spec.exerciseId !== se.exerciseId && !(await ownExercise(v.spec.exerciseId))) return fail(404, 'exercise_not_found');
    await db.sessionExercise.update({ where: { id: se.id }, data: { ...v.spec } });
    if (v.spec.isKeySet) await clearOtherKeySets(se.sessionId, se.id);
  } else if (body.action === 'move') {
    const se = await ownRow();
    if (!se) return fail(404, 'not_found');
    if (body.direction !== 'up' && body.direction !== 'down') return fail(400, 'direction_required');
    const siblings = await db.sessionExercise.findMany({ where: { sessionId: se.sessionId }, select: { id: true, order: true, section: true } });
    for (const u of moveWithinSection(siblings, se.id, body.direction)) {
      await db.sessionExercise.update({ where: { id: u.id }, data: { order: u.order } });
    }
  } else if (body.action === 'add') {
    const session = await db.session.findUnique({ where: { id: String(body.sessionId ?? '') }, include: { block: true, exercises: { select: { order: true } } } });
    if (!session || session.block.programId !== programId) return fail(404, 'session_not_found');
    const v = validateExerciseSpec(body);
    if (!v.ok) return fail(400, v.error);
    if (await bandRefused(v.spec.effortBand)) return fail(400, 'effort_band_adults_only');
    // the catalogue row's coachId was loaded and never compared: any coach could prescribe another's private row
    if (!(await ownExercise(v.spec.exerciseId))) return fail(404, 'exercise_not_found');
    const order = (session.exercises.reduce((m, e) => Math.max(m, e.order), 0)) + 1;
    const created = await db.sessionExercise.create({ data: { sessionId: session.id, order, ...v.spec } });
    if (v.spec.isKeySet) await clearOtherKeySets(session.id, created.id);
  } else return fail(400, 'unknown_action');

  const full = await db.coachingProgram.findUnique({ where: { id: programId }, include: TREE_INCLUDE });
  return { ok: true, tree: toTree(full) };
}

export interface LoadedProgram {
  program: { tree: ProgramTree; role: 'coach' | 'client'; isActive: boolean; startDate: Date; durationWeeks: number };
  warnings: Record<string, SessionWarning[]>;
}

/** GET /api/coach/programs/:id — one program for its coach or its client; anyone else gets not_found. */
export async function loadProgram(db: BuilderDb, userId: string, programId: string): Promise<BuilderResult<LoadedProgram>> {
  const row = await db.coachingProgram.findUnique({ where: { id: programId }, include: TREE_INCLUDE });
  const role = row ? accessRole(row, userId) : null;
  if (!row || !role) return fail(404, 'not_found');
  const tree = toTree(row);
  const warnings: Record<string, SessionWarning[]> = {};
  if (role === 'coach') {
    // the coach's view only: a client's Today has no use for "superset A has one exercise"
    for (const b of tree.blocks) for (const s of b.sessions) {
      const w = sessionWarnings(s.exercises);
      if (w.length) warnings[s.id] = w;
    }
  }
  return { ok: true, program: { tree, role, isActive: row.isActive, startDate: row.startDate, durationWeeks: row.durationWeeks }, warnings };
}
