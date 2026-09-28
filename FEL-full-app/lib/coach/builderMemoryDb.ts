// An in-memory stand-in for the tables the program builder touches (MIRROR-COACH P2, 2026-09-25): facilitator
// profiles, programs → blocks → sessions → session exercises, the coach's catalogue and exercise logs. Used by
// lib/coach/builder-route.test.ts (behind a vi.mock of @/lib/db, so the REAL routes run) and by the dev harness
// app/dev/program-builder (which passes it to lib/coach/builderServer.ts), because the lane's database is offline.
//
// It enforces what Postgres and Prisma would, and nothing more:
//   · a SessionExercise write with a column the schema does not have throws "Unknown argument", as Prisma does — so a
//     spec that grew a field the schema lacks fails in a test, not in production;
//   · SessionExercise columns the write leaves out take the schema's defaults (prisma/schema.prisma);
//   · deleting a SessionExercise an ExerciseLog points at throws P2003 (onDelete: Restrict).
// Filters understand only what the builder, the load and the duplicate route send. Not for app code.
import { PRESCRIPTION_COLUMNS } from './structure';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BuilderStore {
  seq: number;
  fac: Row[]; program: Row[]; block: Row[]; session: Row[]; se: Row[]; pe: Row[]; log: Row[];
  /** Users, for the client's birth year (the youth gate on adults-only bands, MIRROR-COACH P2 review). */
  user?: Row[];
}

export const newBuilderStore = (): BuilderStore => ({ seq: 0, fac: [], program: [], block: [], session: [], se: [], pe: [], log: [], user: [] });

/** The SessionExercise columns a write may name: the prescription plus the session it belongs to. */
export const SESSION_EXERCISE_WRITABLE = new Set<string>([...PRESCRIPTION_COLUMNS, 'sessionId']);
/** The schema's defaults for SessionExercise (prisma/schema.prisma). */
export const SESSION_EXERCISE_DEFAULTS: Row = {
  sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null,
  section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null,
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const byOrder = (a: Row, b: Row) => a.order - b.order;
const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : { ...row });
const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});

function seData(data: Row, base?: Row): Row {
  for (const k of Object.keys(data)) if (!SESSION_EXERCISE_WRITABLE.has(k)) throw err(`Unknown argument \`${k}\`. Available options are marked with ?.`);
  return { ...(base ?? SESSION_EXERCISE_DEFAULTS), ...clone(data) };
}

function tree(s: BuilderStore, programId: string): Row[] {
  return s.block.filter((b) => b.programId === programId).sort(byOrder).map((b) => ({
    ...b,
    sessions: s.session.filter((x) => x.blockId === b.id).sort(byOrder).map((x) => ({
      ...x,
      exercises: s.se.filter((e) => e.sessionId === x.id).sort(byOrder).map((e) => {
        const pe = s.pe.find((p) => p.id === e.exerciseId);
        return { ...clone(e), exercise: { name: pe?.name ?? '?', category: pe?.category ?? 'general' } };
      }),
    })),
  }));
}

/** Write a program with nested blocks → sessions → exercises, the way prisma.coachingProgram.create takes it. */
export function createProgram(s: BuilderStore, data: Row): Row {
  const id = (p: string) => `${p}-${++s.seq}`;
  const p = { id: id('p'), coachId: data.coachId, clientId: data.clientId, name: data.name, startDate: data.startDate ?? new Date(), durationWeeks: data.durationWeeks ?? 4, isActive: true };
  s.program.push(p);
  for (const b of data.blocks?.create ?? []) {
    const block = { id: id('b'), programId: p.id, order: b.order, label: b.label, targetDate: b.targetDate ?? null };
    s.block.push(block);
    for (const x of b.sessions?.create ?? []) {
      const session = { id: id('s'), blockId: block.id, order: x.order, label: x.label };
      s.session.push(session);
      for (const e of x.exercises?.create ?? []) s.se.push({ id: id('se'), sessionId: session.id, ...seData(e) });
    }
  }
  return p;
}

/** A Prisma-shaped object over `s`, covering the builder's, the load's and the duplicate route's calls. */
export function builderMemoryDb(s: BuilderStore) {
  const id = (p: string) => `${p}-${++s.seq}`;
  return {
    facilitatorProfile: { findUnique: async (a: Row) => { const f = s.fac.find((x) => x.userId === a.where.userId); return f ? pick(f, a.select) : null; } },
    user: { findUnique: async (a: Row) => { const u = (s.user ?? []).find((x) => x.id === a.where.id); return u ? pick(u, a.select) : null; } },
    coachingProgram: {
      findUnique: async (a: Row) => {
        const p = s.program.find((x) => x.id === a.where.id);
        if (!p) return null;
        if (a.select) return pick(p, a.select);
        return a.include?.blocks ? { ...p, blocks: tree(s, p.id) } : { ...p };
      },
      findMany: async (a: Row) => s.program
        .filter((p) => p.coachId === a.where.coachId && (a.where.clientId?.in ?? []).includes(p.clientId) && String(p.name).startsWith(a.where.name?.startsWith ?? ''))
        .map((p) => pick(p, a.select)),
      create: async (a: Row) => pick(createProgram(s, a.data), a.select),
    },
    programExercise: { findUnique: async (a: Row) => { const p = s.pe.find((x) => x.id === a.where.id); return p ? pick(p, a.select) : null; } },
    session: {
      findUnique: async (a: Row) => {
        const x = s.session.find((y) => y.id === a.where.id);
        if (!x) return null;
        return { ...x, block: s.block.find((b) => b.id === x.blockId), exercises: s.se.filter((e) => e.sessionId === x.id).map((e) => ({ order: e.order })) };
      },
    },
    sessionExercise: {
      findUnique: async (a: Row) => {
        const e = s.se.find((y) => y.id === a.where.id);
        if (!e) return null;
        const session = s.session.find((y) => y.id === e.sessionId)!;
        return { ...clone(e), session: { ...session, block: s.block.find((b) => b.id === session.blockId) } };
      },
      findMany: async (a: Row) => s.se.filter((e) => e.sessionId === a.where.sessionId).map((e) => pick(e, a.select)),
      create: async (a: Row) => { const row = { id: id('se'), ...seData(a.data) }; s.se.push(row); return { ...row }; },
      update: async (a: Row) => {
        const i = s.se.findIndex((e) => e.id === a.where.id);
        if (i < 0) throw err('Record to update not found.', 'P2025');
        s.se[i] = seData(a.data, s.se[i]);
        return { ...s.se[i] };
      },
      updateMany: async (a: Row) => {
        let count = 0;
        for (const [i, e] of s.se.entries()) {
          if (e.sessionId === a.where.sessionId && (a.where.isKeySet === undefined || e.isKeySet === a.where.isKeySet) && e.id !== a.where.id?.not) {
            s.se[i] = seData(a.data, e); count++;
          }
        }
        return { count };
      },
      delete: async (a: Row) => {
        if (s.log.some((l) => l.sessionExerciseId === a.where.id)) throw err('Foreign key constraint violated', 'P2003');
        const row = s.se.find((e) => e.id === a.where.id);
        if (!row) throw err('Record to delete does not exist.', 'P2025');
        s.se = s.se.filter((e) => e.id !== a.where.id);
        return row;
      },
    },
    // MIRROR-COACH P2 review (2026-09-26): the builder's remove reads each log's content and clears the empty ones by
    // EMPTY_LOG_WHERE (lib/coach/setLog.ts); this understands that filter and nothing more. A log's sets are s.log rows'
    // own `setLogs` list (absent = none).
    exerciseLog: {
      count: async (a: Row) => s.log.filter((l) => l.sessionExerciseId === a.where.sessionExerciseId).length,
      findMany: async (a: Row) => s.log.filter((l) => l.sessionExerciseId === a.where.sessionExerciseId).map((l) => ({
        id: l.id, actualSets: l.actualSets ?? null, actualReps: l.actualReps ?? null, actualLoad: l.actualLoad ?? null, rpe: l.rpe ?? null,
        clientNote: l.clientNote ?? null, videoUrl: l.videoUrl ?? null, coachComment: l.coachComment ?? null, setLogs: (l.setLogs ?? []).slice(0, 1),
      })),
      deleteMany: async (a: Row) => {
        const w = a.where;
        const empty = (l: Row) => !(l.setLogs ?? []).length && l.actualReps == null && l.actualLoad == null && l.rpe == null
          && l.clientNote == null && l.videoUrl == null && l.coachComment == null && (l.actualSets == null || l.actualSets === 0);
        const gone = s.log.filter((l) => l.sessionExerciseId === w.sessionExerciseId && (w.id?.in ?? []).includes(l.id) && empty(l));
        s.log = s.log.filter((l) => !gone.includes(l));
        return { count: gone.length };
      },
    },
  };
}
