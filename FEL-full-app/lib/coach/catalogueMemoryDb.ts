// An in-memory stand-in for the four tables the catalogue touches (MIRROR-COACH P2, 2026-09-25): programExercise,
// exercise (+ exerciseCategory) and sessionExercise. Used by lib/coach/catalogue-routes.test.ts (behind a vi.mock of
// @/lib/db) and by the dev harness app/dev/coach-catalogue, so both run the REAL service and routes with only the
// database replaced — the lane's dev database is offline on purpose.
//
// It enforces what Postgres would, and nothing more:
//   · ProgramExercise's unique key raises P2002 on a byte-equal match. The key is part of the store: ['name'] is the
//     schema as it is (the FEL-wide key; P2 review, 2026-09-26), ['coachId', 'name'] the held swap, so the tests run the
//     routes under both;
//   · deleting a ProgramExercise that a SessionExercise points at raises P2003 (onDelete: Restrict);
//   · updating or deleting a missing row raises P2025.
// Filters understand only what the catalogue code sends: equality, `{ not }`, and the `coachId_name` compound key
// (kept for callers of the held swap; the service itself looks a coach's own row up with findFirst).
// Not for app code — nothing outside the test and the dev harness imports it.

export type Row = Record<string, unknown>;

export interface CatalogueMemoryStore {
  tables: Record<string, Row[]>;
  /** ProgramExercise's unique key: ['coachId', 'name'] is the schema (owner #28); ['name'] is the legacy FEL-wide key. */
  uniqueKey: string[];
  seq: number;
}

export function newCatalogueStore(tables: Record<string, Row[]> = {}): CatalogueMemoryStore {
  return { tables: { programExercise: [], sessionExercise: [], exercise: [], exerciseCategory: [], ...tables }, uniqueKey: ['coachId', 'name'], seq: 0 };
}

const err = (code: string) => Object.assign(new Error(code), { code });

function matches(row: Row, where: Row | undefined): boolean {
  return !where || Object.entries(where).every(([k, c]) => {
    if (k === 'coachId_name') { const cn = c as Row; return row.coachId === cn.coachId && row.name === cn.name; }
    if (c && typeof c === 'object' && !Array.isArray(c) && 'not' in (c as Row)) return row[k] !== (c as Row).not;
    return row[k] === c;
  });
}

const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });

/** A Prisma-shaped object over `store`. Cast it to the client type at the call site; it covers only the catalogue's calls. */
export function catalogueMemoryDb(store: CatalogueMemoryStore) {
  const table = (name: string) => (store.tables[name] ??= []);
  const clash = (rows: Row[], cand: Row, selfId?: unknown) => rows.some((r) => r.id !== selfId && store.uniqueKey.every((k) => r[k] === cand[k]));
  const withCategory = (r: Row, full: boolean): Row => {
    const cat = table('exerciseCategory').find((c) => c.id === r.categoryId);
    return { ...r, category: cat ? (full ? { id: cat.id, name: cat.name } : { name: cat.name }) : null };
  };
  return {
    programExercise: {
      findMany: async (a: Row = {}) => {
        let rows = table('programExercise').filter((r) => matches(r, a.where as Row));
        if ((a.orderBy as Row | undefined)?.name) rows = [...rows].sort((x, y) => String(x.name).localeCompare(String(y.name)));
        return rows.map((r) => pick(r, a.select as Row));
      },
      findUnique: async (a: Row) => { const r = table('programExercise').find((x) => matches(x, a.where as Row)); return r ? pick(r, a.select as Row) : null; },
      findFirst: async (a: Row) => { const r = table('programExercise').find((x) => matches(x, a.where as Row)); return r ? pick(r, a.select as Row) : null; },
      create: async (a: Row) => {
        const data = Object.fromEntries(Object.entries(a.data as Row).filter(([, v]) => v !== undefined));
        if (clash(table('programExercise'), data)) throw err('P2002');
        const now = new Date();
        const row = { id: `pe-${++store.seq}`, createdAt: now, updatedAt: now, commonFaults: null, progressionOfId: null, regressionOfId: null, ...data };
        table('programExercise').push(row);
        return { ...row };
      },
      update: async (a: Row) => {
        const rows = table('programExercise');
        const i = rows.findIndex((x) => matches(x, a.where as Row));
        if (i < 0) throw err('P2025');
        const data = Object.fromEntries(Object.entries(a.data as Row).filter(([, v]) => v !== undefined));
        const next = { ...rows[i], ...data, updatedAt: new Date() };
        if (clash(rows, next, rows[i].id)) throw err('P2002');
        rows[i] = next;
        return { ...next };
      },
      updateMany: async (a: Row) => {
        let count = 0;
        for (const r of table('programExercise')) if (matches(r, a.where as Row)) { Object.assign(r, a.data); count++; }
        return { count };
      },
      delete: async (a: Row) => {
        const rows = table('programExercise');
        const i = rows.findIndex((x) => matches(x, a.where as Row));
        if (i < 0) throw err('P2025');
        if (table('sessionExercise').some((s) => s.exerciseId === rows[i].id)) throw err('P2003');
        return rows.splice(i, 1)[0];
      },
    },
    exercise: {
      findUnique: async (a: Row) => { const r = table('exercise').find((x) => matches(x, a.where as Row)); return r ? withCategory(r, false) : null; },
      findMany: async (a: Row = {}) => table('exercise').filter((x) => matches(x, a.where as Row)).map((r) => withCategory(r, true)),
    },
    exerciseCategory: { findMany: async () => table('exerciseCategory').map((c) => ({ ...c })) },
    sessionExercise: { count: async (a: Row) => table('sessionExercise').filter((x) => matches(x, a.where as Row)).length },
  };
}
