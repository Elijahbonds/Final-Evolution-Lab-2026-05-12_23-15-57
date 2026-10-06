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
  /** Client sessions (MIRROR-COACH P6): only read, to refuse removing an off day the client has started. */
  cs?: Row[];
  /** The coaches' rosters (CoachClient): duplicate copies onto a live roster athlete only (owner-approved 2026-10-06). */
  cc?: Row[];
}

export const newBuilderStore = (): BuilderStore => ({ seq: 0, fac: [], program: [], block: [], session: [], se: [], pe: [], log: [], user: [], cs: [], cc: [] });

/**
 * MIRROR-COACH P6 (2026-09-29): the Session columns a write may name (prisma/schema.prisma model Session, less id,
 * timestamps and relations) and the ProgramExercise ones (the catalogue's fields plus the owner) — the off day
 * (builderServer.ts add_off_day) is the first builder action that writes either. offDay-builder-route.test.ts holds
 * both lists to the schema.
 */
export const SESSION_WRITABLE = ['blockId', 'order', 'label', 'kind'] as const;
export const PROGRAM_EXERCISE_WRITABLE = [
  'coachId', 'name', 'category', 'demoVideoUrl', 'primaryCues', 'commonFaults', 'equipment', 'defaultTempo', 'pattern', 'braceMode', 'skillLayer',
  'progressionOfId', 'regressionOfId',
] as const;
function checkColumns(model: string, data: Row, allowed: readonly string[]) {
  for (const k of Object.keys(data)) if (!allowed.includes(k)) throw err(`Invalid \`prisma.${model}\` invocation: Unknown argument \`${k}\`.`);
}

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

/**
 * MIRROR-COACH P8 (2026-09-29): the Block columns a nested write may name (prisma/schema.prisma model Block, less id,
 * programId, timestamps; `sessions` is the relation) — the template clone (builderServer.ts 'clone_template') is the
 * first builder action that writes blocks. templates/clone-route.test.ts holds it to the schema.
 */
export const BLOCK_WRITABLE = ['order', 'label', 'targetDate'] as const;

/** Nested blocks → sessions → exercises under a program, the way Prisma's `blocks: { create: [...] }` takes them. */
function createBlocks(s: BuilderStore, programId: string, blocks: Row[]) {
  const id = (p: string) => `${p}-${++s.seq}`;
  for (const b of blocks) {
    const { sessions, ...blockData } = b;
    checkColumns('block.create', blockData, BLOCK_WRITABLE);
    const block = { id: id('b'), programId, order: b.order, label: b.label, targetDate: b.targetDate ?? null };
    s.block.push(block);
    for (const x of sessions?.create ?? []) {
      const { exercises, ...sessionData } = x;
      checkColumns('session.create', sessionData, SESSION_WRITABLE.filter((c) => c !== 'blockId'));
      const session = { id: id('s'), blockId: block.id, order: x.order, label: x.label, kind: x.kind ?? 'training' };
      s.session.push(session);
      for (const e of exercises?.create ?? []) s.se.push({ id: id('se'), sessionId: session.id, ...seData(e) });
    }
  }
}

/** Write a program with nested blocks → sessions → exercises, the way prisma.coachingProgram.create takes it. */
export function createProgram(s: BuilderStore, data: Row): Row {
  const id = (p: string) => `${p}-${++s.seq}`;
  const p = { id: id('p'), coachId: data.coachId, clientId: data.clientId, name: data.name, startDate: data.startDate ?? new Date(), durationWeeks: data.durationWeeks ?? 4, isActive: true };
  s.program.push(p);
  createBlocks(s, p.id, data.blocks?.create ?? []);
  return p;
}

/**
 * MIRROR-COACH P8: prisma.coachingProgram.update as the template clone sends it — scalar columns plus
 * `blocks: { deleteMany: {} | { id: { in } }, create: [...] }`. Prisma runs a nested write in one transaction, so this checks the
 * restrictions the delete would meet (ClientSession → Session and ExerciseLog → SessionExercise are onDelete: Restrict)
 * BEFORE it changes anything, and a failed nested create leaves the program as it was.
 */
function updateProgram(s: BuilderStore, programId: string, data: Row): Row {
  const i = s.program.findIndex((p) => p.id === programId);
  if (i < 0) throw err('Record to update not found.', 'P2025');
  const { blocks, ...scalars } = data;
  checkColumns('coachingProgram.update', scalars, ['name', 'startDate', 'durationWeeks', 'isActive', 'completedAt']);
  if (blocks) {
    for (const k of Object.keys(blocks)) if (k !== 'deleteMany' && k !== 'create') throw err(`Unknown argument \`${k}\` on blocks.`);
    const before = JSON.stringify({ block: s.block, session: s.session, se: s.se, seq: s.seq });
    try {
      if (blocks.deleteMany) {
        const w = blocks.deleteMany;
        if (Object.keys(w).some((k) => k !== 'id') || (w.id && !Array.isArray(w.id.in))) throw err('builderMemoryDb: blocks.deleteMany understands {} and { id: { in } } only');
        const gone = s.block.filter((b) => b.programId === programId && (!w.id || w.id.in.includes(b.id))).map((b) => b.id);
        const sessions = s.session.filter((x) => gone.includes(x.blockId)).map((x) => x.id);
        const ses = s.se.filter((e) => sessions.includes(e.sessionId)).map((e) => e.id);
        if ((s.cs ?? []).some((c) => sessions.includes(c.sessionId)) || s.log.some((l) => ses.includes(l.sessionExerciseId))) throw err('Foreign key constraint violated', 'P2003');
        s.se = s.se.filter((e) => !ses.includes(e.id));
        s.session = s.session.filter((x) => !sessions.includes(x.id));
        s.block = s.block.filter((b) => !gone.includes(b.id));
      }
      createBlocks(s, programId, blocks.create ?? []);
    } catch (e) {
      const b = JSON.parse(before);
      s.block = b.block; s.session = b.session; s.se = b.se; s.seq = b.seq;
      throw e;
    }
  }
  s.program[i] = { ...s.program[i], ...clone(scalars) };
  return s.program[i];
}

/** A Prisma-shaped object over `s`, covering the builder's, the load's and the duplicate route's calls. */
export function builderMemoryDb(s: BuilderStore) {
  const id = (p: string) => `${p}-${++s.seq}`;
  return {
    facilitatorProfile: { findUnique: async (a: Row) => { const f = s.fac.find((x) => x.userId === a.where.userId); return f ? pick(f, a.select) : null; } },
    user: { findUnique: async (a: Row) => { const u = (s.user ?? []).find((x) => x.id === a.where.id); return u ? pick(u, a.select) : null; } },
    coachClient: {
      findMany: async (a: Row) => (s.cc ?? [])
        .filter((r) => r.coachId === a.where.coachId && (a.where.endedAt === null ? r.endedAt == null : true) && (a.where.clientId?.in ?? []).includes(r.clientId))
        .map((r) => pick(r, a.select)),
    },
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
      // MIRROR-COACH P8: the template clone replaces a blank program's weeks in one nested write
      update: async (a: Row) => {
        const p = updateProgram(s, a.where.id, a.data);
        return a.include?.blocks ? { ...p, blocks: tree(s, p.id) } : pick(p, a.select);
      },
    },
    programExercise: {
      findUnique: async (a: Row) => { const p = s.pe.find((x) => x.id === a.where.id); return p ? pick(p, a.select) : null; },
      // MIRROR-COACH P8: the template clone reads the coach's rows once ({ where: { coachId } }) to reuse any it already has
      findMany: async (a: Row) => s.pe.filter((x) => a.where?.coachId === undefined || x.coachId === a.where.coachId).map((x) => pick(x, a.select)),
      // …and links the rungs it seeded ({ where: { id }, data: { regressionOfId?, progressionOfId? } })
      update: async (a: Row) => {
        checkColumns('programExercise.update', a.data, PROGRAM_EXERCISE_WRITABLE);
        const i = s.pe.findIndex((x) => x.id === a.where.id);
        if (i < 0) throw err('Record to update not found.', 'P2025');
        s.pe[i] = { ...s.pe[i], ...clone(a.data) };
        return pick(s.pe[i], a.select);
      },
      // MIRROR-COACH P6: the off day looks the coach's own row up by name ({ equals, mode: 'insensitive' } or a plain string)
      findFirst: async (a: Row) => {
        const w = a.where;
        const want = typeof w.name === 'string' ? w.name : w.name?.equals;
        const same = (n: string) => (w.name?.mode === 'insensitive' ? n.toLowerCase() === String(want).toLowerCase() : n === want);
        const p = s.pe.find((x) => x.coachId === w.coachId && same(String(x.name)));
        return p ? pick(p, a.select) : null;
      },
      // …and creates a missing one. @@unique([coachId, name]) is enforced, as Postgres would (P2002).
      create: async (a: Row) => {
        checkColumns('programExercise.create', a.data, PROGRAM_EXERCISE_WRITABLE);
        if (s.pe.some((x) => x.coachId === a.data.coachId && x.name === a.data.name)) throw err('Unique constraint failed on the fields: (`coachId`,`name`)', 'P2002');
        const row = { id: id('pe'), category: 'general', demoVideoUrl: null, primaryCues: [], commonFaults: null, equipment: [], defaultTempo: '3-1-1-0',
          progressionOfId: null, regressionOfId: null, pattern: null, braceMode: null, skillLayer: null, ...clone(a.data) };
        s.pe.push(row);
        return pick(row, a.select);
      },
    },
    session: {
      findUnique: async (a: Row) => {
        const x = s.session.find((y) => y.id === a.where.id);
        if (!x) return null;
        return { kind: 'training', ...x, block: s.block.find((b) => b.id === x.blockId), exercises: s.se.filter((e) => e.sessionId === x.id).map((e) => ({ order: e.order })) };
      },
      // MIRROR-COACH P6: the off day's insert (create, and moving the sessions behind it down one) and its removal
      create: async (a: Row) => {
        checkColumns('session.create', a.data, SESSION_WRITABLE);
        if (a.data.kind !== undefined && a.data.kind !== 'training' && a.data.kind !== 'recovery') throw err(`Invalid value for argument \`kind\`. Expected SessionKind.`);
        const row = { id: id('s'), kind: 'training', ...clone(a.data) };
        s.session.push(row);
        return pick(row, a.select);
      },
      updateMany: async (a: Row) => {
        let count = 0;
        for (const [i, x] of s.session.entries()) {
          if (x.blockId === a.where.blockId && (a.where.order?.gte === undefined || x.order >= a.where.order.gte)) {
            s.session[i] = { ...x, order: x.order + (a.data.order?.increment ?? 0) }; count++;
          }
        }
        return { count };
      },
      delete: async (a: Row) => {
        const x = s.session.find((y) => y.id === a.where.id);
        if (!x) throw err('Record to delete does not exist.', 'P2025');
        // ClientSession → Session is onDelete: Restrict; SessionExercise → Session cascades, but ExerciseLog → SessionExercise restricts
        const ses = s.se.filter((e) => e.sessionId === x.id);
        if ((s.cs ?? []).some((c) => c.sessionId === x.id) || s.log.some((l) => ses.some((e) => e.id === l.sessionExerciseId))) throw err('Foreign key constraint violated', 'P2003');
        s.se = s.se.filter((e) => e.sessionId !== x.id);
        s.session = s.session.filter((y) => y.id !== x.id);
        return { ...x };
      },
    },
    clientSession: {
      count: async (a: Row) => (s.cs ?? []).filter((c) => c.sessionId === a.where.sessionId).length,
      // MIRROR-COACH P6: add_off_day reads the client's completed sessions ({ programId, clientId, completedAt: { not: null } })
      findMany: async (a: Row) => (s.cs ?? []).filter((c) => (a.where.programId === undefined || c.programId === a.where.programId)
        && (a.where.clientId === undefined || c.clientId === a.where.clientId)
        && (a.where.completedAt?.not !== null || c.completedAt != null)).map((c) => pick(c, a.select)),
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
