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
import { validateCatalogueCreate } from './catalogue';
import { OFF_DAY_ITEMS, OFF_DAY_KIND, OFF_DAY_LABEL, offDayWouldRewind } from './offDay';
import { TREE_INCLUDE, toTree } from './server';
import { moveWithinSection, sessionWarnings, type SessionWarning } from './structure';
import { EMPTY_LOG_WHERE, logHasContent } from './setLog';
import { PIN_EXERCISE, bandAllowed, youthRules } from './taxonomy';

export type BuilderDb = Pick<PrismaClient, 'coachingProgram' | 'programExercise' | 'session' | 'sessionExercise' | 'exerciseLog' | 'facilitatorProfile' | 'user' | 'clientSession'>;
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
    const ex = await db.programExercise.findUnique({ where: { id: exerciseId }, select: { id: true, coachId: true, name: true } });
    return ex && ex.coachId === userId ? ex : null;
  };
  /**
   * MIRROR-COACH P3 review (2026-09-26), owner decisions #6 and #20: a row that pins (taxonomy.ts PIN_EXERCISE) is not
   * prescribed to a client under youth rules — the Mirror draft's one-tap add came through here with a coach's "Calf pin
   * and stretch" for a 15-year-old's heel-line flag, and so does any manual add.
   */
  const pinRefused = async (name: string | null | undefined) => {
    if (!name || !PIN_EXERCISE.test(name)) return false;
    const client = await db.user.findUnique({ where: { id: program.clientId }, select: { dobYear: true } });
    return youthRules(client?.dobYear);
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
    if (v.spec.exerciseId !== se.exerciseId) {
      const ex = await ownExercise(v.spec.exerciseId);
      if (!ex) return fail(404, 'exercise_not_found');
      if (await pinRefused(ex.name)) return fail(400, 'pin_not_for_youth');
    }
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
    const ex = await ownExercise(v.spec.exerciseId);
    if (!ex) return fail(404, 'exercise_not_found');
    if (await pinRefused(ex.name)) return fail(400, 'pin_not_for_youth');
    const order = (session.exercises.reduce((m, e) => Math.max(m, e.order), 0)) + 1;
    const created = await db.sessionExercise.create({ data: { sessionId: session.id, order, ...v.spec } });
    if (v.spec.isKeySet) await clearOtherKeySets(session.id, created.id);
  } else if (body.action === 'add_off_day') {
    // MIRROR-COACH P6 (2026-09-29): an OFF DAY into this week — FEL's template (lib/coach/offDay.ts: Easy Walk, three
    // rock-and-hold stretches, the recovery breath; 18 minutes), stored as a session of kind 'recovery' so the client
    // does and logs it like any session and P9 can count it. { blockId, afterSessionId? }: after that session (the ones
    // behind it move down one), else at the end of the week. The template's rows come from the COACH'S OWN catalogue —
    // a row they already have by that name is used as it is (their words stay theirs); a missing one is created from
    // the template, through the catalogue's own validator. Everything is validated before the first write.
    const tree = await db.coachingProgram.findUnique({ where: { id: programId }, include: TREE_INCLUDE });
    const block = tree?.blocks.find((b) => b.id === String(body.blockId ?? ''));
    if (!block) return fail(404, 'block_not_found');
    const afterId = typeof body.afterSessionId === 'string' && body.afterSessionId ? body.afterSessionId : null;
    const after = afterId ? block.sessions.find((x) => x.id === afterId) : null;
    if (afterId && !after) return fail(404, 'session_not_found');
    const order = after ? after.order + 1 : block.sessions.reduce((m, x) => Math.max(m, x.order), 0) + 1;
    // MIRROR-COACH P6 FIX (2026-09-29, code review): never ahead of a session the client already completed — Today is
    // the first not-done session, so an off day slotted before a done one rewound Today to it (offDay.ts
    // offDayWouldRewind). Checked before anything is written.
    const completed = await db.clientSession.findMany({
      where: { programId, clientId: program.clientId, completedAt: { not: null } }, select: { sessionId: true },
    });
    if (offDayWouldRewind(tree!.blocks, block.id, after?.id ?? null, completed.map((c) => c.sessionId))) return fail(409, 'off_day_before_done');
    const rows = OFF_DAY_ITEMS.map((i) => validateCatalogueCreate({ ...i.catalogue }));
    const specs = OFF_DAY_ITEMS.map((i) => validateExerciseSpec({ exerciseId: 'template', ...i.prescription }));
    if (rows.some((r) => !r.ok) || specs.some((v) => !v.ok)) return fail(500, 'off_day_template_invalid');
    const exerciseIds: string[] = [];
    for (const r of rows) {
      if (!r.ok) continue;
      const own = await db.programExercise.findFirst({ where: { coachId: userId, name: { equals: r.item.name, mode: 'insensitive' } }, select: { id: true } });
      if (own) { exerciseIds.push(own.id); continue; }
      try {
        exerciseIds.push((await db.programExercise.create({ data: { coachId: userId, ...r.item, commonFaults: [] }, select: { id: true } })).id);
      } catch (e) {
        // a database still carrying the old FEL-wide name key (P2's held swap, decision #28) refuses a name another coach owns
        if ((e as { code?: string } | null)?.code === 'P2002') return fail(409, 'name_taken_fel');
        throw e;
      }
    }
    if (after) await db.session.updateMany({ where: { blockId: block.id, order: { gte: order } }, data: { order: { increment: 1 } } });
    const created = await db.session.create({ data: { blockId: block.id, order, label: OFF_DAY_LABEL, kind: OFF_DAY_KIND }, select: { id: true } });
    for (const [k, v] of specs.entries()) {
      if (!v.ok) continue;
      await db.sessionExercise.create({ data: { sessionId: created.id, order: k + 1, ...v.spec, exerciseId: exerciseIds[k] } });
    }
  } else if (body.action === 'remove_off_day') {
    // MIRROR-COACH P6: take an off day back out — only an off day, and only one the client has not started (a logged
    // one is their work; ClientSession → Session is onDelete: Restrict, so the delete would throw anyway).
    const x = await db.session.findUnique({ where: { id: String(body.sessionId ?? '') }, include: { block: true } });
    if (!x || x.block.programId !== programId) return fail(404, 'session_not_found');
    if (x.kind !== OFF_DAY_KIND) return fail(409, 'not_an_off_day');
    if (await db.clientSession.count({ where: { sessionId: x.id } })) return fail(409, 'off_day_logged');
    try {
      await db.session.delete({ where: { id: x.id } });   // its prescriptions go with it (SessionExercise onDelete: Cascade)
    } catch (e) {
      if ((e as { code?: string } | null)?.code === 'P2003') return fail(409, 'off_day_logged');
      throw e;
    }
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
