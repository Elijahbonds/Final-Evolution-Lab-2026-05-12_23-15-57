// lib/data-rights/rights.ts — DATA-RIGHTS-SWEEP (2026-10-25): the account export and the account erase, driven by the
// registry (./registry.ts), so a table is covered the moment it is classified there.
//
// RAW SQL, ONE PATH. Half the tables are pending SQL with no Prisma model (and public/_prisma/client is a committed
// artifact nobody regenerates for them), so every statement here is raw, through the RawDb the coach features use
// (lib/coach/pendingSchema.ts). Identifiers come only from the registry and are checked against /^\w+$/; the account id
// is always the one bound parameter ($1). Nothing from a request reaches SQL text.
//
// PENDING TABLES. The features probe information_schema once and cache it (pendingProbe). An export or an erase reads
// it FRESH, inside the same transaction: an erase that skipped a table applied five minutes ago, on a cached "no", would
// leave that table's rows behind. A table (or a column a statement names) that is not there yet is skipped quietly and
// listed in `notYetCreated`, so the operator sees what was not touched.

import type { RawDb } from '@/lib/coach/pendingSchema';
import { REGISTRY, PRQ_MOVEMENT, type Erase, type Subject, type TableRights } from './registry';

const IDENT = /^\w+$/;
const q = (name: string): string => {
  if (!IDENT.test(name)) throw new Error(`data-rights: bad identifier ${name}`);
  return `"${name}"`;
};

/** Every table and its columns in the current schema. Read fresh (see the header). */
export async function presentSchema(db: RawDb): Promise<Map<string, Set<string>>> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = out.get(r.table_name);
    if (!s) { s = new Set(); out.set(r.table_name, s); }
    s.add(r.column_name);
  }
  return out;
}

/** Does `db` carry the raw calls? A real Prisma client and transaction always do; some test stand-ins do not. */
export function hasRaw(db: unknown): db is RawDb {
  const d = db as Partial<RawDb> | null;
  return !!d && typeof d.$queryRawUnsafe === 'function' && typeof d.$executeRawUnsafe === 'function';
}

const whereOf = (s: Subject): string => s.where ?? `${q(s.col)} = $1`;

function subjectReady(schema: Map<string, Set<string>>, table: string, s: Subject): boolean {
  const cols = schema.get(table);
  if (!cols) return false;
  if (!s.where && !cols.has(s.col)) return false;
  return (s.needs ?? []).every((t) => schema.has(t));
}

type Row = Record<string, unknown>;

/** JSON-safe: BIGINT columns come back as bigint, which JSON.stringify refuses. */
function plain(row: Row, omit: Set<string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (omit.has(k)) continue;
    out[k] = typeof v === 'bigint' ? v.toString() : v;
  }
  return out;
}

export interface CollectedTables {
  /** Rows per table (and per child table), only tables with at least one row. */
  tables: Record<string, Row[]>;
  /** Registry tables that are not in this database yet (pending SQL not applied). */
  notYetCreated: string[];
}

/**
 * The rows of every registry table the person is a subject of. `only` limits it to some tables (the PRQ export);
 * otherwise tables already exported under a legacy key (`exportedAs`) are left to that key.
 */
export async function collectTables(db: RawDb, userId: string, opts: { only?: string[] } = {}): Promise<CollectedTables> {
  const schema = await presentSchema(db);
  const tables: Record<string, Row[]> = {};
  const notYetCreated: string[] = [];
  const names = opts.only ?? Object.keys(REGISTRY).filter((t) => !REGISTRY[t].exportedAs);
  for (const table of names) {
    const rights: TableRights = REGISTRY[table];
    if (!schema.has(table)) { notYetCreated.push(table); continue; }
    const omit = new Set(rights.omit ?? []);
    const byKey = new Map<string, Row>();
    for (const s of rights.subjects) {
      if (s.export !== true || !subjectReady(schema, table, s)) continue;
      const rows = await db.$queryRawUnsafe<Row[]>(`SELECT * FROM ${q(table)} WHERE ${whereOf(s)}`, userId);
      const subjectOmit = new Set([...omit, ...(s.exportOmit ?? [])]);
      for (const r of rows) {
        const key = 'id' in r ? String(r.id) : JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
        const row = plain(r, subjectOmit);
        const prior = byKey.get(key);
        // the same row under two subjects keeps the stricter (fewer columns) version
        if (!prior || Object.keys(row).length < Object.keys(prior).length) byKey.set(key, row);
      }
    }
    if (byKey.size) tables[table] = [...byKey.values()];
    for (const child of rights.children ?? []) {
      if (!schema.has(child.table) || !(child.needs ?? []).every((t) => schema.has(t))) continue;
      const rows = await db.$queryRawUnsafe<Row[]>(child.sql, userId);
      if (rows.length) tables[child.table] = rows.map((r) => plain(r, new Set()));
    }
  }
  return { tables, notYetCreated };
}

// ── erase ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type EraseAction = 'delete' | 'nullify' | 'scrub' | 'keep' | 'tombstone';

export interface EraseLine {
  table: string;
  /** The subject column (or the condition's column). */
  col: string;
  action: EraseAction;
  /** Rows deleted / updated, or (keep, dry run) rows that match. */
  rows: number;
}

export interface AccountErasure {
  dryRun: boolean;
  lines: EraseLine[];
  notYetCreated: string[];
}

/**
 * The tombstone the `User` row becomes. Kept: id (everything kept points at it), createdAt, kycStatus/kycVerifiedAt
 * (whether a paid-play identity check passed — a compliance fact, no identity), selfExcludedAt (a self-exclusion is not
 * lifted by erasing), policyVersion/policyAcceptedAt (proof of what was agreed). Everything that names, reaches, or signs
 * in as the person goes: an empty password refuses every sign-in (lib/auth.ts `if (!user?.password) return null`).
 */
export const TOMBSTONE: Scrub = {
  email: `'erased-' || "id" || '@erased.invalid'`,
  name: 'NULL',
  password: `''`,
  role: `'player'`,
  dobYear: 'NULL',
  dob: 'NULL',             // pending column (prisma/pending/2026-10-19-user-dob.sql): set only when it exists
  declaredState: 'NULL',
  kycProvider: 'NULL',
};
type Scrub = Record<string, string>;

function kind(e: Erase): EraseAction {
  return typeof e === 'string' ? e : 'scrub';
}

/** Phase order: scrub and nullify (rows that stay), then deletes (registry order), then the tombstone. */
const PHASE: Record<EraseAction, number> = { keep: 0, scrub: 1, nullify: 1, delete: 2, tombstone: 3 };

interface Planned { table: string; s: Subject; action: EraseAction }

/** Every erase statement the registry implies, in execution order. Exported for the guard. */
export function erasePlan(): Planned[] {
  const out: Planned[] = [];
  for (const [table, rights] of Object.entries(REGISTRY)) {
    for (const s of rights.subjects) out.push({ table, s, action: kind(s.erase) });
  }
  return out.sort((a, b) => PHASE[a.action] - PHASE[b.action]);
}

function setClause(scrub: Scrub, cols: Set<string>): string | null {
  const parts = Object.entries(scrub).filter(([c]) => cols.has(c)).map(([c, expr]) => `${q(c)} = ${expr}`);
  return parts.length ? parts.join(', ') : null;
}

async function count(db: RawDb, table: string, where: string, userId: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT count(*) AS n FROM ${q(table)} WHERE ${where}`, userId);
  return Number(rows[0]?.n ?? 0);
}

async function run(db: RawDb, p: Planned, schema: Map<string, Set<string>>, userId: string, dryRun: boolean): Promise<EraseLine | null> {
  const { table, s, action } = p;
  if (!subjectReady(schema, table, s)) return null;
  const cols = schema.get(table)!;
  const where = whereOf(s);
  const line = (rows: number): EraseLine => ({ table, col: s.col, action, rows });
  if (action === 'keep' || dryRun) return line(await count(db, table, where, userId));
  if (action === 'delete') return line(await db.$executeRawUnsafe(`DELETE FROM ${q(table)} WHERE ${where}`, userId));
  if (action === 'nullify') return line(await db.$executeRawUnsafe(`UPDATE ${q(table)} SET ${q(s.col)} = NULL WHERE ${where}`, userId));
  const set = setClause(action === 'tombstone' ? TOMBSTONE : (s.erase as { scrub: Scrub }).scrub, cols);
  if (!set) return line(0);
  return line(await db.$executeRawUnsafe(`UPDATE ${q(table)} SET ${set} WHERE ${where}`, userId));
}

/**
 * Erase an account, every table the registry names. Pass a TRANSACTION client: all of it goes together or not at all.
 * `dryRun` counts what each statement would touch and changes nothing. Idempotent: a second run deletes nothing.
 * The account erase has no in-app route (Privacy §4: account deletion is by email); scripts/erase-account.ts runs it.
 */
export async function eraseAccount(db: RawDb, userId: string, opts: { dryRun?: boolean } = {}): Promise<AccountErasure> {
  const dryRun = opts.dryRun ?? false;
  const schema = await presentSchema(db);
  const lines: EraseLine[] = [];
  for (const p of erasePlan()) {
    const l = await run(db, p, schema, userId, dryRun);
    if (l) lines.push(l);
  }
  const notYetCreated = Object.keys(REGISTRY).filter((t) => !schema.has(t));
  return { dryRun, lines, notYetCreated };
}

/** Counts only, for a ledger line or a log: never an id, a name or a row. */
export function erasureSummary(e: AccountErasure): string {
  const by = (a: EraseAction) => e.lines.filter((l) => l.action === a).reduce((n, l) => n + l.rows, 0);
  return `Account erasure: ${by('delete')} rows deleted, ${by('scrub') + by('nullify')} rows anonymised, `
    + `${by('keep')} rows kept under retention rules`;
}

// ── the PRQ + movement history additions (lib/prq-data-rights.ts) ────────────────────────────────────────────────────

/** The pending movement tables' rows for the PRQ export: `[]` when the table is not there yet. */
export async function collectPrqMovement(db: RawDb, userId: string): Promise<Record<(typeof PRQ_MOVEMENT)[number]['key'], Row[]>> {
  const schema = await presentSchema(db);
  const out = { readinessJumpChecks: [] as Row[], formReviews: [] as Row[] };
  for (const m of PRQ_MOVEMENT) {
    if (!schema.get(m.table)?.has(m.col)) continue;
    const omit = new Set(REGISTRY[m.table].omit ?? []);
    const rows = await db.$queryRawUnsafe<Row[]>(`SELECT * FROM ${q(m.table)} WHERE ${q(m.col)} = $1 ORDER BY "createdAt" DESC`, userId);
    out[m.key] = rows.map((r) => plain(r, omit));
  }
  return out;
}

/** Delete the pending movement tables' rows for the PRQ erase. A table that is not there yet is skipped (count 0). */
export async function erasePrqMovement(db: RawDb, userId: string): Promise<Record<(typeof PRQ_MOVEMENT)[number]['key'], number>> {
  const schema = await presentSchema(db);
  const out = { readinessJumpChecks: 0, formReviews: 0 };
  for (const m of PRQ_MOVEMENT) {
    if (!schema.get(m.table)?.has(m.col)) continue;
    out[m.key] = await db.$executeRawUnsafe(`DELETE FROM ${q(m.table)} WHERE ${q(m.col)} = $1`, userId);
  }
  return out;
}

// ── the erasure event on the ledger ──────────────────────────────────────────────────────────────────────────────────

/**
 * Record an erasure as a CreditLedger event row: amount 0, counts only, the wallet untouched. NOT postLc: postLc mirrors
 * every row into the double-entry ledger, and postTransaction refuses a zero posting ('Posting amount must be
 * non-zero', lib/ledger.ts) AFTER the CreditLedger row is written. Measured on a real Postgres (DATA-RIGHTS-SWEEP,
 * 2026-10-25): /api/prq/delete called postLc with amount 0 after its erase had committed, so every real PRQ delete erased
 * the data, left the event row and answered 500. A zero event moves no money, so it has no double-entry side.
 */
export async function recordErasureEvent(
  db: { creditLedger: { create(args: { data: { userId: string; amount: number; reason: string; balanceAfter: number; dedupeKey: string } }): Promise<unknown> } },
  e: { userId: string; reason: string; balanceAfter: number; dedupeKey: string },
): Promise<void> {
  await db.creditLedger.create({ data: { userId: e.userId, amount: 0, reason: e.reason, balanceAfter: e.balanceAfter, dedupeKey: e.dedupeKey } });
}
