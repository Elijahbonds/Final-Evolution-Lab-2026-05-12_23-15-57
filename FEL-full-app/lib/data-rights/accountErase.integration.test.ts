// DATA-RIGHTS-SWEEP: the account export and erase against a REAL Postgres holding every table — prisma/schema.prisma
// plus every prisma/pending/*.sql, built by tests/helpers/prismaDdl.ts on an empty database.
//
// Opt-in and local-only, like the other *.integration.test.ts files: it runs when DATA_RIGHTS_IT=1 and DATABASE_URL
// points at a database on 127.0.0.1 / localhost whose name contains "throwaway", and is skipped everywhere else, CI
// included. It builds the schema itself when the database is empty.
//
// What the stand-in in ./rights.test.ts cannot show, this does: every statement the registry implies is valid SQL on
// the real tables; the foreign keys (Cascade, Restrict, SetNull) let the erase through in its phase order; every
// classified row is really deleted, nulled, scrubbed or kept — and a bystander's rows in the same tables are untouched.
// The seeder is generic: for each table and each subject it inserts one row whose subject column is the victim (and one
// for the bystander), creating whatever parent rows the foreign keys need, so a table added to the registry is
// exercised here without writing a fixture for it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { REGISTRY } from './registry';
import { collectTables, eraseAccount, TOMBSTONE } from './rights';
import { buildSchema } from '@/tests/helpers/prismaDdl';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_THROWAWAY = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/\w*throwaway\w*(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.DATA_RIGHTS_IT === '1' && LOCAL_THROWAWAY;
const ROOT = join(__dirname, '../..');

type Row = Record<string, unknown>;
let prisma: any;
const TAG = `dr${Date.now().toString(36)}`;
const VICTIM = `${TAG}-victim`;
const BYSTANDER = `${TAG}-bystander`;

interface Col { name: string; type: string; udt: string; nullable: boolean; hasDefault: boolean }
const cols = new Map<string, Col[]>();
const fks = new Map<string, { cols: string[]; ref: string; refCols: string[] }[]>();
const enumFirst = new Map<string, string>();
let seq = 0;

async function loadCatalog() {
  const c = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY ordinal_position`);
  for (const r of c as any[]) {
    const list = cols.get(r.table_name) ?? [];
    list.push({ name: r.column_name, type: r.data_type, udt: r.udt_name, nullable: r.is_nullable === 'YES', hasDefault: r.column_default != null });
    cols.set(r.table_name, list);
  }
  const f = await prisma.$queryRawUnsafe(`
    SELECT c.conrelid::regclass::text AS t, c.confrelid::regclass::text AS ref,
           ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS cols,
           ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS refcols
      FROM pg_constraint c WHERE c.contype = 'f'`);
  for (const r of f as any[]) {
    const t = String(r.t).replace(/"/g, '');
    const list = fks.get(t) ?? [];
    list.push({ cols: r.cols, ref: String(r.ref).replace(/"/g, ''), refCols: r.refcols });
    fks.set(t, list);
  }
  for (const r of await prisma.$queryRawUnsafe(`SELECT t.typname, min(e.enumlabel) AS label FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`) as any[]) {
    enumFirst.set(r.typname, r.label);
  }
}

const lit = (v: unknown, c: Col): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v).replace(/'/g, "''");
  return c.type === 'USER-DEFINED' ? `'${s}'::"${c.udt}"` : `'${s}'`;
};

function dummy(c: Col): unknown {
  seq += 1;
  switch (c.type) {
    case 'text': case 'character varying': return `${TAG}-${c.name}-${seq}`;
    case 'integer': case 'bigint': case 'smallint': return seq;
    case 'double precision': case 'numeric': case 'real': return 1.5;
    case 'boolean': return false;
    case 'timestamp without time zone': case 'timestamp with time zone': return new Date(Date.UTC(2026, 9, 1, 0, 0, seq % 60)).toISOString();
    case 'date': return '2000-01-01';
    case 'jsonb': case 'json': return '{}';
    case 'ARRAY': return '{}';
    case 'USER-DEFINED': return enumFirst.get(c.udt);
    default: throw new Error(`seed: no dummy for ${c.type}`);
  }
}

async function freshUser(): Promise<string> {
  const id = `${TAG}-u${++seq}`;
  await makeRow('User', { id, email: `${id}@fel.test` });
  return id;
}

/** Is `col` a foreign key to some table other than User (a profile id, not an account id)? */
const profileFk = (table: string, col: string) => (fks.get(table) ?? []).some((f) => f.ref !== 'User' && f.cols.length === 1 && f.cols[0] === col);

/** Insert one row into `table`, filling every NOT NULL column without a default and creating required parents. */
async function makeRow(table: string, over: Row = {}): Promise<Row> {
  const tcols = cols.get(table);
  if (!tcols) throw new Error(`seed: no table ${table}`);
  const row: Row = { ...over };
  for (const fk of fks.get(table) ?? []) {
    if (fk.ref === 'User' && fk.cols.length === 1 && !(fk.cols[0] in row)) {
      // a person the row needs but the test is not about: a fresh account each time, so a one-per-user table never collides
      const col = tcols.find((c) => c.name === fk.cols[0])!;
      if (!col.nullable) row[fk.cols[0]] = await freshUser();
      continue;
    }
    const required = fk.cols.some((c) => !tcols.find((x) => x.name === c)!.nullable);
    const given = fk.cols.filter((c) => c in row);
    if (!required && given.length === 0) continue;
    if (given.length === fk.cols.length && fk.cols.length === 1) continue;   // caller chose the parent
    const parentOver: Row = {};
    fk.cols.forEach((c, i) => { if (c in row) parentOver[fk.refCols[i]] = row[c]; });
    const parent = await makeRow(fk.ref, parentOver);
    fk.cols.forEach((c, i) => { row[c] = parent[fk.refCols[i]]; });
  }
  for (const c of tcols) {
    if (c.name in row) continue;
    if (!c.nullable && !c.hasDefault) row[c.name] = dummy(c);
  }
  const names = Object.keys(row);
  const values = names.map((n) => lit(row[n], tcols.find((c) => c.name === n)!));
  await prisma.$executeRawUnsafe(`INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING`);
  return row;
}

/** Every seeded row, to look up after the erase: table, subject, whose, and the row's key columns. */
const seeded: { table: string; col: string; who: string; key: Row }[] = [];

async function keyOf(table: string, row: Row): Promise<Row> {
  const tcols = cols.get(table)!;
  if (tcols.some((c) => c.name === 'id') && row.id != null) return { id: row.id };
  const pk = await prisma.$queryRawUnsafe(`SELECT a.attname AS n FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '"${table}"'::regclass AND i.indisprimary`);
  return Object.fromEntries((pk as any[]).map((p) => [p.n, row[p.n]]));
}

async function find(table: string, key: Row): Promise<Row | null> {
  const names = Object.keys(key);
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE ${names.map((n, i) => `"${n}" = $${i + 1}`).join(' AND ')}`, ...names.map((n) => key[n]));
  return (rows as Row[])[0] ?? null;
}

describe.skipIf(!RUN)('account export and erase on a real Postgres with every pending table applied', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    const has = await prisma.$queryRawUnsafe(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'User'`);
    if (!(has as unknown[]).length) await buildSchema(prisma, ROOT);
    await loadCatalog();
    for (const id of [VICTIM, BYSTANDER]) {
      await makeRow('User', { id, email: `${id}@fel.test`, name: `Name ${id}`, password: 'hash', role: 'coach', dobYear: 1990, declaredState: 'CA' });
    }
    // one row per registry table and subject, for each person
    for (const [table, rights] of Object.entries(REGISTRY)) {
      if (table === 'User') continue;
      for (const s of rights.subjects) {
        if (!s.where && profileFk(table, s.col)) continue;   // an Instructor / FacilitatorProfile id: seeded through its own table
        for (const who of [VICTIM, BYSTANDER]) {
          const over: Row = {};
          if (s.where?.includes('"scope" = \'athlete\'')) Object.assign(over, { scope: 'athlete', scopeId: who });
          else if (table === 'ProgramMessage' && s.col === 'programId') {
            const program = await makeRow('CoachingProgram', { clientId: who, coachId: await freshUser() });
            over.programId = program.id;
          } else over[s.col] = who;
          if (table === 'CoachAvailability') {
            over.coachId = s.col === 'coachId' ? who : await freshUser();
            over.clientId = s.col === 'clientId' ? who : await freshUser();
            await makeRow('CoachClient', { coachId: over.coachId, clientId: over.clientId });
          }
          if (table === 'Booking' && s.col === 'clientUserId') Object.assign(over, { goal: 'dunk', clientNote: 'my knee', painYes: true, clipPaths: '["r/originals/a.mp4"]' });
          if (table === 'MpMatch') Object.assign(over, { hostName: 'Host Name', guestName: 'Guest Name' });
          const row = await makeRow(table, over);
          seeded.push({ table, col: s.col, who, key: await keyOf(table, row) });
        }
      }
    }
    // the children the export reaches through a parent
    const wallet = (await prisma.$queryRawUnsafe(`SELECT "id" FROM "Wallet" WHERE "playerId" = $1`, VICTIM) as Row[])[0];
    await makeRow('WalletLedgerEntry', { walletId: wallet.id, reasonCode: 'DAILY_DRILL_COMPLETE', delta: 10, balanceAfter: 10 });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('control: every subject was seeded for both people, except the profile ids (seeded through their own tables)', () => {
    const missing: string[] = [];
    for (const [table, rights] of Object.entries(REGISTRY)) {
      if (table === 'User') continue;
      for (const s of rights.subjects) {
        if (!s.where && profileFk(table, s.col)) continue;
        for (const who of [VICTIM, BYSTANDER]) if (!seeded.some((x) => x.table === table && x.col === s.col && x.who === who)) missing.push(`${table}.${s.col}`);
      }
    }
    expect(missing).toEqual([]);
    expect(seeded.length).toBeGreaterThanOrEqual(250);   // 125 subjects × 2 people today
    // every table but User, less CampTemplate, whose one subject is a FacilitatorProfile id
    const seedable = Object.entries(REGISTRY).filter(([t, r]) => t !== 'User' && r.subjects.some((x) => x.where || !profileFk(t, x.col)));
    expect(new Set(seeded.map((x) => x.table)).size).toBe(seedable.length);
    expect(seedable.length).toBe(Object.keys(REGISTRY).length - 2);
  });

  it('the export hands over every exported subject\'s rows, never the bystander\'s, never a secret', async () => {
    const out = await collectTables(prisma, VICTIM);
    expect(out.notYetCreated).toEqual([]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(`"${BYSTANDER}-`);
    for (const [table, rights] of Object.entries(REGISTRY)) {
      if (rights.exportedAs) continue;
      if (rights.subjects.some((s) => s.export === true)) expect(out.tables[table], table).toBeDefined();
      for (const c of rights.omit ?? []) for (const r of out.tables[table] ?? []) expect(r, `${table}.${c}`).not.toHaveProperty(c);
    }
    expect(out.tables.WalletLedgerEntry.map((r) => r.reasonCode)).toContain('DAILY_DRILL_COMPLETE');
  });

  it('a dry run counts and changes nothing', async () => {
    const before = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PrqEntry"`);
    const dry = await eraseAccount(prisma, VICTIM, { dryRun: true });
    expect(dry.lines.length).toBeGreaterThan(100);
    expect(await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PrqEntry"`)).toEqual(before);
  });

  it('the erase runs in one transaction and does exactly what the registry says, to the victim only', async () => {
    const result = await prisma.$transaction((tx: any) => eraseAccount(tx, VICTIM), { timeout: 60_000 });
    expect(result.notYetCreated).toEqual([]);
    const wrong: string[] = [];
    for (const s of seeded) {
      const rights = REGISTRY[s.table];
      const subject = rights.subjects.find((x) => x.col === s.col)!;
      const row = await find(s.table, s.key);
      if (s.who === BYSTANDER) {
        continue;   // checked below
      }
      const e = subject.erase;
      if (e === 'delete' && row) wrong.push(`${s.table}.${s.col} not deleted`);
      if (e === 'keep' && !row) wrong.push(`${s.table}.${s.col} kept row missing`);
      if (e === 'nullify' && (!row || row[s.col] !== null)) wrong.push(`${s.table}.${s.col} not nulled`);
      if (typeof e === 'object') {
        if (!row) { wrong.push(`${s.table}.${s.col} scrubbed row missing`); continue; }
        for (const [c, expr] of Object.entries(e.scrub)) {
          if (expr === 'NULL' && row[c] !== null) wrong.push(`${s.table}.${c} not scrubbed`);
          if (expr === 'false' && row[c] !== false) wrong.push(`${s.table}.${c} not false`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // the bystander's rows in every classified table survive, every one
    const lostBystander: string[] = [];
    for (const s of seeded.filter((x) => x.who === BYSTANDER)) if (!(await find(s.table, s.key))) lostBystander.push(`${s.table}.${s.col}`);
    expect(lostBystander).toEqual([]);
  }, 120_000);

  it('the account row is a tombstone: no name, email, password, birth year or state; sign-in refused', async () => {
    const u = (await find('User', { id: VICTIM }))!;
    expect(u).toMatchObject({ email: `erased-${VICTIM}@erased.invalid`, name: null, password: '', role: 'player', dobYear: null, declaredState: null });
    expect('dob' in u ? u.dob : null).toBeNull();
    const b = (await find('User', { id: BYSTANDER }))!;
    expect(b).toMatchObject({ email: `${BYSTANDER}@fel.test`, password: 'hash' });
    expect(Object.keys(TOMBSTONE)).toContain('dob');
  });

  it('ledger and money rows are kept; the booking keeps its money and loses its details; clips are put due for the sweep', async () => {
    expect((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "WalletLedgerEntry" e JOIN "Wallet" w ON w."id" = e."walletId" WHERE w."playerId" = $1`, VICTIM))[0].n).toBe(1);
    const b = (await prisma.$queryRawUnsafe(`SELECT * FROM "Booking" WHERE "clientUserId" = $1`, VICTIM))[0];
    expect(b).toMatchObject({ goal: null, clientNote: null, painYes: null });
    expect(typeof b.priceCents).toBe('number');
    expect(b.originalClipDeleteAt).toBeInstanceOf(Date);
    expect((b.originalClipDeleteAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
    const m = (await prisma.$queryRawUnsafe(`SELECT "hostName" FROM "MpMatch" WHERE "hostId" = $1`, VICTIM))[0];
    expect(m.hostName).toBe('Erased player');
  });

  it('is idempotent: a second erase deletes and changes nothing more', async () => {
    const again = await prisma.$transaction((tx: any) => eraseAccount(tx, VICTIM), { timeout: 60_000 });
    expect(again.lines.filter((l) => l.action === 'delete').reduce((n, l) => n + l.rows, 0)).toBe(0);
  });
});
