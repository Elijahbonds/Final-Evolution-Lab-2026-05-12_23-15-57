// Test-only (TEEN-WRITE-BLOCK, 2026-09-29): a stand-in Prisma client that RECORDS every call, so a route test can say
// "zero writes" and mean it. Every create/createMany/update/updateMany/upsert/delete/deleteMany, every $transaction and
// every $executeRaw* is a write here, whether or not it would have changed a row. Reads work over in-memory tables with
// just enough of Prisma's `where` (equality, null, not, gte/gt/lte/lt, in), orderBy, take and select for the routes under
// test. Used by lib/privacy/*.test.ts and lib/health/health-adults-only-*.test.ts; imported by nothing that ships (it lives
// under tests/ so lib/nav/modules.test.ts, which walks lib/ for modules nothing imports, does not count it).

export type Row = Record<string, any>;

export interface SpyCall {
  op: string;
  args: unknown;
}

export interface SpyDb {
  tables: Record<string, Row[]>;
  calls: SpyCall[];
}

const WRITE_OP = /^(\$transaction|\$executeRaw\w*|\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany))$/;

export function newSpyDb(tables: Record<string, Row[]> = {}): SpyDb {
  return { tables, calls: [] };
}

/** Every write the fake client saw, as 'model.method' (or '$transaction'), in order. */
export function writesOf(db: SpyDb): string[] {
  return db.calls.map((c) => c.op).filter((op) => WRITE_OP.test(op));
}

/** The arguments of each call to one op, in order. */
export function argsOf(db: SpyDb, op: string): any[] {
  return db.calls.filter((c) => c.op === op).map((c) => c.args);
}

/** Every call on one model ('guardianConsent', 'user', …), reads included. */
export function callsOn(db: SpyDb, model: string): string[] {
  return db.calls.map((c) => c.op).filter((op) => op.startsWith(`${model}.`));
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return same(v, cond);
    const c = cond as Row;
    // a compound unique key (e.g. userId_date: { userId, date }) holds plain fields, not operators
    if (!Object.keys(c).some((op) => ['not', 'gte', 'gt', 'lte', 'lt', 'in'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : same(v, c.not))) return false;
    if ('gte' in c && !(v != null && v >= c.gte)) return false;
    if ('gt' in c && !(v != null && v > c.gt)) return false;
    if ('lte' in c && !(v != null && v <= c.lte)) return false;
    if ('lt' in c && !(v != null && v < c.lt)) return false;
    if ('in' in c && !(c.in as unknown[]).some((x) => same(v, x))) return false;
    return true;
  });
}

function ordered(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o));
  if (!keys.length) return rows;
  return [...rows].sort((x, y) => {
    for (const [k, dir] of keys) {
      const a = x[k] instanceof Date ? x[k].getTime() : x[k];
      const b = y[k] instanceof Date ? y[k].getTime() : y[k];
      if (a === b) continue;
      return (a < b ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

const pick = (row: Row | null, select?: Row) =>
  row && select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 8, 29, 12, 0, 0) + ++clock * 1000);

function table(db: SpyDb, model: string) {
  const rows = () => (db.tables[model] ??= []);
  const found = (a: Row = {}) => {
    let r = ordered(rows().filter((x) => matches(x, a.where)), a.orderBy);
    if (typeof a.take === 'number') r = r.slice(0, a.take);
    return r;
  };
  const make = (data: Row) => {
    const row: Row = { id: data.id ?? `${model}-${rows().length + 1}`, createdAt: stamp(), ...data };
    rows().push(row);
    return row;
  };
  const ops: Record<string, (a?: any) => Promise<unknown>> = {
    findUnique: async (a: Row = {}) => pick(found(a)[0] ?? null, a.select),
    findFirst: async (a: Row = {}) => pick(found(a)[0] ?? null, a.select),
    findMany: async (a: Row = {}) => found(a).map((r) => pick(r, a.select)),
    count: async (a: Row = {}) => found(a).length,
    create: async (a: Row) => pick(make({ ...a.data }), a.select),
    createMany: async (a: Row) => ({ count: (a.data as Row[]).map((d) => make({ ...d })).length }),
    update: async (a: Row) => {
      const row = found({ where: a.where })[0];
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      return pick(Object.assign(row, a.data), a.select);
    },
    updateMany: async (a: Row) => {
      const hit = found({ where: a.where });
      for (const r of hit) Object.assign(r, a.data);
      return { count: hit.length };
    },
    upsert: async (a: Row) => {
      const row = found({ where: a.where })[0];
      return pick(row ? Object.assign(row, a.update) : make({ ...a.create }), a.select);
    },
    delete: async (a: Row) => {
      const row = found({ where: a.where })[0];
      if (!row) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
      db.tables[model] = rows().filter((r) => r !== row);
      return row;
    },
    deleteMany: async (a: Row = {}) => {
      const before = rows().length;
      db.tables[model] = rows().filter((r) => !matches(r, a.where));
      return { count: before - db.tables[model].length };
    },
  };
  return new Proxy(ops, {
    get: (t, method) => {
      if (typeof method === 'symbol' || method === 'then') return undefined;
      if (!(method in t)) throw new Error(`the write-spy client has no ${model}.${method}`);
      return (a?: unknown) => {
        db.calls.push({ op: `${model}.${method}`, args: a });
        return t[method](a);
      };
    },
  });
}

/** A Prisma-shaped client over `db`. Pass it where a route's `prisma` (or a transaction client) goes. */
export function spyPrisma(db: SpyDb): any {
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') {
        return async (arg: unknown) => {
          db.calls.push({ op: '$transaction', args: typeof arg === 'function' ? 'callback' : 'array' });
          return typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]);
        };
      }
      if (String(prop).startsWith('$executeRaw')) {
        return async (...a: unknown[]) => { db.calls.push({ op: String(prop), args: a }); return 0; };
      }
      return table(db, String(prop));
    },
  });
  return client;
}

// ── the age cases (TEEN-WRITE-BLOCK brief, item 4) ─────────────────────────────────────────────────────────────────────

export const THIS_YEAR = new Date().getFullYear();

/** A user row as the gate reads it. The email is here so a test can prove no log line carries it. */
export function seedUser(db: SpyDb, id: string, dobYear: number | null) {
  (db.tables.user ??= []).push({ id, email: `${id}@fel.test`, dobYear });
}

/** An ACCEPTED, unrevoked GuardianConsent naming this user as the mentee — the parent's yes the old paths honoured. */
export function seedAcceptedGuardian(db: SpyDb, menteeId: string, menteeBirthYear: number) {
  (db.tables.guardianConsent ??= []).push({
    id: `gc-${menteeId}`, menteeId, guardianName: 'A Parent', guardianEmail: 'parent@fel.test', menteeBirthYear,
    token: `tok-${menteeId}`, requestedAt: new Date('2026-09-01T00:00:00Z'), acceptedAt: new Date('2026-09-02T00:00:00Z'),
    revokedAt: null, selfRequested: false, acceptedById: null,
  });
}

export interface AgeCase {
  id: string;
  /** The birth year seeded, for the "no year in the log" check (null for unknown and the missing row). */
  dobYear: number | null;
  seed: (db: SpyDb, userId: string) => void;
}

const withYear = (id: string, dobYear: number | null, guardian = false): AgeCase => ({
  id, dobYear,
  seed: (db, userId) => {
    seedUser(db, userId, dobYear);
    if (guardian && dobYear != null) seedAcceptedGuardian(db, userId, dobYear);
  },
});

/** Every account a movement save refuses: unknown, no row, 12, 15, 17 with a parent's yes, exactly 18 by year, and an adult who has not opted in. */
export const REFUSED_SCAN_CASES: readonly AgeCase[] = [
  withYear('unknown age (dobYear null)', null),
  { id: 'no user row', dobYear: null, seed: () => {} },
  withYear('12', THIS_YEAR - 12),
  withYear('15', THIS_YEAR - 15),
  withYear('17 with an accepted GuardianConsent', THIS_YEAR - 17, true),
  withYear('18 by year (may still be 17)', THIS_YEAR - 18),
  withYear('18+ not opted in (1990)', 1990),
];

/** The one account a movement save lets through — with lib/privacy/scanSaveOptIn vi.mocked to true. */
export const OPTED_IN_ADULT: AgeCase = withYear('18+ opted in (1990, opt-in mocked true)', 1990);

/** The four health-write users (FE PM 19:19 PT): the first three are refused, the adult writes as before. */
export const HEALTH_REFUSED_CASES: readonly AgeCase[] = [
  withYear('unknown age (dobYear null)', null),
  withYear('15', THIS_YEAR - 15),
  withYear('17 with an accepted GuardianConsent', THIS_YEAR - 17, true),
];
export const HEALTH_ADULT: AgeCase = withYear('adult (1990)', 1990);
