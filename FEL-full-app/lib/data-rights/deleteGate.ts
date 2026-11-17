// lib/data-rights/deleteGate.ts — ACCOUNT-DELETE (2026-10-25): who may delete their own account in the app, and what
// has to be settled first.
//
// MINORS. The rules found: Terms §2 (13–17 only with a parent's or guardian's consent, parent-bought access, no account
// under 13); Privacy §5 (under 18 OR no birth year → a guardian consents first); lib/consent/guardianGate.ts
// needsGuardian is the consent surfaces' rule ("blank reads as under 18", owner decision #20). A guardian has NO
// account here (lib/coach/guardianLink.ts: GuardianConsent holds a name and an email), so there is no in-app place for a
// guardian to act. Nothing in the repo says whether a minor may delete their own account, or a guardian must. So this
// BLOCKS, as the brief says to when unclear, with "ask your parent or guardian to email us" — and raises it as an owner
// call (docs/DATA-RIGHTS.md §5). The email route already exists for everyone (Privacy §4).
//
// OBLIGATIONS. Chosen: BLOCK with a list of what to settle first, not handle. Handling would mean cancelling Stripe
// subscriptions, refunding bookings or moving payouts from inside an erase: each one is outward-facing money work with
// its own webhook path, and doing it half-way inside a database transaction is how money gets lost. Every item below is
// something the person can settle themselves today (cancel, finish, or wait), after which the delete goes through.
//   · a booking as the COACH that is paid and not yet delivered or held, a refund due, or a dispute open
//   · the same as the CLIENT (the coach is still owed a session or a review, or money is in flight to the client)
//   · a payout request still PENDING or PROCESSING
//   · an FEL subscription that will renew (ACTIVE / PAST_DUE / INCOMPLETE and not set to cancel at period end):
//     deleting the account would not stop Stripe billing it
//   · coach-business (pending SQL): a monthly plan a client pays the coach (CoachSale ACTIVE), or one the person pays a
//     coach; a checkout still open on either side
// A table that is not created yet is skipped (the feature is off, so it cannot hold an obligation).
//
// Raw SQL with the account id as the bound parameter $1 (and `now` as $2 where a statement needs it), like ./rights.ts.

import { needsGuardian } from '@/lib/consent/guardianGate';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { presentSchema } from './rights';

export type ObligationCode =
  | 'coach-bookings'
  | 'client-bookings'
  | 'payouts'
  | 'subscription'
  | 'coach-plans-sold'
  | 'coach-plans-bought';

export interface Obligation {
  code: ObligationCode;
  count: number;
}

export type DeleteBlock =
  | { kind: 'minor' }
  | { kind: 'age-unknown' }
  | { kind: 'obligations'; items: Obligation[] };

/** A booking still owed or with money in flight (status words: lib/coach-store/myBookings.ts). */
const OPEN_BOOKING = (who: 'coachUserId' | 'clientUserId') =>
  `SELECT count(*)::int AS n FROM "Booking" WHERE "${who}" = $1 AND (`
  + `"status" IN ('REFUND_DUE', 'DISPUTED')`
  + ` OR ("status" = 'PAID' AND "deliveredAt" IS NULL AND ("endsAt" IS NULL OR "endsAt" > $2))`
  + ` OR ("status" = 'HELD' AND "holdExpiresAt" > $2))`;

interface Check {
  code: ObligationCode;
  table: string;
  /** Columns the statement names; a missing one skips the check, like a missing table. */
  cols: string[];
  sql: string;
  /** Binds `now` as $2. Postgres refuses a parameter the statement does not use, so only these get it. */
  withNow: boolean;
}

/** Every obligation check, in the order the list shows them. Exported for the tests. */
export const OBLIGATION_CHECKS: readonly Check[] = [
  { code: 'coach-bookings', table: 'Booking', cols: ['coachUserId', 'status', 'deliveredAt', 'endsAt', 'holdExpiresAt'], sql: OPEN_BOOKING('coachUserId'), withNow: true },
  { code: 'client-bookings', table: 'Booking', cols: ['clientUserId', 'status', 'deliveredAt', 'endsAt', 'holdExpiresAt'], sql: OPEN_BOOKING('clientUserId'), withNow: true },
  {
    code: 'payouts', table: 'PayoutRequest', cols: ['userId', 'status'],
    sql: `SELECT count(*)::int AS n FROM "PayoutRequest" WHERE "userId" = $1 AND "status"::text IN ('PENDING', 'PROCESSING')`, withNow: false,
  },
  {
    code: 'subscription', table: 'Subscription', cols: ['userId', 'status', 'cancelAtPeriodEnd'],
    sql: `SELECT count(*)::int AS n FROM "Subscription" WHERE "userId" = $1 AND "status"::text IN ('ACTIVE', 'PAST_DUE', 'INCOMPLETE') AND "cancelAtPeriodEnd" = false`, withNow: false,
  },
  {
    code: 'coach-plans-sold', table: 'CoachSale', cols: ['coachId', 'status', 'holdExpiresAt'],
    sql: `SELECT count(*)::int AS n FROM "CoachSale" WHERE "coachId" = $1 AND ("status" = 'ACTIVE' OR ("status" = 'PENDING' AND "holdExpiresAt" > $2))`, withNow: true,
  },
  {
    code: 'coach-plans-bought', table: 'CoachSale', cols: ['buyerId', 'status', 'holdExpiresAt'],
    sql: `SELECT count(*)::int AS n FROM "CoachSale" WHERE "buyerId" = $1 AND ("status" = 'ACTIVE' OR ("status" = 'PENDING' AND "holdExpiresAt" > $2))`, withNow: true,
  },
];

/** What still has to be settled before this account can be deleted. Empty: nothing. */
export async function openObligations(db: RawDb, userId: string, now: Date = new Date()): Promise<Obligation[]> {
  const schema = await presentSchema(db);
  const out: Obligation[] = [];
  for (const c of OBLIGATION_CHECKS) {
    const cols = schema.get(c.table);
    if (!cols || !c.cols.every((x) => cols.has(x))) continue;
    const rows = await db.$queryRawUnsafe<{ n: number | bigint }[]>(c.sql, ...(c.withNow ? [userId, now] : [userId]));
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) out.push({ code: c.code, count: n });
  }
  return out;
}

/** The age rule alone: under 18 → 'minor', no birth year → 'age-unknown' (needsGuardian's blank-as-minor), else null. */
export function ageBlock(dobYear: number | null | undefined, now: Date = new Date()): DeleteBlock | null {
  if (dobYear == null) return { kind: 'age-unknown' };
  return needsGuardian(dobYear, now) ? { kind: 'minor' } : null;
}

/** Why this account cannot be deleted in the app right now, or null when it can. The age rule is checked first. */
export async function deleteBlock(db: RawDb, userId: string, dobYear: number | null | undefined, now: Date = new Date()): Promise<DeleteBlock | null> {
  const age = ageBlock(dobYear, now);
  if (age) return age;
  const items = await openObligations(db, userId, now);
  return items.length ? { kind: 'obligations', items } : null;
}
