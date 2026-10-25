// DATA-RIGHTS-SWEEP (2026-10-25): THE GUARD. Every table that holds a person's id — in prisma/schema.prisma OR in
// prisma/pending/*.sql — is classified in lib/data-rights/registry.ts, every person column on it is, and every
// classification says why. A feature that adds a table with a user-id column, or a person column on an existing table,
// fails here until somebody decides what the export and the erase do with it. Static, like
// lib/privacy/scan-save-coverage.test.ts: it reads the files, so a pending table is covered before it is applied.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTRY, PRQ_MOVEMENT, type TableRights } from './registry';
import { erasePlan, TOMBSTONE } from './rights';
import { personTables, scanPendingSql, scanPrismaSchema, PERSON_COLUMN, type Scan } from '@/tests/helpers/schemaScan';

const ROOT = join(__dirname, '../..');
const PENDING = join(ROOT, 'prisma/pending');

function scanRepo(): Scan {
  const scan = scanPrismaSchema(readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8'));
  for (const f of readdirSync(PENDING).filter((n) => n.endsWith('.sql')).sort()) {
    scanPendingSql(readFileSync(join(PENDING, f), 'utf8'), f, scan);
  }
  return scan;
}

/** "T.col" for every detected person column the registry does not classify. */
function uncovered(scan: Scan, registry: Record<string, TableRights>): string[] {
  const out: string[] = [];
  for (const t of personTables(scan)) {
    const r = registry[t.table];
    for (const col of t.personColumns) {
      if (!r || !r.subjects.some((s) => s.col === col)) out.push(`${t.table}.${col}`);
    }
  }
  return out;
}

const scan = scanRepo();

describe('every table that holds a person is classified for export and erase', () => {
  it('control: the scan sees person columns in both sources, including tables with no foreign key', () => {
    const found = new Map(personTables(scan).map((t) => [t.table, [...t.personColumns].sort()]));
    // applied schema, through a User relation and through the name rule
    expect(found.get('PrqEntry')).toEqual(['userId']);
    expect(found.get('CoachingProgram')).toEqual(['clientId', 'coachId']);   // no foreign key at all
    expect(found.get('CompetitionMatch')).toEqual(['disputedBy', 'player1Id', 'player2Id', 'winnerId']);
    // pending SQL, the gaps this sweep closed
    expect(found.get('ReadinessJumpCheck')).toEqual(['userId']);
    expect(found.get('CoachFormReview')).toEqual(['clientId', 'coachId']);
    expect(found.get('TrainingGroupAct')).toEqual(['fromUserId', 'toUserId']);
    expect(found.get('CoachDraftDecision')).toEqual(['actorId', 'clientId']);
    expect(found.get('CoachSale')).toEqual(['buyerId', 'coachId']);
    expect(found.get('LibrarySubmission')).toEqual(['coachId', 'moderatorId']);
    expect(found.get('PartyReport')).toEqual(['reportedId', 'reporterId']);
    expect(personTables(scan).length).toBeGreaterThanOrEqual(97);
  });

  it('control: a new table with a user-id column, in either source, is caught', () => {
    const extra = scanPrismaSchema(`
model Kudos {
  id      String @id
  giver   String
  giverUser User @relation(fields: [giver], references: [id])
}
model Note {
  id       String @id
  authorId String
}`);
    scanPendingSql(`-- a later feature
CREATE TABLE "SquadPhoto" (
    "id" TEXT NOT NULL,
    "uploaderUserId" TEXT NOT NULL,
    "subject" TEXT,
    CONSTRAINT "SquadPhoto_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SquadPhoto" ADD CONSTRAINT "SquadPhoto_subject_fkey" FOREIGN KEY ("subject") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrqEntry" ADD COLUMN "witnessId" TEXT REFERENCES "User"("id");
ALTER TABLE "Order" ADD COLUMN "giftRecipientId" TEXT;`, 'later.sql', extra);
    expect(uncovered(extra, REGISTRY).sort()).toEqual([
      'Kudos.giver',                  // a foreign key to User, whatever its name
      'Note.authorId',                // the name rule, no foreign key
      'Order.giftRecipientId',        // a new person column on an existing, classified table
      'PrqEntry.witnessId',           // ditto, through REFERENCES
      'SquadPhoto.subject',           // a foreign key added by ALTER
      'SquadPhoto.uploaderUserId',
    ]);
  });

  it('every person column in schema.prisma and prisma/pending/*.sql is classified', () => {
    expect(uncovered(scan, REGISTRY)).toEqual([]);
  });

  it('nothing in the registry is stale: each table and subject column exists in one of the sources', () => {
    const stale: string[] = [];
    for (const [table, r] of Object.entries(REGISTRY)) {
      const t = scan.get(table);
      if (!t) { stale.push(table); continue; }
      for (const s of r.subjects) if (!t.columns.has(s.col)) stale.push(`${table}.${s.col}`);
      for (const c of r.omit ?? []) if (!t.columns.has(c)) stale.push(`${table} omit ${c}`);
      for (const s of r.subjects) {
        if (typeof s.erase === 'object') for (const c of Object.keys(s.erase.scrub)) if (!t.columns.has(c)) stale.push(`${table} scrub ${c}`);
      }
      for (const c of r.children ?? []) if (!scan.has(c.table)) stale.push(`${table} child ${c.table}`);
    }
    for (const c of Object.keys(TOMBSTONE)) if (!scan.get('User')?.columns.has(c)) stale.push(`User tombstone ${c}`);
    expect(stale).toEqual([]);
  });

  it('every decision is written down: each subject has a reason, and each export refusal says why', () => {
    const silent: string[] = [];
    for (const [table, r] of Object.entries(REGISTRY)) {
      for (const s of r.subjects) {
        if (s.why.trim().length < 12) silent.push(`${table}.${s.col} why`);
        if (s.export !== true && s.export.trim().length < 12) silent.push(`${table}.${s.col} export`);
      }
    }
    expect(silent).toEqual([]);
  });

  it('a kept row names its retention rule; the User row alone is the tombstone', () => {
    const plan = erasePlan();
    expect(plan.filter((p) => p.action === 'tombstone').map((p) => p.table)).toEqual(['User']);
    for (const p of plan.filter((x) => x.action === 'keep')) {
      expect(p.s.why, `${p.table}.${p.s.col}`).toMatch(/ledger|money|consent|kept|keep|stays|not an account id|audit|shared|record/i);
    }
  });

  it('the money and ledger tables are never deleted or scrubbed of their money columns', () => {
    const ledger = ['CreditLedger', 'Wallet', 'LedgerAccount', 'PassGrant', 'Order', 'Subscription', 'StripeCustomer', 'PayoutRequest',
      'MarketplacePurchase', 'ReferralConversion', 'CoachStoreReferral', 'CoachSale', 'CoachConnectAccount', 'ProgramAccess', 'BookEntitlement'];
    for (const t of ledger) {
      for (const s of REGISTRY[t].subjects) expect(s.erase, `${t}.${s.col}`).toBe('keep');
    }
    // the store's booking keeps every money column; only the details Privacy §10 lets a person delete are scrubbed
    const booking = REGISTRY.Booking.subjects.find((s) => s.col === 'clientUserId')!.erase as { scrub: Record<string, string> };
    for (const money of ['priceCents', 'platformFeeCents', 'stripeFeeCents', 'refundCents', 'stripeCheckoutId', 'stripePaymentIntentId', 'status']) {
      expect(Object.keys(booking.scrub)).not.toContain(money);
    }
  });

  it('HealthConsent stays under every erase (MIRROR-COACH-ERASE)', () => {
    expect(REGISTRY.HealthConsent.subjects.map((s) => s.erase)).toEqual(['keep', 'keep']);
  });

  it('secrets are never exported: passwords, tokens and key material are omitted', () => {
    const secret = /password|token|keyCipher|keyHash|sig$|CodeHash|TokenHash/i;
    for (const t of personTables(scan)) {
      const r = REGISTRY[t.table];
      for (const c of t.columns) if (secret.test(c)) expect(r.omit ?? [], `${t.table}.${c}`).toContain(c);
    }
    expect(REGISTRY.User.omit).toContain('password');
  });

  it('the PRQ movement tables are classified, and exported by the PRQ export rather than twice', () => {
    for (const m of PRQ_MOVEMENT) {
      expect(REGISTRY[m.table].exportedAs).toBe(m.key);
      expect(REGISTRY[m.table].subjects.find((s) => s.col === m.col)?.erase).toBe('delete');
    }
  });

  it('identifiers are plain names (they are interpolated into SQL text)', () => {
    for (const [table, r] of Object.entries(REGISTRY)) {
      expect(table).toMatch(/^\w+$/);
      for (const s of r.subjects) expect(s.col).toMatch(/^\w+$/);
    }
    expect(PERSON_COLUMN.test('userId')).toBe(true);
    expect(PERSON_COLUMN.test('clientSessionId')).toBe(false);
  });
});
