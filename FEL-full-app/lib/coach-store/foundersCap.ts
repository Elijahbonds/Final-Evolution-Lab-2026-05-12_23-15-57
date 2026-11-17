/**
 * FOUNDERS-CAP-1 (Cyber COACH-STORE-CHECKOUT-SIGNOFF 2026-11-03, L2; PM ruling + Cyber review 2026-11-10): the server cap
 * on the Founders spots. Until now FOUNDERS_SPOTS (./storeOffers) was copy only. Behind FOUNDERS_CAP_ENABLED (lib/flags.ts,
 * default OFF): with the flag unset nothing here runs and checkout/fulfilment behave exactly as before.
 *
 * Which listing is Founders (Cyber M1): the ONE listing whose itemKey is FOUNDERS_ITEM_KEY — Elijah's adult monthly
 * membership, `itemKeyFor()` of the Founders manifest under his store slug. MarketplaceListing.itemKey is @unique, so at
 * most one row carries it; no other adult membership (another coach's, or a second one of Elijah's under a different key)
 * is capped, and the lock and the count are keyed on the itemKey, never on a listing id. No schema change.
 *
 * What holds a spot: ACTIVE, PAST_DUE and PAUSED rows, and a PENDING one whose checkout can still be paid (touched within
 * HOLD_MINUTES, which outlasts the Stripe session's CHECKOUT_EXPIRE_MINUTES).
 *   - PAUSED (a dispute) HOLDS its spot (PM ruling + Cyber H2/Q1, 2026-11-10): a dispute can be won and the member restored
 *     to ACTIVE (lib/coach-store/reconcile.ts restoreRow), and invoice.paid revives PAUSED too; had the spot been freed
 *     meanwhile we would end at 11.
 *   - Refund, cancel and expiry DO free the spot (PM ruling on L2, 2026-11-10): a row that ends REFUNDED (charge.refunded /
 *     a lost dispute), CANCELED (customer.subscription.deleted) or EXPIRED (checkout.session.expired, or a failed session)
 *     holds none. REFUND_DUE (a paid checkout over the cap) holds none either — that buyer is refunded, never a member.
 *
 * Race safety, the pattern of lib/coach-business/store.ts holdSpot: ONE transaction takes a Postgres advisory lock keyed
 * on the Founders itemKey, counts the held spots, and writes the claim, all before any Stripe session exists. Two
 * checkouts serialize on the lock, so the 11th always sees the 10 claims ahead of it. Every path that can make a Founders
 * row ACTIVE (checkout.session.completed, invoice.paid, reconcile Pass 4) claims through withFoundersSpot.
 *
 * Payment Links (Cyber M2/Q4, Cyber to rule): Founders must NOT be sold via a Stripe Payment Link while FOUNDERS_CAP_ENABLED
 * is on — a Payment Link sale never passes this cap (its own limit counts separately, so totals could reach 20). One sales
 * path. There is no Payment Link code in this app; the live link is deactivated in the Stripe Dashboard (AM, on Elijah's word).
 */
import type Stripe from 'stripe';
import { itemKeyFor } from './manifest';
import { HOLD_MINUTES } from './constants';
import { FOUNDERS_SPOTS } from './storeOffers';
import { ELIJAH_COACH_STORE_SLUG } from '@/lib/creator/coachStoreHrefs';

/** The Founders listing's itemKey: `coach-store:elijahbonds:membership:adult:month`. */
export const FOUNDERS_ITEM_KEY = itemKeyFor({ kind: 'membership', audience: 'adult', interval: 'month' }, ELIJAH_COACH_STORE_SLUG);

export function isFoundersItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === FOUNDERS_ITEM_KEY;
}

/** Statuses that hold a spot outright (PAUSED: see the header — a dispute may be won). PENDING holds one only while payable. */
export const FOUNDERS_HELD_STATUSES = ['ACTIVE', 'PAST_DUE', 'PAUSED'] as const;
/** Statuses a Founders row never leaves for ACTIVE under the cap (H1): the buyer is being refunded, was refunded, or left. */
export const FOUNDERS_CLOSED_STATUSES = ['REFUND_DUE', 'REFUNDED', 'CANCELED'] as const;
/** The refund window Cyber Q3 sets for a REFUND_DUE row. */
export const FOUNDERS_REFUND_DUE_HOURS = 48;

export function pendingFreshSince(now: Date): Date {
  return new Date(now.getTime() - HOLD_MINUTES * 60_000);
}

/** The Prisma where clause for the rows that hold a Founders spot on these listings, leaving out the row `exceptId`. */
export function heldSpotsWhere(listingIds: string[], now: Date, exceptId?: string | null, includePending = true) {
  return {
    listingId: { in: listingIds },
    ...(exceptId ? { id: { not: exceptId } } : {}),
    OR: [
      { status: { in: [...FOUNDERS_HELD_STATUSES] } },
      ...(includePending ? [{ status: 'PENDING', updatedAt: { gt: pendingFreshSince(now) } }] : []),
    ],
  };
}

// pg_advisory_xact_lock returns void, which Prisma cannot deserialize: select a constant FROM it instead
// (lib/coach-business/store.ts lockPackage). The lock is released when the transaction ends.
const LOCK_SQL = 'SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext($1))';

export function foundersLockKey(itemKey: string = FOUNDERS_ITEM_KEY): string {
  return `founders-cap:${itemKey}`;
}

type ListingReader = { marketplaceListing: { findMany(args: any): Promise<Array<{ id: string }>> } };
type CountReader = { programAccess: { count(args: { where: Record<string, unknown> }): Promise<number> } };

/** The listing ids carrying the Founders itemKey (one row while itemKey is unique). */
export async function foundersListingIds(db: ListingReader): Promise<string[]> {
  const rows = await db.marketplaceListing.findMany({ where: { itemKey: FOUNDERS_ITEM_KEY }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Unlocked count of held spots (checkout's cheap early read; the locked count in withFoundersSpot decides). */
export async function foundersHeldCount(
  db: ListingReader & CountReader,
  input: { now: Date; exceptUserId?: string; includePending?: boolean },
): Promise<number> {
  const ids = await foundersListingIds(db);
  const where = heldSpotsWhere(ids, input.now, null, input.includePending ?? true);
  return db.programAccess.count({ where: input.exceptUserId ? { ...where, userId: { not: input.exceptUserId } } : where });
}

export interface CapDb {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export type SpotClaim<T> = { ok: true; value: T; taken: number } | { ok: false; reason: 'sold_out'; taken: number };

/**
 * Lock the Founders itemKey, count the spots held by OTHER rows (`exceptId` is the row the claim writes), and run
 * `claim(tx)` only when one is free. `claim` must write through `tx` so the count and the write commit together.
 */
export async function withFoundersSpot<T>(
  db: CapDb,
  input: { now: Date; exceptId?: string | null; includePending?: boolean; spots?: number },
  claim: (tx: any) => Promise<T>,
): Promise<SpotClaim<T>> {
  const spots = input.spots ?? FOUNDERS_SPOTS;
  return db.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(LOCK_SQL, foundersLockKey());
    const ids = await foundersListingIds(tx);
    const taken = await tx.programAccess.count({
      where: heldSpotsWhere(ids, input.now, input.exceptId, input.includePending ?? true),
    });
    if (taken >= spots) return { ok: false as const, reason: 'sold_out' as const, taken };
    return { ok: true as const, value: await claim(tx), taken };
  });
}

/** True when the listing is the Founders one (by itemKey). One read; a missing listing is not Founders. */
export async function isFoundersListing(
  db: { marketplaceListing: { findUnique(args: { where: { id: string }; select: { itemKey: true } }): Promise<{ itemKey: string } | null> } },
  listingId: string,
): Promise<boolean> {
  const row = await db.marketplaceListing.findUnique({ where: { id: listingId }, select: { itemKey: true } });
  return !!row && isFoundersItemKey(row.itemKey);
}

/**
 * Cancel the over-cap buyer's subscription at once (H1), so the 11th is never billed again. Idempotent: an already
 * canceled (or missing) subscription is left alone, and the cancel call carries a fixed idempotency key. A Stripe
 * error propagates, so a webhook delivery is retried (the row is already REFUND_DUE, so a retry only re-runs this).
 */
export async function cancelFoundersSubscription(stripe: Stripe, subscriptionId: string): Promise<'canceled' | 'already'> {
  let sub: Stripe.Subscription | null = null;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if ((err as { code?: string }).code === 'resource_missing') return 'already';
    throw err;
  }
  if (!sub || sub.status === 'canceled' || sub.status === 'incomplete_expired') return 'already';
  await stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey: `founders-cap:cancel:${subscriptionId}` });
  return 'canceled';
}

/**
 * Move a paid Founders row that lost the cap to REFUND_DUE (status-CAS from `from`; a row already REFUND_DUE keeps it),
 * store its subscription id, and cancel that subscription. No sale and no referral are posted for it. Logs the FEL row id
 * only. The durable list is the rows themselves (listFoundersRefundDue).
 */
export async function markFoundersRefundDue(
  db: { programAccess: { updateMany(args: any): Promise<{ count: number }> } },
  stripe: Stripe,
  input: { accessId: string; from: readonly string[]; subscriptionId?: string | null; source: string },
): Promise<void> {
  if (input.from.length > 0) {
    await db.programAccess.updateMany({
      where: { id: input.accessId, status: { in: [...input.from] } },
      data: { status: 'REFUND_DUE', codeActive: false, ...(input.subscriptionId ? { stripeSubscriptionId: input.subscriptionId } : {}) },
    });
  }
  if (input.subscriptionId) await cancelFoundersSubscription(stripe, input.subscriptionId);
  console.warn(`[coach-store] founders_cap_full row=${input.accessId} source=${input.source} outcome=refund_due`);
}

/**
 * FOUNDERS-CAP-1 v3 (PM (c) / Cyber V3): a failure inside the Founders cap path (the lock, the count, the subscription
 * cancel). The webhook lets it throw so Stripe retries; the verify-session path (lib/stripe/verify-checkout.ts) catches
 * ONLY this error and answers the buyer a normal state instead of a 500. The message carries the stage, never Stripe or
 * buyer detail; the original error is kept on `original`.
 */
export class FoundersCapError extends Error {
  readonly stage: string;
  readonly original: unknown;
  constructor(stage: string, cause: unknown) {
    super(`founders_cap_step_failed stage=${stage}`);
    this.name = 'FoundersCapError';
    this.stage = stage;
    this.original = cause;
  }
}

/** Run one Founders-cap step, re-throwing any failure as a FoundersCapError (never double-wrapped). */
export async function foundersStep<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw err instanceof FoundersCapError ? err : new FoundersCapError(stage, err);
  }
}

/** Stripe subscription statuses that can still bill (Cyber V2). */
export const FOUNDERS_BILLING_SUB_STATUSES = ['active', 'trialing', 'past_due'] as const;

export interface FoundersRefundDueRow {
  id: string;
  listingId: string;
  userId: string;
  priceCents: number;
  stripeCheckoutId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  since: Date;
  refundBy: Date;
  overdue: boolean;
}

/**
 * Cyber Q3: the durable, admin-visible list of Founders buyers owed a refund — the ProgramAccess rows themselves (status
 * REFUND_DUE on the Founders listing), oldest first, each with its 48 h refund-by time. No new table: the row stays
 * REFUND_DUE until the refund lands (charge.refunded / reconcile Pass 2 move it to REFUNDED, which drops it off the list).
 * `since` is the row's updatedAt, the time it went REFUND_DUE (nothing else writes a REFUND_DUE row).
 */
export async function listFoundersRefundDue(
  db: ListingReader & { programAccess: { findMany(args: any): Promise<any[]> } },
  now: Date,
): Promise<FoundersRefundDueRow[]> {
  const ids = await foundersListingIds(db);
  if (ids.length === 0) return [];
  const rows = await db.programAccess.findMany({
    where: { listingId: { in: ids }, status: 'REFUND_DUE' },
    select: { id: true, listingId: true, userId: true, priceCents: true, stripeCheckoutId: true, stripeSubscriptionId: true, stripePaymentIntentId: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  });
  return rows.map((r) => {
    const refundBy = new Date(new Date(r.updatedAt).getTime() + FOUNDERS_REFUND_DUE_HOURS * 3_600_000);
    return {
      id: r.id, listingId: r.listingId, userId: r.userId, priceCents: r.priceCents,
      stripeCheckoutId: r.stripeCheckoutId ?? null, stripeSubscriptionId: r.stripeSubscriptionId ?? null,
      stripePaymentIntentId: r.stripePaymentIntentId ?? null,
      since: new Date(r.updatedAt), refundBy, overdue: now.getTime() > refundBy.getTime(),
    };
  });
}
