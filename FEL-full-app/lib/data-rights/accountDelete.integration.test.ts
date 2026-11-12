// ACCOUNT-DELETE: the in-app delete's pieces against a REAL Postgres holding every table (schema.prisma + every pending
// SQL file, built by tests/helpers/prismaDdl.ts) — the #450 harness.
//
// Opt-in and local-only, like ./accountErase.integration.test.ts: it runs when DATA_RIGHTS_IT=1 and DATABASE_URL points
// at a database on 127.0.0.1 / localhost whose name contains "throwaway", and is skipped everywhere else, CI included.
// On an EMPTY database run one integration file first (or this one alone): two files building the schema at once race.
// Measured 2026-10-25 on Postgres 16: the erase file then this one on a fresh database, 7/7 and 4/4, and this one again
// on the same database, 4/4. (The erase file's own seeder does not re-run on a used database: ON CONFLICT DO NOTHING
// hides a unique-integer collision with its previous run's rows, then a foreign key fails. Pre-existing; not changed.)
//
// What the stand-ins cannot show, this does: the obligation statements are valid SQL on the real tables (enum casts,
// timestamp parameters) and count the right rows; eraseAccountNow's row lock and once-only event hold under a real
// double submit; and the real lib/auth.ts callbacks, reading the real placeholder row, end the session and refuse a
// sign-in.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildSchema } from '@/tests/helpers/prismaDdl';
import { ERASE_EVENT_DEDUPE_KEY, eraseAccountNow, txRunner } from './accountDelete';
import { openObligations } from './deleteGate';
import { tombstoneEmail } from './tombstone';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_THROWAWAY = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/\w*throwaway\w*(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.DATA_RIGHTS_IT === '1' && LOCAL_THROWAWAY;
const ROOT = join(__dirname, '../..');

type Row = Record<string, unknown>;
let prisma: any;
const TAG = `ad${Date.now().toString(36)}`;
let seq = 0;
const NOW = new Date();
const later = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

interface Col { name: string; type: string; udt: string; nullable: boolean; hasDefault: boolean }
const cols = new Map<string, Col[]>();
const fks = new Map<string, { cols: string[]; ref: string; refCols: string[] }[]>();
const enumFirst = new Map<string, string>();

async function loadCatalog() {
  for (const r of await prisma.$queryRawUnsafe(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY ordinal_position`) as any[]) {
    const list = cols.get(r.table_name) ?? [];
    list.push({ name: r.column_name, type: r.data_type, udt: r.udt_name, nullable: r.is_nullable === 'YES', hasDefault: r.column_default != null });
    cols.set(r.table_name, list);
  }
  for (const r of await prisma.$queryRawUnsafe(`
    SELECT c.conrelid::regclass::text AS t, c.confrelid::regclass::text AS ref,
           ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS cols,
           ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS refcols
      FROM pg_constraint c WHERE c.contype = 'f'`) as any[]) {
    const t = String(r.t).replace(/"/g, '');
    const list = fks.get(t) ?? [];
    list.push({ cols: r.cols, ref: String(r.ref).replace(/"/g, ''), refCols: r.refcols });
    fks.set(t, list);
  }
  for (const r of await prisma.$queryRawUnsafe(`SELECT t.typname, min(e.enumlabel) AS label FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`) as any[]) {
    enumFirst.set(r.typname, r.label);
  }
}

function dummy(c: Col): unknown {
  seq += 1;
  switch (c.type) {
    case 'text': case 'character varying': return `${TAG}-${c.name}-${seq}`;
    case 'integer': case 'bigint': case 'smallint': return seq;
    case 'double precision': case 'numeric': case 'real': return 1.5;
    case 'boolean': return false;
    case 'timestamp without time zone': case 'timestamp with time zone': return NOW.toISOString();
    case 'date': return '2000-01-01';
    case 'jsonb': case 'json': return '{}';
    case 'ARRAY': return '{}';
    case 'USER-DEFINED': return enumFirst.get(c.udt);
    default: throw new Error(`seed: no dummy for ${c.type}`);
  }
}

const lit = (v: unknown, c: Col): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v).replace(/'/g, "''");
  return c.type === 'USER-DEFINED' ? `'${s}'::"${c.udt}"` : `'${s}'`;
};

/** Insert one row, filling every NOT NULL column without a default and creating the parents its foreign keys need. */
async function makeRow(table: string, over: Row = {}): Promise<Row> {
  const tcols = cols.get(table);
  if (!tcols) throw new Error(`seed: no table ${table}`);
  const row: Row = { ...over };
  for (const fk of fks.get(table) ?? []) {
    if (fk.cols.every((c) => c in row)) continue;
    if (fk.cols.every((c) => tcols.find((x) => x.name === c)!.nullable)) continue;
    const parent = fk.ref === 'User' ? await makeUser() : await makeRow(fk.ref);
    fk.cols.forEach((c, i) => { row[c] = parent[fk.refCols[i]]; });
  }
  for (const c of tcols) if (!(c.name in row) && !c.nullable && !c.hasDefault) row[c.name] = dummy(c);
  const names = Object.keys(row);
  await prisma.$executeRawUnsafe(`INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${names.map((n) => lit(row[n], tcols.find((c) => c.name === n)!)).join(', ')})`);
  return row;
}

async function makeUser(over: Row = {}): Promise<Row> {
  const id = `${TAG}-u${++seq}`;
  return makeRow('User', { id, email: `${id}@fel.test`, password: 'hash', dobYear: 1990, ...over });
}

describe.skipIf(!RUN)('in-app account delete on a real Postgres with every pending table applied', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    const has = await prisma.$queryRawUnsafe(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'User'`);
    if (!(has as unknown[]).length) await buildSchema(prisma, ROOT);
    await loadCatalog();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('obligations: each statement runs on the real tables and counts only what is still open', async () => {
    const coach = (await makeUser()).id as string;
    const client = (await makeUser()).id as string;
    expect(await openObligations(prisma, coach)).toEqual([]);

    const instructor = await makeRow('Instructor', { userId: coach });
    const booking = (o: Row) => makeRow('Booking', { instructorId: instructor.id, coachUserId: coach, clientUserId: client, ...o });
    await booking({ status: 'PAID', startsAt: later(24), endsAt: later(25) });       // open: upcoming
    await booking({ status: 'PAID', startsAt: later(-25), endsAt: later(-24) });     // done: in the past
    await booking({ status: 'PAID', deliveredAt: later(-1) });                       // done: review delivered
    await booking({ status: 'REFUND_DUE' });                                         // open: money in flight
    await booking({ status: 'HELD', holdExpiresAt: later(-1) });                     // done: hold expired
    await booking({ status: 'CANCELLED' });
    await makeRow('PayoutRequest', { userId: coach, status: 'PENDING' });
    await makeRow('PayoutRequest', { userId: coach, status: 'COMPLETED' });
    await makeRow('Subscription', { userId: coach, status: 'ACTIVE', cancelAtPeriodEnd: true });   // will not renew
    await makeRow('Subscription', { userId: client, status: 'ACTIVE', cancelAtPeriodEnd: false });
    const pkg = await makeRow('CoachPackage', { coachId: coach });
    await makeRow('CoachSale', { packageId: pkg.id, coachId: coach, buyerId: client, status: 'ACTIVE', holdExpiresAt: later(-1) });
    await makeRow('CoachSale', { packageId: pkg.id, coachId: coach, buyerId: client, status: 'EXPIRED', holdExpiresAt: later(-1) });

    expect(await openObligations(prisma, coach)).toEqual([
      { code: 'coach-bookings', count: 2 }, { code: 'payouts', count: 1 }, { code: 'coach-plans-sold', count: 1 },
    ]);
    expect(await openObligations(prisma, client)).toEqual([
      { code: 'client-bookings', count: 2 }, { code: 'subscription', count: 1 }, { code: 'coach-plans-bought', count: 1 },
    ]);
  });

  it('eraseAccountNow: placeholder row, one event with no personal data, a bystander untouched', async () => {
    const victim = (await makeUser({ name: 'Ada Lovelace' })).id as string;
    const bystander = (await makeUser({ name: 'Bea' })).id as string;
    await makeRow('PrqEntry', { userId: victim });
    await makeRow('PrqEntry', { userId: bystander });
    const o = await eraseAccountNow(txRunner(prisma), victim, 'in-app');
    expect(o.alreadyErased).toBe(false);
    const u = (await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE "id" = $1`, victim))[0];
    expect(u).toMatchObject({ email: tombstoneEmail(victim), name: null, password: '', dobYear: null });
    expect((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PrqEntry" WHERE "userId" = $1`, victim))[0].n).toBe(0);
    expect((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PrqEntry" WHERE "userId" = $1`, bystander))[0].n).toBe(1);
    const ev = await prisma.$queryRawUnsafe(`SELECT * FROM "CreditLedger" WHERE "userId" = $1`, victim);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ amount: 0, dedupeKey: ERASE_EVENT_DEDUPE_KEY });
    expect(ev[0].reason).toMatch(/\(in-app\)$/);
    expect(ev[0].reason).not.toMatch(/Ada|@/);
  }, 120_000);

  it('a retry, and a real double submit, record one event and both succeed', async () => {
    const victim = (await makeUser()).id as string;
    const [a, b] = await Promise.all([
      eraseAccountNow(txRunner(prisma), victim, 'in-app'),
      eraseAccountNow(txRunner(prisma), victim, 'in-app'),
    ]);
    expect([a.alreadyErased, b.alreadyErased].sort()).toEqual([false, true]);
    const c = await eraseAccountNow(txRunner(prisma), victim, 'operator');
    expect(c.alreadyErased).toBe(true);
    expect((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "CreditLedger" WHERE "userId" = $1 AND "dedupeKey" = $2`, victim, ERASE_EVENT_DEDUPE_KEY))[0].n).toBe(1);
  }, 120_000);

  it('the real lib/auth.ts callbacks, on the real placeholder row: the old token is emptied, sign-in refused', async () => {
    const { authOptions } = await import('@/lib/auth');
    const { resetAccountStatus } = await import('@/lib/auth/accountStatus');
    resetAccountStatus();
    const bcrypt = (await import('bcryptjs')).default;
    const victim = (await makeUser({ password: bcrypt.hashSync('pw-123456', 4) })).id as string;
    const jwt = authOptions.callbacks!.jwt as (a: unknown) => Promise<Row>;
    const authorize = (authOptions.providers[0] as any).options.authorize as (c: unknown) => Promise<unknown>;
    // control: alive
    expect(await jwt({ token: { sub: victim }, account: null })).toMatchObject({ sub: victim });
    expect(await authorize({ email: `${victim}@fel.test`, password: 'pw-123456' })).toMatchObject({ id: victim });
    await eraseAccountNow(txRunner(prisma), victim, 'in-app');
    resetAccountStatus();   // another instance: nothing marked, it reads the row
    expect(await jwt({ token: { sub: victim, role: 'player', roleAt: Date.now() }, account: null })).toEqual({});
    expect(await authorize({ email: `${victim}@fel.test`, password: 'pw-123456' })).toBeNull();
    expect(await authorize({ email: tombstoneEmail(victim), password: '' })).toBeNull();
  }, 60_000);
});
