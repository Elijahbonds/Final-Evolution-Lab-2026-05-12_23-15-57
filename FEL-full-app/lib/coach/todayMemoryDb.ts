// An in-memory stand-in for the tables the client's Today reads and writes (MIRROR-COACH P2, 2026-09-25): programs →
// blocks → sessions → session exercises with their catalogue rows, users, client sessions, exercise logs and set logs.
// Used by lib/coach/today-route.test.ts (behind a vi.mock of @/lib/db, so the REAL routes run) and by the dev harness
// app/dev/coach-today (which passes it to lib/coach/todayServer.ts), because the lane's database is offline.
//
// It enforces what Postgres and Prisma would, and nothing more:
//   · an ExerciseLog or SetLog write naming a column the schema does not have throws "Unknown argument", as Prisma
//     does — today-route.test.ts checks these column lists against prisma/schema.prisma;
//   · SetLog (exerciseLogId, setIndex) is unique: a create that repeats one throws P2002;
//   · `select` on the catalogue row projects exactly the selected columns, so a column the tree forgets to select is
//     missing here too.
// Filters understand only what lib/coach/todayServer.ts sends. Not for app code.

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TodayStore {
  seq: number; clock: number;
  program: Row[]; block: Row[]; session: Row[]; se: Row[]; pe: Row[]; user: Row[]; cs: Row[]; log: Row[]; setLog: Row[];
}

export const newTodayStore = (): TodayStore => ({ seq: 0, clock: Date.parse('2026-09-28T09:00:00Z'), program: [], block: [], session: [], se: [], pe: [], user: [], cs: [], log: [], setLog: [] });

/** ExerciseLog columns a write may name (prisma/schema.prisma model ExerciseLog, less id / timestamps / relations). */
export const EXERCISE_LOG_WRITABLE = ['clientSessionId', 'sessionExerciseId', 'actualSets', 'actualReps', 'actualLoad', 'rpe', 'clientNote', 'videoUrl', 'coachComment', 'coachCommentAt', 'completedAt'] as const;
/** SetLog columns a write may name. */
export const SET_LOG_WRITABLE = ['exerciseLogId', 'setIndex', 'reps', 'weightKg', 'rir', 'effort', 'workSeconds', 'note'] as const;
/** SessionExercise's prescription defaults (prisma/schema.prisma), for seeding rows the way the database fills them. */
export const SE_DEFAULTS: Row = {
  sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null,
  section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null,
};
/** ProgramExercise defaults. */
export const PE_DEFAULTS: Row = {
  category: 'general', demoVideoUrl: null, primaryCues: [], commonFaults: null, equipment: [], defaultTempo: '3-1-1-0',
  progressionOfId: null, regressionOfId: null, pattern: null, braceMode: null, skillLayer: null,
};

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) ? new Date(x) : x)));
const byOrder = (a: Row, b: Row) => a.order - b.order;
const pick = (row: Row, select?: Row): Row => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, clone(row[k])])) : clone(row));
const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});
function checkColumns(model: string, data: Row, allowed: readonly string[]) {
  for (const k of Object.keys(data)) if (!allowed.includes(k)) throw err(`Invalid \`prisma.${model}\` invocation: Unknown argument \`${k}\`.`);
}
const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : 0);

export function todayMemoryDb(s: TodayStore) {
  const id = (p: string) => `${p}-${++s.seq}`;
  const tick = () => new Date(s.clock += 1000);
  const setLogsOf = (logId: string) => s.setLog.filter((x) => x.exerciseLogId === logId).sort((a, b) => a.setIndex - b.setIndex).map((x) => clone(x));
  const logWith = (l: Row, include?: Row) => {
    const out = clone(l);
    if (include?.setLogs) out.setLogs = include.setLogs.select ? setLogsOf(l.id).map((x) => pick(x, include.setLogs.select)) : setLogsOf(l.id);
    return out;
  };
  const csWith = (c: Row, include?: Row) => {
    const out = clone(c);
    if (include?.exerciseLogs) out.exerciseLogs = s.log.filter((l) => l.clientSessionId === c.id).map((l) => logWith(l, include.exerciseLogs === true ? undefined : include.exerciseLogs.include));
    return out;
  };
  const tree = (programId: string, exerciseSelect: Row) => s.block.filter((b) => b.programId === programId).sort(byOrder).map((b) => ({
    ...clone(b),
    sessions: s.session.filter((x) => x.blockId === b.id).sort(byOrder).map((x) => ({
      ...clone(x),
      exercises: s.se.filter((e) => e.sessionId === x.id).sort(byOrder).map((e) => ({ ...clone(e), exercise: pick(s.pe.find((p) => p.id === e.exerciseId) ?? {}, exerciseSelect) })),
    })),
  }));

  const db = {
    coachingProgram: {
      findMany: async (a: Row) => s.program
        .filter((p) => p.clientId === a.where.clientId && (a.where.isActive === undefined || p.isActive === a.where.isActive))
        .sort((x, y) => time(x.startDate) - time(y.startDate))
        .map((p) => {
          const exerciseSelect = a.include.blocks.include.sessions.include.exercises.include.exercise.select;
          const cs = s.cs.filter((c) => c.programId === p.id && c.clientId === a.include.clientSessions.where.clientId)
            .sort((x, y) => time(y.createdAt) - time(x.createdAt))
            .map((c) => csWith(c, a.include.clientSessions.include));
          return { ...clone(p), blocks: tree(p.id, exerciseSelect), clientSessions: cs };
        }),
      findUnique: async (a: Row) => { const p = s.program.find((x) => x.id === a.where.id); return p ? pick(p, a.select) : null; },
    },
    user: {
      findUnique: async (a: Row) => { const u = s.user.find((x) => x.id === a.where.id); return u ? pick(u, a.select) : null; },
      findMany: async (a: Row) => s.user.filter((u) => (a.where.id?.in ?? []).includes(u.id)).map((u) => pick(u, a.select)),
    },
    programExercise: {
      findMany: async (a: Row) => s.pe.filter((p) => (a.where.id?.in ?? []).includes(p.id) && (a.where.coachId === undefined || p.coachId === a.where.coachId)).map((p) => pick(p, a.select)),
    },
    session: {
      findUnique: async (a: Row) => {
        const x = s.session.find((y) => y.id === a.where.id);
        if (!x) return null;
        const block = s.block.find((b) => b.id === x.blockId)!;
        return { ...clone(x), block: { programId: block.programId }, exercises: s.se.filter((e) => e.sessionId === x.id).map((e) => ({ id: e.id })) };
      },
    },
    clientSession: {
      findFirst: async (a: Row) => {
        const w = a.where;
        const hit = s.cs.filter((c) => c.programId === w.programId && c.sessionId === w.sessionId && c.clientId === w.clientId && (w.completedAt !== null || c.completedAt === null))
          .sort((x, y) => time(y.createdAt) - time(x.createdAt))[0];
        return hit ? clone(hit) : null;
      },
      findUnique: async (a: Row) => { const c = s.cs.find((x) => x.id === a.where.id); return c ? csWith(c, a.include) : null; },
      // the coach's inbox read (app/api/coach/inbox): completed sessions in the coach's programs, newest first
      findMany: async (a: Row) => s.cs
        .filter((c) => c.completedAt !== null && s.program.find((p) => p.id === c.programId)?.coachId === a.where.program.coachId)
        .sort((x, y) => time(y.completedAt) - time(x.completedAt)).slice(0, a.take ?? Infinity)
        .map((c) => {
          const session = s.session.find((x) => x.id === c.sessionId)!;
          const logs = s.log.filter((l) => l.clientSessionId === c.id).map((l) => {
            const se = s.se.find((e) => e.id === l.sessionExerciseId)!;
            return { ...logWith(l, a.include.exerciseLogs.include), sessionExercise: { ...clone(se), exercise: { name: s.pe.find((p) => p.id === se.exerciseId)?.name } } };
          });
          return {
            ...clone(c), program: pick(s.program.find((p) => p.id === c.programId)!, a.include.program.select),
            session: { label: session.label, block: { label: s.block.find((b) => b.id === session.blockId)!.label } }, exerciseLogs: logs,
          };
        }),
      create: async (a: Row) => { const at = tick(); const c = { id: id('cs'), completedAt: null, ...clone(a.data), createdAt: at, updatedAt: at }; s.cs.push(c); return clone(c); },
      update: async (a: Row) => {
        const i = s.cs.findIndex((c) => c.id === a.where.id);
        if (i < 0) throw err('Record to update not found.', 'P2025');
        s.cs[i] = { ...s.cs[i], ...clone(a.data), updatedAt: tick() };
        return clone(s.cs[i]);
      },
    },
    exerciseLog: {
      findFirst: async (a: Row) => {
        const l = s.log.find((x) => x.clientSessionId === a.where.clientSessionId && x.sessionExerciseId === a.where.sessionExerciseId);
        return l ? logWith(l, a.include) : null;
      },
      findMany: async (a: Row) => {
        // the recent-comments read: this client's logs in this program that carry a coach comment, newest first
        const w = a.where;
        const rows = s.log.filter((l) => {
          const c = s.cs.find((x) => x.id === l.clientSessionId);
          return c && c.clientId === w.clientSession.clientId && c.programId === w.clientSession.programId && l.coachComment != null;
        }).sort((x, y) => time(y.coachCommentAt) - time(x.coachCommentAt)).slice(0, a.take ?? Infinity);
        return rows.map((l) => {
          const se = s.se.find((e) => e.id === l.sessionExerciseId)!;
          return { ...clone(l), sessionExercise: { ...clone(se), exercise: { name: s.pe.find((p) => p.id === se.exerciseId)?.name } } };
        });
      },
      create: async (a: Row) => {
        checkColumns('exerciseLog.create', a.data, EXERCISE_LOG_WRITABLE);
        const at = tick();
        const l = { id: id('log'), actualSets: null, actualReps: null, actualLoad: null, rpe: null, clientNote: null, videoUrl: null, coachComment: null, coachCommentAt: null, completedAt: null, ...clone(a.data), createdAt: at, updatedAt: at };
        s.log.push(l);
        return clone(l);
      },
      update: async (a: Row) => {
        checkColumns('exerciseLog.update', a.data, EXERCISE_LOG_WRITABLE);
        const i = s.log.findIndex((l) => l.id === a.where.id);
        if (i < 0) throw err('Record to update not found.', 'P2025');
        s.log[i] = { ...s.log[i], ...clone(a.data), updatedAt: tick() };
        return clone(s.log[i]);
      },
      updateMany: async (a: Row) => {
        checkColumns('exerciseLog.updateMany', a.data, EXERCISE_LOG_WRITABLE);
        let count = 0;
        for (const [i, l] of s.log.entries()) {
          if (l.clientSessionId === a.where.clientSessionId && (a.where.completedAt !== null || l.completedAt === null)) { s.log[i] = { ...l, ...clone(a.data) }; count++; }
        }
        return { count };
      },
    },
    setLog: {
      deleteMany: async (a: Row) => {
        const before = s.setLog.length;
        s.setLog = s.setLog.filter((x) => !(x.exerciseLogId === a.where.exerciseLogId && (a.where.setIndex?.gte === undefined || x.setIndex >= a.where.setIndex.gte)));
        return { count: before - s.setLog.length };
      },
      upsert: async (a: Row) => {
        const key = a.where.exerciseLogId_setIndex;
        const i = s.setLog.findIndex((x) => x.exerciseLogId === key.exerciseLogId && x.setIndex === key.setIndex);
        if (i >= 0) {
          checkColumns('setLog.upsert', a.update, SET_LOG_WRITABLE);
          s.setLog[i] = { ...s.setLog[i], ...clone(a.update) };
          return clone(s.setLog[i]);
        }
        checkColumns('setLog.upsert', a.create, SET_LOG_WRITABLE);
        if (!s.log.some((l) => l.id === a.create.exerciseLogId)) throw err('Foreign key constraint violated: SetLog_exerciseLogId_fkey', 'P2003');
        const row = { id: id('set'), reps: null, weightKg: null, rir: null, effort: null, workSeconds: null, note: null, ...clone(a.create), createdAt: tick() };
        if (s.setLog.some((x) => x.exerciseLogId === row.exerciseLogId && x.setIndex === row.setIndex)) throw err('Unique constraint failed on the fields: (`exerciseLogId`,`setIndex`)', 'P2002');
        s.setLog.push(row);
        return clone(row);
      },
    },
    // the array form: every operation has already run (these methods are eager), in order; the store has no rollback,
    // so a test that needs all-or-nothing checks that validation refuses BEFORE anything is written instead
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return db;
}

// ── seeding ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SeedExercise { id?: string; exerciseId: string; order?: number; [k: string]: unknown }
export interface SeedSession { id?: string; order: number; label: string; exercises: SeedExercise[] }

/** A program for `clientId` from `coachId`, one block, with the given sessions. Returns the ids it made. */
export function seedProgram(s: TodayStore, spec: { coachId: string; clientId: string; name: string; blockLabel: string; sessions: SeedSession[]; isActive?: boolean }): { programId: string; blockId: string; sessionIds: string[]; exerciseIds: string[][] } {
  const id = (p: string) => `${p}-${++s.seq}`;
  const programId = id('p');
  s.program.push({ id: programId, coachId: spec.coachId, clientId: spec.clientId, name: spec.name, isActive: spec.isActive ?? true, startDate: new Date('2026-09-28T00:00:00Z'), durationWeeks: 4 });
  const blockId = id('b');
  s.block.push({ id: blockId, programId, order: 1, label: spec.blockLabel, targetDate: null });
  const sessionIds: string[] = [], exerciseIds: string[][] = [];
  for (const x of spec.sessions) {
    const sid = x.id ?? id('s');
    s.session.push({ id: sid, blockId, order: x.order, label: x.label });
    sessionIds.push(sid);
    exerciseIds.push(x.exercises.map((e, i) => {
      const eid = e.id ?? id('se');
      s.se.push({ ...SE_DEFAULTS, order: i + 1, ...clone(e), id: eid, sessionId: sid });
      return eid;
    }));
  }
  return { programId, blockId, sessionIds, exerciseIds };
}

/** A catalogue row with the schema's defaults under what is given. */
export const catalogueRow = (row: Row): Row => ({ ...PE_DEFAULTS, ...row });
