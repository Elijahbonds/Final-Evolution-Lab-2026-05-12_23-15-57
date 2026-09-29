// The client's Today — read and save (MIRROR-COACH P2, 2026-09-25).
//
// GET /api/coach/me/today and POST /api/coach/me/log are this module plus the session check. Like the builder's
// server half (lib/coach/builderServer.ts) it takes the database as an argument, so the dev harness
// (app/dev/coach-today) runs the SAME code over an in-memory store on a lane whose database is offline on purpose,
// and lib/coach/today-route.test.ts runs the real routes over it.
//
// What changed, and why:
//   · READ. The tree's query now selects the catalogue's coaching (lib/coach/server.ts TREE_INCLUDE), and each of
//     today's exercises goes out as a TodayExercise (lib/coach/today.ts): cues, faults, the demo, the easier version
//     by NAME (a second read: the link is a bare id, and only the program coach's own rows are resolved), the set-up
//     picks and the band in words, and the timers. The open log comes with its SetLogs. The payload's `block` is the
//     block's own fields — it used to be the whole block, every session and exercise in it, for one label.
//   · SAVE. A log may carry `sets` (lib/coach/setLog.ts). Its sets replace what was saved for that exercise in one
//     transaction, and the per-exercise columns are derived from them, so the inbox and every older reader see a
//     weight, never the "RPE7" the old card pre-filled into the load box. A log without `sets` (the /training
//     step-through, the smoke probe, an old tab) saves exactly as before.
import type { PrismaClient } from '@/public/_prisma/client';
import { nextSession, orderedSessions, validateLog, type CleanLog } from './loop';
import { TREE_INCLUDE, toTree } from './server';
import { logEntryIsEmpty, summaryToWrite, type CleanSet } from './setLog';
import { todayExercise, variationIds, type CatalogueCoachingRow, type TodayExercise } from './today';
import { youthRules } from './taxonomy';

export type TodayDb = Pick<PrismaClient, 'coachingProgram' | 'user' | 'exerciseLog' | 'programExercise' | 'session' | 'clientSession' | 'setLog' | '$transaction'>;

export interface OpenSetLog { id: string; setIndex: number; reps: number | null; weightKg: number | null; rir: number | null; effort: number | null; workSeconds: number | null; note: string | null }
export interface OpenLog {
  id: string; sessionExerciseId: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null;
  clientNote: string | null; videoUrl: string | null; coachComment: string | null; completedAt: Date | string | null; setLogs: OpenSetLog[];
}

export interface TodayPayload {
  program: { id: string; name: string; coachName: string } | null;
  today: {
    block: { id: string; order: number; label: string; targetDate: string | null };
    session: { id: string; order: number; label: string; exercises: TodayExercise[] };
    index: number; total: number;
  } | null;
  open: { id: string; logs: OpenLog[] } | null;
  recentComments: { exercise: string; comment: string | null; at: Date | string | null }[];
}

const SET_ORDER = { setLogs: { orderBy: { setIndex: 'asc' as const } } };

/** GET /api/coach/me/today — the client's next session across their active programs, with the open log and recent coach comments. */
export async function loadToday(db: TodayDb, userId: string): Promise<TodayPayload> {
  const programs = await db.coachingProgram.findMany({
    where: { clientId: userId, isActive: true }, orderBy: { startDate: 'asc' },
    include: { ...TREE_INCLUDE, clientSessions: { where: { clientId: userId }, include: { exerciseLogs: { include: SET_ORDER } }, orderBy: { createdAt: 'desc' } } },
  });
  let finished: (typeof programs)[number] | null = null;
  for (const p of programs) {
    const tree = toTree(p);
    const done = p.clientSessions.filter((c) => c.completedAt).map((c) => c.sessionId);
    const next = nextSession(tree, done);
    // nextSession is null for a finished program AND for one with no sessions at all (a camp plan saved with no
    // milestones has none). Only the first is "Program complete" (MIRROR-COACH P2 review, 2026-09-26).
    if (!next) { if (!finished && orderedSessions(tree).length > 0) finished = p; continue; }
    const open = p.clientSessions.find((c) => c.sessionId === next.session.id && !c.completedAt) ?? null;
    const coach = await db.user.findUnique({ where: { id: p.coachId }, select: { name: true, email: true } });
    const recentComments = await db.exerciseLog.findMany({
      where: { clientSession: { clientId: userId, programId: p.id }, coachComment: { not: null } }, orderBy: { coachCommentAt: 'desc' }, take: 5,
      include: { sessionExercise: { include: { exercise: { select: { name: true } } } } },
    });

    // the coaching: each prescribed exercise's catalogue row, off the same query
    const rows = new Map<string, CatalogueCoachingRow>();
    for (const b of p.blocks) for (const s of b.sessions) if (s.id === next.session.id) for (const e of s.exercises) rows.set(e.id, e.exercise as CatalogueCoachingRow);
    // the easier/harder links are bare ids: resolve the names, from THIS coach's catalogue only
    const ids = variationIds([...rows.values()]);
    const names = new Map<string, string>();
    if (ids.length) for (const r of await db.programExercise.findMany({ where: { id: { in: ids }, coachId: p.coachId }, select: { id: true, name: true } })) names.set(r.id, r.name);
    // MIRROR-COACH P2 review (2026-09-26): youth rules for the reading client (decisions #6, #20: under 18, or no birth
    // year) — no adults-only band and no max-effort cue on their card (lib/coach/today.ts todayExercise)
    const youth = youthRules((await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }))?.dobYear);

    return {
      program: { id: p.id, name: p.name, coachName: coach?.name ?? coach?.email?.split('@')[0] ?? 'coach' },
      today: {
        block: { id: next.block.id, order: next.block.order, label: next.block.label, targetDate: next.block.targetDate },
        session: { id: next.session.id, order: next.session.order, label: next.session.label, exercises: next.session.exercises.map((e) => todayExercise(e, rows.get(e.id), names, { youth })) },
        index: next.index, total: next.total,
      },
      open: open ? { id: open.id, logs: open.exerciseLogs as unknown as OpenLog[] } : null,
      recentComments: recentComments.map((l) => ({ exercise: l.sessionExercise.exercise.name, comment: l.coachComment, at: l.coachCommentAt })),
    };
  }
  // Every active program is finished. This used to answer { program: null } too, so a client who had just pressed Done
  // on the last session read "No active program yet. A certified coach assigns one…" — Today's "Program complete"
  // line (today-view.tsx) was unreachable. Now the finished program is named, with no session. A program with NO
  // sessions is not finished: P2 named programs[0] whatever it held, so a client whose only program had no sessions yet
  // read "Program complete — nothing left on the plan"; that falls through to "no active program", as before P2.
  if (finished) {
    const coach = await db.user.findUnique({ where: { id: finished.coachId }, select: { name: true, email: true } });
    return { program: { id: finished.id, name: finished.name, coachName: coach?.name ?? coach?.email?.split('@')[0] ?? 'coach' }, today: null, open: null, recentComments: [] };
  }
  return { program: null, today: null, open: null, recentComments: [] };
}

export type SaveResult =
  | { ok: true; clientSession: unknown }
  | { ok: false; status: number; error: string; sessionExerciseId?: string; set?: number };

const fail = (status: number, error: string, extra: { sessionExerciseId?: string; set?: number } = {}): SaveResult => ({ ok: false, status, error, ...extra });

/**
 * POST /api/coach/me/log — the client logs a session.
 *  { programId, sessionId, logs: [{ sessionExerciseId, sets?: [{ reps?, weight?, unit?, rir?, effort?, workSeconds?, note? }],
 *    actualSets?, actualReps?, actualLoad?, rpe?, clientNote?, videoUrl? }], complete?: boolean }
 * Opens (or reuses) the client's open ClientSession for that session, upserts one ExerciseLog per exercise (and its
 * SetLogs when `sets` is sent), and marks the session complete when asked. The client can only log their own active
 * program. Every entry is validated before anything is written, so a refused set saves nothing.
 */
export async function saveClientLog(db: TodayDb, userId: string, body: Record<string, unknown>): Promise<SaveResult> {
  const programId = String(body.programId ?? ''), sessionId = String(body.sessionId ?? '');
  const program = await db.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, clientId: true, isActive: true } });
  if (!program || program.clientId !== userId) return fail(403, 'forbidden');
  if (!program.isActive) return fail(409, 'program_inactive');
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { block: { select: { programId: true } }, exercises: { select: { id: true } } } });
  if (!session || session.block.programId !== programId) return fail(404, 'session_not_found');
  const allowed = new Set(session.exercises.map((e) => e.id));

  const logs = Array.isArray(body.logs) ? body.logs.slice(0, 40) : [];
  const cleaned: CleanLog[] = [];
  for (const raw of logs) {
    const v = validateLog(raw && typeof raw === 'object' ? raw : {});
    if (!v.ok) return fail(400, v.error, { ...(raw && typeof raw.sessionExerciseId === 'string' ? { sessionExerciseId: raw.sessionExerciseId } : {}), ...(v.set ? { set: v.set } : {}) });
    if (!allowed.has(v.log.sessionExerciseId)) return fail(400, 'exercise_not_in_session');
    cleaned.push(v.log);
  }

  let cs = await db.clientSession.findFirst({ where: { programId, sessionId, clientId: userId, completedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!cs) cs = await db.clientSession.create({ data: { programId, sessionId, clientId: userId } });
  const now = new Date();
  const setWrites: { exerciseLogId: string; sets: CleanSet[] }[] = [];
  for (const l of cleaned) {
    const existing = await db.exerciseLog.findFirst({ where: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId }, include: { setLogs: { select: { id: true } } } });
    const summary = summaryToWrite(
      { actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe }, l.sets,
      { exists: !!existing, hadSets: (existing?.setLogs.length ?? 0) > 0 },
    );
    // MIRROR-COACH P2 review (2026-09-26): an untouched exercise writes no NEW row. Today sends every exercise on Save,
    // and an empty ExerciseLog read as logged coached work on the coach's boards and blocked the builder's remove
    // (lib/coach/setLog.ts logHasContent). Completing the session still writes one per exercise, as it always did.
    if (!existing && !body.complete && logEntryIsEmpty(summary, l)) continue;
    const data = { ...summary, clientNote: l.clientNote, videoUrl: l.videoUrl, completedAt: body.complete ? now : existing?.completedAt ?? null };
    const row = existing
      ? await db.exerciseLog.update({ where: { id: existing.id }, data })
      : await db.exerciseLog.create({ data: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId, ...data } });
    if (l.sets !== null) setWrites.push({ exerciseLogId: row.id, sets: l.sets });
  }
  // the sets, all exercises at once and all-or-nothing: the list sent is the whole list, so rows past its end go
  // (a set the client cleared) and each (log, setIndex) is written in place (@@unique([exerciseLogId, setIndex]))
  if (setWrites.length) {
    await db.$transaction(setWrites.flatMap(({ exerciseLogId, sets }) => [
      db.setLog.deleteMany({ where: { exerciseLogId, setIndex: { gte: sets.length } } }),
      ...sets.map((s) => {
        const { setIndex, ...fields } = s;
        return db.setLog.upsert({ where: { exerciseLogId_setIndex: { exerciseLogId, setIndex } }, create: { exerciseLogId, setIndex, ...fields }, update: fields });
      }),
    ]));
  }
  if (body.complete) {
    cs = await db.clientSession.update({ where: { id: cs.id }, data: { completedAt: now } });
    await db.exerciseLog.updateMany({ where: { clientSessionId: cs.id, completedAt: null }, data: { completedAt: now } });
  }
  const out = await db.clientSession.findUnique({ where: { id: cs.id }, include: { exerciseLogs: { include: SET_ORDER } } });
  return { ok: true, clientSession: out };
}
