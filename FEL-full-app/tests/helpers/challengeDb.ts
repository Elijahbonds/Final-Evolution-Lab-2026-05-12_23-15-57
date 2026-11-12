// CHALLENGES-2 test support: an in-memory stand-in for the slice of Prisma the challenge, guest, referral and wallet code
// call, faithful where the tests lean on it:
//   · unique columns (ChallengeLink.code, ReferralConversion.referredUserId, ReferralCode.userId/code, Wallet.playerId,
//     WalletLedgerEntry.idempotencyKey) refuse a duplicate with Prisma's P2002, the way Postgres's unique index does;
//   · `$transaction(fn)` is all-or-nothing: its writes are staged and land only when `fn` resolves. A unique key another
//     transaction COMMITTED first fails this one, at the insert if it was already there, else at commit (the blocked insert
//     Postgres would release with a unique violation). A failed transaction leaves no trace: balances included;
//   · `barrier(n)` holds every transaction at its start until n have started, so n concurrent requests all read the
//     ledger before any of them writes: the worst interleaving, on purpose.
// Jsonb columns round-trip through JSON like Postgres's. Where clauses: equality, `in`, gte/gt/lt/lte, and `is` / nested
// relation filters are not modelled (no caller here needs them).

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const UNIQUE: Record<string, string[]> = {
  challengeLink: ['code'],
  referralConversion: ['referredUserId'],
  referralCode: ['userId', 'code'],
  wallet: ['playerId'],
  walletLedgerEntry: ['idempotencyKey'],
  guestSession: ['token'],
  user: ['email'],
  scanSaveOptIn: ['userId'],
};
const JSON_COLS = new Set(['payload', 'data', 'metadata', 'metrics', 'faultCounts']);

export class UniqueError extends Error {
  code = 'P2002';
  constructor(model: string, col: string) { super(`Unique constraint failed on ${model}.${col}`); this.name = 'PrismaClientKnownRequestError'; }
}

let seq = 0;
const id = (p: string) => `${p}_${(++seq).toString(36)}`;
const clone = <T,>(v: T): T => (v === undefined || v === null ? v : structuredClone(v));
/** A jsonb column comes back as JSON parses it (no Date, no undefined, -0 → 0). */
const jsonb = (v: unknown) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : typeof a === 'bigint' ? Number(a) : (a as number);
  const bv = b instanceof Date ? b.getTime() : typeof b === 'bigint' ? Number(b) : (b as number);
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** jsonb `@>`: every element of `want` is contained in some element of `have` (objects: a subset of keys). */
function contains(have: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return Array.isArray(have) && want.every((w) => have.some((x) => contains(x, w)));
  if (want && typeof want === 'object') return !!have && typeof have === 'object' && Object.entries(want).every(([k, w]) => contains((have as Row)[k], w));
  return have === want;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') { if (!(cond as Row[]).some((c) => matches(row, c))) return false; continue; }
    const v = row[k];
    if (cond && typeof cond === 'object' && 'path' in cond && 'array_contains' in cond) {
      let at: unknown = v;
      for (const p of (cond as Row).path as string[]) at = at && typeof at === 'object' ? (at as Row)[p] : undefined;
      if (!contains(at, (cond as Row).array_contains)) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && 'not' in cond && Object.keys(cond).length === 1) { if (v === (cond as Row).not || (v == null && (cond as Row).not == null)) return false; continue; }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('gte' in c && !(v != null && cmp(v, c.gte) >= 0)) return false;
      if ('gt' in c && !(v != null && cmp(v, c.gt) > 0)) return false;
      if ('lt' in c && !(v != null && cmp(v, c.lt) < 0)) return false;
      if ('lte' in c && !(v != null && cmp(v, c.lte) <= 0)) return false;
      if ('equals' in c && v !== c.equals) return false;
    } else if (cond instanceof Date) {
      if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row): Row {
  const out = { ...row };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
      const cur = out[k] ?? 0;
      out[k] = typeof cur === 'bigint' ? cur + BigInt(v.increment as bigint) : (cur as number) + Number(v.increment);
    } else {
      out[k] = JSON_COLS.has(k) ? jsonb(v) : v;
    }
  }
  return out;
}

const DEFAULTS: Record<string, () => Row> = {
  challengeLink: () => ({ opened: 0, attempted: 0, beaten: 0, signups: 0, createdAt: new Date(), ownerUserId: null, display: null }),
  guestSession: () => ({ migratedUserId: null, createdAt: new Date(), lastSeenAt: new Date(), data: null }),
  user: () => ({ createdAt: new Date(), dobYear: null, name: null, role: 'player' }),
  referralCode: () => ({ clicks: 0, signups: 0, createdAt: new Date() }),
  referralConversion: () => ({ shardsAwarded: 0, createdAt: new Date() }),
  wallet: () => ({ coins: BigInt(0), shards: BigInt(0), lc: BigInt(0), version: BigInt(0), createdAt: new Date(), updatedAt: new Date() }),
  walletLedgerEntry: () => ({ createdAt: new Date(), metadata: null }),
};

export interface ChallengeDb {
  tables: Tables;
  /** Every call, `model.method`, in order. */
  log: string[];
  barrier(n: number): void;
  [model: string]: any;
}

export function challengeDb(): ChallengeDb {
  const tables: Tables = {};
  const log: string[] = [];
  let barrierN = 0;
  let waiting: (() => void)[] = [];

  const t = (m: string) => (tables[m] ??= []);

  function checkUnique(model: string, row: Row, against: Row[], skip?: Row) {
    for (const col of UNIQUE[model] ?? []) {
      if (row[col] == null) continue;
      if (against.some((r) => r !== skip && r[col] === row[col])) throw new UniqueError(model, col);
    }
  }

  // A view over the tables. `stage` (inside a transaction) holds its copies; reads see committed rows overlaid by them.
  function model(name: string, stage: { rows: Map<string, Row[]>; inserted: Array<[string, Row]> } | null) {
    const rows = (): Row[] => (stage ? (stage.rows.get(name) ?? (stage.rows.set(name, t(name).map((r) => ({ ...r }))), stage.rows.get(name)!)) : t(name));
    const tick = () => new Promise<void>((r) => setImmediate(r));
    const pick = (r: Row | undefined) => (r ? clone(r) : null);
    return {
      async findUnique({ where }: { where: Row }) { log.push(`${name}.findUnique`); await tick(); return pick(rows().find((r) => matches(r, where))); },
      async findFirst({ where }: { where?: Row } = {}) { log.push(`${name}.findFirst`); await tick(); return pick(rows().find((r) => matches(r, where))); },
      async findMany({ where, orderBy, take }: { where?: Row; orderBy?: Row; take?: number } = {}) {
        log.push(`${name}.findMany`); await tick();
        let out = rows().filter((r) => matches(r, where));
        if (orderBy) { const [[k, dir]] = Object.entries(orderBy); out = [...out].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[k], b[k])); }
        return (take ? out.slice(0, take) : out).map((r) => clone(r));
      },
      async count({ where }: { where?: Row } = {}) { await tick(); return rows().filter((r) => matches(r, where)).length; },
      async create({ data }: { data: Row }) {
        log.push(`${name}.create`); await tick();
        const row = applyData({ id: id(name), ...(DEFAULTS[name]?.() ?? {}) }, data);
        checkUnique(name, row, rows());
        if (stage) checkUnique(name, row, t(name)); // another transaction committed this key first
        rows().push(row);
        if (stage) stage.inserted.push([name, row]);
        return clone(row);
      },
      async update({ where, data }: { where: Row; data: Row }) {
        log.push(`${name}.update`); await tick();
        const list = rows();
        const i = list.findIndex((r) => matches(r, where));
        if (i < 0) throw Object.assign(new Error(`${name} not found`), { code: 'P2025' });
        list[i] = applyData(list[i], data);
        return clone(list[i]);
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        log.push(`${name}.updateMany`); await tick();
        const list = rows();
        let count = 0;
        for (let i = 0; i < list.length; i++) if (matches(list[i], where)) { list[i] = applyData(list[i], data); count++; }
        return { count };
      },
      async deleteMany({ where }: { where?: Row } = {}) {
        const list = rows(); const keep = list.filter((r) => !matches(r, where)); const n = list.length - keep.length;
        list.length = 0; list.push(...keep); return { count: n };
      },
    };
  }

  const MODELS = ['challengeLink', 'guestSession', 'user', 'playerProfile', 'referralCode', 'referralConversion', 'gameSession',
    'mirrorSession', 'workoutScan', 'scanSaveOptIn', 'wallet', 'walletLedgerEntry', 'rewardRule', 'analyticsEvent', 'marketingLead', 'creditLedger'];

  const db: ChallengeDb = {
    tables, log,
    barrier(n: number) { barrierN = n; waiting = []; },
    async $queryRawUnsafe() { return []; },   // every pending-column probe answers "not applied yet"
    async $executeRawUnsafe() { return 0; },
    async $transaction(fn: (tx: any) => Promise<unknown>) {
      if (barrierN > 1) {
        await new Promise<void>((resolve) => { waiting.push(resolve); if (waiting.length >= barrierN) { waiting.forEach((w) => w()); barrierN = 0; } });
      }
      // snapshot every table at the start (READ COMMITTED is close enough here: nothing re-reads a row it wrote)
      const atStart = new Map(MODELS.map((m) => [m, t(m).map((r) => ({ ...r }))]));
      const stage = { rows: new Map(MODELS.map((m) => [m, atStart.get(m)!.map((r) => ({ ...r }))])), inserted: [] as Array<[string, Row]> };
      const tx: Row = {};
      for (const m of MODELS) tx[m] = model(m, stage);
      const out = await fn(tx);
      // commit: a unique key someone else committed since this began fails the whole transaction, nothing lands
      for (const [m, row] of stage.inserted) checkUnique(m, row, t(m));
      for (const [m, staged] of stage.rows) {
        const committed = t(m);
        const base = new Map(atStart.get(m)!.map((r) => [r.id, r]));
        for (const r of staged) {
          const i = committed.findIndex((c) => c.id === r.id);
          const b = base.get(r.id);
          if (i < 0) { if (!b) committed.push(r); continue; }
          // a column this transaction changed takes its value; a bigint counter takes this transaction's delta on top of
          // whatever others committed meanwhile (an atomic `increment`, as Postgres applies it)
          const merged: Row = { ...committed[i] };
          for (const k of Object.keys(r)) {
            if (!b) continue;
            if (typeof r[k] === 'bigint' && typeof b[k] === 'bigint') merged[k] = (merged[k] as bigint) + ((r[k] as bigint) - (b[k] as bigint));
            else if (r[k] !== b[k]) merged[k] = r[k];
          }
          committed[i] = merged;
        }
      }
      return out;
    },
  };
  for (const m of MODELS) db[m] = model(m, null);
  return db;
}
