// ACCOUNT-DELETE: who may delete in the app (the age rule) and what blocks it (open obligations). The statements' real
// effect on rows is checked on Postgres in ./accountDelete.integration.test.ts; this pins the rule and the shape.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OBLIGATION_CHECKS, ageBlock, deleteBlock, openObligations } from './deleteGate';
import { DELETE_COPY, blockMessage } from './deleteCopy';
import { PRIVACY_CONTENT } from '@/lib/policies';
import { BUSINESS_CONTACT_EMAIL } from '@/lib/legal/business';

const NOW = new Date('2026-10-25T12:00:00Z');

function fakeRaw(tables: Record<string, string[]>, counts: Record<string, number> = {}) {
  const calls: { sql: string; args: unknown[] }[] = [];
  return {
    calls,
    async $queryRawUnsafe<T>(sql: string, ...args: unknown[]): Promise<T> {
      calls.push({ sql, args });
      if (sql.includes('information_schema.columns')) {
        return Object.entries(tables).flatMap(([t, cols]) => cols.map((c) => ({ table_name: t, column_name: c }))) as T;
      }
      for (const [frag, n] of Object.entries(counts)) if (sql.includes(frag)) return [{ n: BigInt(n) }] as T;
      return [{ n: 0 }] as T;
    },
    async $executeRawUnsafe() { return 0; },
  };
}

const ALL_TABLES = Object.fromEntries(OBLIGATION_CHECKS.map((c) => [c.table, [] as string[]]));
for (const c of OBLIGATION_CHECKS) ALL_TABLES[c.table] = [...new Set([...ALL_TABLES[c.table], ...c.cols])];

describe('the age rule (lib/consent/guardianGate.ts needsGuardian: under 18, or blank)', () => {
  it('blank is age-unknown; under 18 by year is a minor; 18 or more by year may delete', () => {
    expect(ageBlock(null, NOW)).toEqual({ kind: 'age-unknown' });
    expect(ageBlock(undefined, NOW)).toEqual({ kind: 'age-unknown' });
    expect(ageBlock(2026 - 13, NOW)).toEqual({ kind: 'minor' });
    expect(ageBlock(2026 - 17, NOW)).toEqual({ kind: 'minor' });
    expect(ageBlock(2026 - 18, NOW)).toBeNull();
    expect(ageBlock(1980, NOW)).toBeNull();
  });

  it('the minor message routes to a parent or guardian and the contact email; nothing in-app', () => {
    const m = blockMessage({ kind: 'minor' });
    expect(m.lines.join(' ')).toContain('parent or guardian');
    expect(m.lines.join(' ')).toContain(BUSINESS_CONTACT_EMAIL);
    const u = blockMessage({ kind: 'age-unknown' });
    expect(u.lines.join(' ')).toContain('parent or guardian');
    expect(u.lines.join(' ')).toContain('from the email address on this account');
  });
});

describe('open obligations', () => {
  it('none open: empty, and the age rule is checked first', async () => {
    expect(await openObligations(fakeRaw(ALL_TABLES), 'u1', NOW)).toEqual([]);
    const db = fakeRaw(ALL_TABLES, { 'FROM "PayoutRequest"': 3 });
    expect(await deleteBlock(db, 'u1', 2026 - 15, NOW)).toEqual({ kind: 'minor' });
    expect(db.calls).toHaveLength(0);
  });

  it('each kind is listed with its count, in order, and every one has a message saying what to do', async () => {
    const counts = {
      'WHERE "coachUserId" = $1': 1, 'WHERE "clientUserId" = $1': 2, 'FROM "PayoutRequest"': 1, 'FROM "Subscription"': 1,
      'WHERE "coachId" = $1': 4, 'WHERE "buyerId" = $1': 1,
    };
    const b = await deleteBlock(fakeRaw(ALL_TABLES, counts), 'u1', 1980, NOW);
    expect(b).toEqual({ kind: 'obligations', items: [
      { code: 'coach-bookings', count: 1 }, { code: 'client-bookings', count: 2 }, { code: 'payouts', count: 1 },
      { code: 'subscription', count: 1 }, { code: 'coach-plans-sold', count: 4 }, { code: 'coach-plans-bought', count: 1 },
    ] });
    const m = blockMessage(b!);
    expect(m.title).toBe('Settle these first');
    expect(m.lines).toHaveLength(6);
    for (const l of m.lines) expect(l).toMatch(/\b(first|arrive|arrives)\b/);
  });

  it('a table not created yet (coach-business is pending SQL) is skipped, not an error', async () => {
    const { CoachSale: _skip, ...applied } = ALL_TABLES;
    void _skip;
    const db = fakeRaw(applied, { 'WHERE "coachId" = $1': 9 });
    expect(await openObligations(db, 'u1', NOW)).toEqual([]);
    expect(db.calls.some((c) => c.sql.includes('"CoachSale"'))).toBe(false);
  });

  it('the account id is always $1, `now` is $2 only where a statement uses it (Postgres refuses an unused one)', async () => {
    const db = fakeRaw(ALL_TABLES);
    await openObligations(db, 'u1', NOW);
    const counted = db.calls.filter((c) => c.sql.startsWith('SELECT count(*)'));
    expect(counted).toHaveLength(OBLIGATION_CHECKS.length);
    for (const c of counted) {
      expect(c.args[0]).toBe('u1');
      expect(c.args.length).toBe(c.sql.includes('$2') ? 2 : 1);
    }
  });

  it('an FEL subscription set to cancel at period end does not block (it will not bill again)', () => {
    const sub = OBLIGATION_CHECKS.find((c) => c.code === 'subscription')!;
    expect(sub.sql).toContain('"cancelAtPeriodEnd" = false');
  });
});

describe('the copy matches the policy it repeats (product copy, owner-flagged)', () => {
  const privacy = PRIVACY_CONTENT;
  const kept = DELETE_COPY.kept.lines.join(' ');

  it('money records: 7 years, as Privacy §10 says', () => {
    expect(privacy).toContain('Order, payment, refund and referral records: 7 years after the purchase, for tax and accounting');
    expect(kept).toContain('7 years after the purchase, for tax and accounting');
  });

  it('consent records kept as proof, as Privacy §5 says', () => {
    expect(privacy).toContain('Your consent records are kept, as proof of what you agreed to');
    expect(kept).toContain('as proof of what you agreed to');
  });

  it('party reports: 12 months, as the Parties paragraph says', () => {
    expect(privacy).toContain('We keep a report for 12 months, then delete it.');
    expect(kept).toContain('12 months');
  });

  it('the policy still says deletion is by email: the draft change waits for the owner (lib/policies.ts untouched)', () => {
    expect(privacy).toContain('Until an in-app delete option exists');
    expect(readFileSync(join(__dirname, '../../docs/DRAFT-policy-account-deletion.md'), 'utf8')).toMatch(/^# DRAFT/m);
  });
});
