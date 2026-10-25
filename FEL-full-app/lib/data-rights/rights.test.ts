// DATA-RIGHTS-SWEEP: the export and erase executor against a stand-in that records SQL. What the statements DO to real
// rows is measured on a real Postgres in ./accountErase.integration.test.ts; this file pins the shape: pending tables are
// skipped quietly, secrets never leave, the erase runs in phase order, a dry run changes nothing, the account id is
// always the bound parameter.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectTables, collectPrqMovement, eraseAccount, erasePrqMovement, erasureSummary, presentSchema, recordErasureEvent, TOMBSTONE } from './rights';
import { REGISTRY } from './registry';
import { collectPrqExport, erasePrqData, erasureReason } from '@/lib/prq-data-rights';

type Call = { sql: string; args: unknown[] };

/** A RawDb whose schema is `tables` (table → columns) and whose SELECTs answer from `rows` by table. */
function fakeRaw(tables: Record<string, string[]>, rows: Record<string, Record<string, unknown>[]> = {}, affected = 1) {
  const calls: Call[] = [];
  const db = {
    calls,
    async $queryRawUnsafe(sql: string, ...args: unknown[]) {
      calls.push({ sql, args });
      if (sql.includes('information_schema.columns')) {
        return Object.entries(tables).flatMap(([t, cols]) => cols.map((c) => ({ table_name: t, column_name: c })));
      }
      if (sql.startsWith('SELECT count(*)')) return [{ n: BigInt(2) }];
      const m = /FROM "(\w+)"/.exec(sql);
      return m ? (rows[m[1]] ?? []) : [];
    },
    async $executeRawUnsafe(sql: string, ...args: unknown[]) {
      calls.push({ sql, args });
      return affected;
    },
  };
  return db;
}

/** The columns schema.prisma / the pending SQL give each registry table, enough for the executor. */
function columnsOf(table: string): string[] {
  const r = REGISTRY[table];
  const cols = new Set<string>(['id', 'createdAt']);
  for (const s of r.subjects) {
    cols.add(s.col);
    if (typeof s.erase === 'object') for (const c of Object.keys(s.erase.scrub)) cols.add(c);
  }
  for (const c of r.omit ?? []) cols.add(c);
  if (table === 'User') for (const c of Object.keys(TOMBSTONE)) cols.add(c);
  return [...cols];
}

describe('collectTables (the account export)', () => {
  it('reads only the account\'s rows, by bound parameter, and names the tables not created yet', async () => {
    const db = fakeRaw(
      { TrainingGroupMember: ['groupId', 'userId', 'role'], CoachSale: ['id', 'coachId', 'buyerId', 'amountCents'] },
      { TrainingGroupMember: [{ groupId: 'g1', userId: 'u1', role: 'member' }], CoachSale: [{ id: 's1', coachId: 'c9', buyerId: 'u1', amountCents: 5000 }] },
    );
    const out = await collectTables(db, 'u1');
    expect(Object.keys(out.tables).sort()).toEqual(['CoachSale', 'TrainingGroupMember']);
    expect(out.notYetCreated).toContain('ReadinessRule');
    expect(out.notYetCreated).toContain('CoachProgramDraft');
    const selects = db.calls.filter((c) => c.sql.startsWith('SELECT * FROM'));
    for (const c of selects) expect(c.args).toEqual(['u1']);
    expect(selects.every((c) => /= \$1|\$1\)/.test(c.sql))).toBe(true);
    // a row matched by two subjects (buyer and coach) is one row
    expect(out.tables.CoachSale).toHaveLength(1);
  });

  it('leaves tables already exported under a legacy key to that key', async () => {
    const db = fakeRaw({ PrqEntry: ['id', 'userId'], WorkoutScan: ['id', 'userId'], ReadinessJumpCheck: ['id', 'userId'] });
    await collectTables(db, 'u1');
    expect(db.calls.some((c) => /FROM "(PrqEntry|WorkoutScan|ReadinessJumpCheck)"/.test(c.sql))).toBe(false);
  });

  it('never hands over a secret column, and turns BIGINT into text so the JSON can be written', async () => {
    const db = fakeRaw(
      { TrainingGroup: ['id', 'ownerId', 'inviteToken', 'name'], GuestSession: ['id', 'token', 'tokenHash', 'data', 'migratedUserId'], Wallet: ['id', 'playerId', 'lc'], WalletLedgerEntry: ['id', 'walletId', 'delta'] },
      {
        TrainingGroup: [{ id: 'g1', ownerId: 'u1', inviteToken: 'SECRET-INVITE', name: 'Night Owls' }],
        GuestSession: [{ id: 'gs1', token: 'SECRET-TOKEN', tokenHash: 'SECRET-HASH', data: { challenges: [{ code: 'c1', score: 9 }] }, migratedUserId: 'u1' }],
        Wallet: [{ id: 'w1', playerId: 'u1', lc: BigInt(120) }],
        WalletLedgerEntry: [{ id: 'e1', walletId: 'w1', delta: BigInt(10), reasonCode: 'DAILY_DRILL_COMPLETE' }],
      },
    );
    const out = await collectTables(db, 'u1');
    const json = JSON.stringify(out);
    for (const s of ['SECRET-INVITE', 'SECRET-TOKEN', 'SECRET-HASH']) expect(json).not.toContain(s);
    expect(out.tables.GuestSession[0].data).toEqual({ challenges: [{ code: 'c1', score: 9 }] });   // challenges v2 guest results
    expect(out.tables.Wallet[0].lc).toBe('120');
    expect(out.tables.WalletLedgerEntry[0]).toMatchObject({ delta: '10', reasonCode: 'DAILY_DRILL_COMPLETE' });
  });

  it('the athlete\'s copy of a coach decision leaves out the coach\'s private note', async () => {
    const db = fakeRaw({ CoachDraftDecision: ['id', 'actorId', 'clientId', 'note', 'clientLine'] }, { CoachDraftDecision: [{ id: 'd1', actorId: 'c1', clientId: 'u1', note: 'PRIVATE', clientLine: 'Squats eased' }] });
    const out = await collectTables(db, 'u1');
    expect(out.tables.CoachDraftDecision[0]).toEqual({ id: 'd1', actorId: 'c1', clientId: 'u1', clientLine: 'Squats eased' });
  });
});

describe('eraseAccount', () => {
  const ALL = Object.fromEntries(Object.keys(REGISTRY).map((t) => [t, columnsOf(t)]));

  it('runs every classified statement once, in phase order: rows that stay are scrubbed first, then deletes, then the tombstone', async () => {
    const db = fakeRaw(ALL);
    const out = await eraseAccount(db, 'u1');
    const writes = db.calls.filter((c) => /^(DELETE|UPDATE)/.test(c.sql));
    for (const w of writes) expect(w.args).toEqual(['u1']);
    const firstDelete = writes.findIndex((w) => w.sql.startsWith('DELETE'));
    const lastUpdate = writes.map((w) => w.sql.startsWith('UPDATE "User"') ? -1 : w.sql.startsWith('UPDATE') ? 1 : 0).lastIndexOf(1);
    expect(lastUpdate).toBeLessThan(firstDelete);
    expect(writes.at(-1)!.sql).toMatch(/^UPDATE "User" SET "email" = 'erased-' \|\| "id" \|\| '@erased\.invalid', "name" = NULL, "password" = '', "role" = 'player'/);
    // nothing kept is written to; the ledger tables are only counted
    for (const t of ['CreditLedger', 'Wallet', 'LedgerAccount', 'Order', 'CoachSale', 'CoachStoreReferral', 'HealthConsent']) {
      expect(writes.some((w) => w.sql.includes(`"${t}"`) && !w.sql.includes('IN (SELECT'))).toBe(false);
    }
    expect(out.notYetCreated).toEqual([]);
    expect(out.lines.filter((l) => l.action === 'keep').every((l) => l.rows === 2)).toBe(true);
  });

  it('a dry run counts and changes nothing', async () => {
    const db = fakeRaw(ALL);
    const out = await eraseAccount(db, 'u1', { dryRun: true });
    expect(db.calls.filter((c) => /^(DELETE|UPDATE)/.test(c.sql))).toEqual([]);
    expect(out.dryRun).toBe(true);
    expect(out.lines.length).toBeGreaterThan(100);
    expect(erasureSummary(out)).toMatch(/^Account erasure: \d+ rows deleted, \d+ rows anonymised, \d+ rows kept under retention rules$/);
  });

  it('skips a pending table that is not there yet, and a pending column (User.dob) it would scrub', async () => {
    const applied = Object.fromEntries(Object.entries(ALL).filter(([t]) => !['TrainingGroup', 'TrainingGroupMember', 'TrainingGroupAct', 'CoachProgramDraft', 'CoachDraftDecision'].includes(t)));
    applied.User = applied.User.filter((c) => c !== 'dob');
    const db = fakeRaw(applied);
    const out = await eraseAccount(db, 'u1');
    expect(out.notYetCreated.sort()).toEqual(['CoachDraftDecision', 'CoachProgramDraft', 'TrainingGroup', 'TrainingGroupAct', 'TrainingGroupMember']);
    expect(db.calls.some((c) => /"TrainingGroup|"CoachProgramDraft"|"CoachDraftDecision"/.test(c.sql))).toBe(false);
    expect(db.calls.find((c) => c.sql.startsWith('UPDATE "User"'))!.sql).not.toContain('"dob"');
  });
});

describe('the PRQ export and erase carry the pending movement tables', () => {
  it('collectPrqMovement / erasePrqMovement: the readiness jump checks and the client\'s filmed sets, [] / 0 before the SQL', async () => {
    const before = fakeRaw({});
    expect(await collectPrqMovement(before, 'u1')).toEqual({ readinessJumpChecks: [], formReviews: [] });
    expect(await erasePrqMovement(before, 'u1')).toEqual({ readinessJumpChecks: 0, formReviews: 0 });
    const after = fakeRaw(
      { ReadinessJumpCheck: ['id', 'userId', 'bestCm', 'createdAt'], CoachFormReview: ['id', 'clientId', 'coachId', 'createdAt'] },
      { ReadinessJumpCheck: [{ id: 'j1', userId: 'u1', bestCm: 41.5 }], CoachFormReview: [{ id: 'f1', clientId: 'u1', coachId: 'c1' }] },
      3,
    );
    expect(await collectPrqMovement(after, 'u1')).toEqual({ readinessJumpChecks: [{ id: 'j1', userId: 'u1', bestCm: 41.5 }], formReviews: [{ id: 'f1', clientId: 'u1', coachId: 'c1' }] });
    expect(await erasePrqMovement(after, 'u1')).toEqual({ readinessJumpChecks: 3, formReviews: 3 });
    expect(after.calls.filter((c) => c.sql.startsWith('DELETE')).map((c) => c.sql)).toEqual([
      'DELETE FROM "ReadinessJumpCheck" WHERE "userId" = $1', 'DELETE FROM "CoachFormReview" WHERE "clientId" = $1',
    ]);
  });

  it('through collectPrqExport and erasePrqData with a client that has raw calls (production)', async () => {
    const raw = fakeRaw({ ReadinessJumpCheck: ['id', 'userId', 'createdAt'] }, { ReadinessJumpCheck: [{ id: 'j1', userId: 'u1' }] }, 1);
    const none = { findMany: async () => [], findUnique: async () => null, deleteMany: async () => ({ count: 0 }) };
    const db = { ...raw, prqEntry: none, gameSession: none, workoutScan: none, healthIntake: none, painCheckIn: none, healthConsent: none, readinessCheckIn: none, breathLog: none };
    const out = await collectPrqExport(db as never, 'u1');
    expect(out.readinessJumpChecks).toEqual([{ id: 'j1', userId: 'u1' }]);
    expect(out.formReviews).toEqual([]);
    const erased = await erasePrqData(db as never, 'u1');
    expect(erased).toMatchObject({ readinessJumpChecks: 1, formReviews: 0, movementHistory: 0 });
    expect(erasureReason(erased)).toBe('PRQ data erasure: 0 entries, 1 movement history rows and 0 health records deleted');
  });

  it('presentSchema groups columns by table', async () => {
    const s = await presentSchema(fakeRaw({ A: ['x', 'y'] }));
    expect([...s.get('A')!]).toEqual(['x', 'y']);
  });
});

describe('the erasure event on the ledger', () => {
  it('is one CreditLedger row of amount 0 (no double-entry mirror, which refuses a zero posting)', async () => {
    const made: unknown[] = [];
    await recordErasureEvent({ creditLedger: { create: async (a) => { made.push(a); return {}; } } }, { userId: 'u1', reason: 'PRQ data erasure: 1 entries', balanceAfter: 40, dedupeKey: 'prq-erase:u1:1' });
    expect(made).toEqual([{ data: { userId: 'u1', amount: 0, reason: 'PRQ data erasure: 1 entries', balanceAfter: 40, dedupeKey: 'prq-erase:u1:1' } }]);
  });

  // test changed (ACCOUNT-DELETE, 2026-10-25): the account erase's event moved from the script into the shared core
  // (lib/data-rights/accountDelete.ts), which the script AND the in-app route now call; the same two rules follow it.
  it('the PRQ delete route and the account erase core record it that way, never through postLc (static)', () => {
    const root = join(__dirname, '../..');
    for (const f of ['app/api/prq/delete/route.ts', 'lib/data-rights/accountDelete.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).toMatch(/recordErasureEvent\(/);
      expect(src, f).not.toMatch(/\bpostLc\s*\(|import[^;]*\bpostLc\b/);
    }
    for (const f of ['scripts/erase-account.ts', 'app/api/account/delete/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).toMatch(/eraseAccountNow\(/);
      expect(src, f).not.toMatch(/\bpostLc\s*\(|import[^;]*\bpostLc\b/);
    }
  });
});
