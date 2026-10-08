/**
 * lib/coach-store/reconcile.ts — STORE-READY B8: bring FEL in line with Stripe for the paid checkouts nobody
 * came back from, and for Dashboard refunds and disputes — with NO webhook. One authed route
 * (app/api/coach-store/reconcile) runs this on a schedule; there is no scheduler/cron/infra in this PR.
 *
 * Pass 1 (checkouts): Bookings HELD|EXPIRED and ProgramAccess PENDING with a stripeCheckoutId touched in the
 *   last 24 h are retrieved (expand payment_intent). The window is bounded on `updatedAt`, not `createdAt`: the
 *   checkout id is written AFTER the row exists (lib/coach-store/checkout.ts), so `updatedAt` is the "a checkout
 *   happened recently" signal — a row created 25 h ago but re-bought a minute ago is still found. A paid session
 *   fulfils through the SAME B6 fulfilment (incl. the past-start limit); an expired session flips a still-HELD
 *   booking to EXPIRED (slotLock null) and a still-PENDING access to EXPIRED (codeActive false), each by status-CAS.
 * Pass 2 (refunds):   refunds.list(created >= now-7d, limit 100, auto-paginated — EVERY refund in the window,
 *   not just the first page), status 'succeeded'. The charge is retrieved and acted on ONLY when
 *   charge.refunded === true (a partial refund is a log line, no row move). A matching PAID|REFUND_DUE|CANCELLED
 *   booking -> REFUNDED (slotLock null); an ACTIVE|PAST_DUE|PAUSED access -> REFUNDED (codeActive false); a
 *   PENDING|PAYABLE referral on the row (sourceId) -> REVERSED.
 * Pass 3 (disputes):  disputes.list(created >= now-120d, limit 100, auto-paginated). An open dispute
 *   (warning_needs_response, warning_under_review, needs_response, under_review) -> Booking DISPUTED, access
 *   PAUSED + codeActive false, referral REVERSED. lost -> as a full refund. won -> restore ONLY rows still
 *   DISPUTED/PAUSED to PAID/ACTIVE.
 * Pass 4 (subscriptions, B9, fixed by the B9 follow-up): subscriptions.list(status 'all', auto-paginated —
 *   EVERY subscription, not just the first 100) syncs each membership row by stripeSubscriptionId
 *   (active/trialing -> ACTIVE, past_due/incomplete -> PAST_DUE still open, unpaid -> EXPIRED access OFF,
 *   canceled/incomplete_expired -> CANCELED, accessUntil = period end, status-CAS so a replay never moves a
 *   row backwards and a PAUSED dispute hold is NEVER lifted here). A Dashboard refund/dispute on a
 *   subscription RENEWAL lands on the renewal invoice's PaymentIntent, not the row's stored one, so Passes 2-3
 *   also map payment_intent -> invoice (in the window) -> subscription -> access row.
 *
 * Every row's error is caught, counted and logged by FEL row id; the run continues. Only counts are returned.
 * No emails, amounts, or Stripe ids are logged — only FEL row ids.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { verifyIdempotencyKey, isPaidSession } from '@/lib/stripe/verify-checkout';
import { coachStoreSessionMeta, fulfilCoachStoreCheckout } from './webhook';
import { invoiceChargeOrIntent, invoiceSubscriptionId, subscriptionPeriodEndUnix } from './stripeShapes';

export const RECONCILE_SECRET_HEADER = 'x-coach-store-reconcile-secret';
const OPEN_DISPUTE_STATUSES = new Set(['warning_needs_response', 'warning_under_review', 'needs_response', 'under_review']);

/** Constant-time secret check, modelled on lib/arena-reclaim.ts verifyReclaimSecret. */
export function verifyReconcileSecret(presented: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || typeof presented !== 'string' || !presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export interface ReconcileCounts {
  ok: boolean;
  checked: number;
  fulfilled: number;
  refundDue: number;
  expired: number;
  refunded: number;
  disputed: number;
  restored: number;
  errors: number;
  skipped?: 'payments_not_set_up';
  // B9 (Pass 4) — added by that item; present here so the shape is stable.
  subscriptionsChecked?: number;
  renewed?: number;
  paused?: number;
  canceled?: number;
}

function zeroCounts(): ReconcileCounts {
  return { ok: true, checked: 0, fulfilled: 0, refundDue: 0, expired: 0, refunded: 0, disputed: 0, restored: 0, errors: 0 };
}

function paymentIntentIdOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === 'string' ? pi : pi?.id ?? null;
}

/** Reverse one resolved coach-store row for a refund or dispute, status-CAS. Referrals on the row reverse too. */
async function reverseRow(input: {
  booking?: { id: string; status: string } | null;
  access?: { id: string; status: string } | null;
  dispute: boolean;
}): Promise<boolean> {
  const { booking, access, dispute } = input;
  let changed = false;
  if (booking) {
    const moved = await prisma.booking.updateMany({
      where: { id: booking.id, status: { in: ['PAID', 'REFUND_DUE', 'CANCELLED'] } },
      data: { status: dispute ? 'DISPUTED' : 'REFUNDED', slotLock: null },
    });
    if (moved.count > 0) changed = true;
  }
  if (access) {
    const moved = await prisma.programAccess.updateMany({
      where: { id: access.id, status: { in: ['ACTIVE', 'PAST_DUE', 'PAUSED'] } },
      data: { status: dispute ? 'PAUSED' : 'REFUNDED', codeActive: false },
    });
    if (moved.count > 0) changed = true;
  }
  const sourceId = booking?.id ?? access?.id;
  if (sourceId && changed) {
    await prisma.coachStoreReferral.updateMany({
      where: { sourceId, status: { in: ['PENDING', 'PAYABLE'] } },
      data: { status: 'REVERSED' },
    });
  }
  return changed;
}

/** A won dispute restores only a row still DISPUTED (booking) / PAUSED (access). */
async function restoreRow(input: { booking?: { id: string } | null; access?: { id: string } | null }): Promise<boolean> {
  let changed = false;
  if (input.booking) {
    const moved = await prisma.booking.updateMany({ where: { id: input.booking.id, status: 'DISPUTED' }, data: { status: 'PAID' } });
    if (moved.count > 0) changed = true;
  }
  if (input.access) {
    const moved = await prisma.programAccess.updateMany({ where: { id: input.access.id, status: 'PAUSED' }, data: { status: 'ACTIVE', codeActive: true } });
    if (moved.count > 0) changed = true;
  }
  return changed;
}

type RowRef = { id: string; status: string };

async function findByPaymentIntent(piId: string): Promise<{ booking: RowRef | null; access: RowRef | null }> {
  const booking = await prisma.booking.findUnique({ where: { stripePaymentIntentId: piId }, select: { id: true, status: true } });
  if (booking) return { booking, access: null };
  const access = await prisma.programAccess.findUnique({ where: { stripePaymentIntentId: piId }, select: { id: true, status: true } });
  return { booking: null, access };
}

/**
 * STORE-READY B9: a Dashboard refund/dispute on a subscription RENEWAL never lands on the access row's
 * stored PaymentIntent — that PI is the first month. The renewal's PI belongs to the renewal INVOICE, which
 * names its subscription (basil: parent.subscription_details.subscription; older: subscription). Map
 * payment_intent -> invoice (in the refund/dispute lookback window) -> subscription -> access row.
 */
async function findAccessByRenewalPaymentIntent(stripe: Stripe, piId: string, sinceUnix: number): Promise<RowRef | null> {
  let invoices: Stripe.ApiList<Stripe.Invoice>;
  try {
    invoices = await stripe.invoices.list({ created: { gte: sinceUnix }, limit: 100 });
  } catch {
    return null; // the invoice list itself failing must not fail the whole run
  }
  for (const invoice of invoices.data) {
    const { paymentIntentId, chargeId } = invoiceChargeOrIntent(invoice);
    if (paymentIntentId !== piId && chargeId !== piId) continue;
    const subId = invoiceSubscriptionId(invoice);
    if (!subId) continue;
    const access = await prisma.programAccess.findFirst({
      where: { stripeSubscriptionId: subId },
      select: { id: true, status: true },
    });
    if (access) return access;
  }
  return null;
}

/** A row lookup that also resolves a renewal PI through its invoice's subscription (B9 Pass 4 mapping). */
async function findRowForRefundOrDispute(
  stripe: Stripe,
  piId: string,
  invoiceSinceUnix: number,
): Promise<{ booking: RowRef | null; access: RowRef | null }> {
  const direct = await findByPaymentIntent(piId);
  if (direct.booking || direct.access) return direct;
  const access = await findAccessByRenewalPaymentIntent(stripe, piId, invoiceSinceUnix);
  return { booking: null, access };
}

/**
 * STORE-READY B9 Pass 4, corrected by the B9 follow-up (FE PM 5:48/5:51 PM PT Oct 7): bring one
 * subscription's ProgramAccess row in line with Stripe. Status-CAS on the current row so a replay or a
 * later state never moves a row backwards — and a PAUSED row (the dispute hold Passes 2-3 set) is NEVER
 * in a CAS set here, so Pass 4 writes nothing to it whatever the Stripe status (only Pass 3 won/lost and
 * Pass 2 full-refund move a hold):
 *   active | trialing             -> ACTIVE  (codeActive true),  accessUntil = period end   ('renewed')
 *   past_due | incomplete          -> PAST_DUE (codeActive true, still open), period end     ('paused')
 *   unpaid                         -> EXPIRED (codeActive false — access turns OFF; NEVER the PAUSED
 *                                    dispute hold), CAS from ACTIVE|PAST_DUE|PENDING         ('paused')
 *   canceled | incomplete_expired  -> CANCELED (codeActive false)                            ('canceled')
 * A row already CANCELED is not re-opened; a REFUNDED row (a refund already ran) is left to Passes 2-3.
 * Returns the bucket it moved to, or null when the row was already in sync / not found.
 */
async function syncSubscriptionRow(sub: Stripe.Subscription): Promise<'renewed' | 'paused' | 'canceled' | null> {
  const access = await prisma.programAccess.findFirst({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true, status: true },
  });
  if (!access) return null;
  const endUnix = subscriptionPeriodEndUnix(sub);
  const periodEnd = endUnix != null ? new Date(endUnix * 1000) : null;
  const status = sub.status;
  if (status === 'active' || status === 'trialing') {
    const moved = await prisma.programAccess.updateMany({
      // PAUSED is deliberately NOT here: Pass 4 never lifts a dispute hold (B9 fix 3). EXPIRED is: a row
      // whose unpaid subscription recovered re-opens (B9 fix 6).
      where: { id: access.id, status: { in: ['ACTIVE', 'PAST_DUE', 'EXPIRED', 'PENDING'] } },
      data: {
        status: 'ACTIVE', codeActive: true,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        ...(periodEnd ? { accessUntil: periodEnd } : {}),
      },
    });
    // Counted as a renewal only when the row actually came back to life (not a no-op ACTIVE->ACTIVE sync).
    return moved.count > 0 && access.status !== 'ACTIVE' ? 'renewed' : null;
  }
  if (status === 'past_due' || status === 'incomplete') {
    const moved = await prisma.programAccess.updateMany({
      where: { id: access.id, status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] } },
      data: { status: 'PAST_DUE', codeActive: true, ...(periodEnd ? { accessUntil: periodEnd } : {}) },
    });
    return moved.count > 0 ? 'paused' : null;
  }
  if (status === 'unpaid') {
    // B9 fix 6 (FE PM 5:51 PM PT): unpaid turns access OFF — EXPIRED, codeActive false; past_due (above)
    // stays PAST_DUE with access ON. Never PAUSED: that is the dispute hold fix 3 protects.
    const moved = await prisma.programAccess.updateMany({
      where: { id: access.id, status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] } },
      data: { status: 'EXPIRED', codeActive: false, ...(periodEnd ? { accessUntil: periodEnd } : {}) },
    });
    return moved.count > 0 ? 'paused' : null;
  }
  if (status === 'canceled' || status === 'incomplete_expired') {
    const moved = await prisma.programAccess.updateMany({
      // PAUSED is deliberately excluded here too: a canceled subscription must not touch a dispute hold.
      where: { id: access.id, status: { notIn: ['CANCELED', 'REFUNDED', 'PAUSED'] } },
      data: { status: 'CANCELED', codeActive: false, cancelAtPeriodEnd: true, ...(periodEnd ? { accessUntil: periodEnd } : {}) },
    });
    return moved.count > 0 ? 'canceled' : null;
  }
  return null;
}

export async function reconcileCoachStore(input: { now: Date; stripe: Stripe }): Promise<ReconcileCounts> {
  const { now, stripe } = input;
  const counts = zeroCounts();

  // ── Pass 1: checkouts nobody came back from (last 24 h) ────────────────────────────────────────────────────
  // Bounded on updatedAt: stripeCheckoutId is written after the row exists, so updatedAt is the recent-checkout
  // signal. A row created outside the window but re-bought inside it (B5) is still found; a row whose checkout
  // is older than 24 h has already been swept by the hold-expiry sweep and is left alone.
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['HELD', 'EXPIRED'] }, stripeCheckoutId: { not: null }, updatedAt: { gte: dayAgo } },
    select: { id: true, status: true, stripeCheckoutId: true },
  });
  const accesses = await prisma.programAccess.findMany({
    where: { status: 'PENDING', stripeCheckoutId: { not: null }, updatedAt: { gte: dayAgo } },
    select: { id: true, status: true, stripeCheckoutId: true },
  });

  for (const row of [...bookings.map((b) => ({ kind: 'booking' as const, ...b })), ...accesses.map((a) => ({ kind: 'access' as const, ...a }))]) {
    counts.checked++;
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId!, { expand: ['payment_intent'] });
      if (isPaidSession(session)) {
        const meta = coachStoreSessionMeta(session) ?? {
          product: 'COACH_STORE', rowId: row.id,
          kind: row.kind === 'booking' ? 'live_1on1' : 'program', beneficiary: 'self',
        } as Record<string, string>;
        const outcome = await fulfilCoachStoreCheckout(session, { ...meta, rowId: row.id }, verifyIdempotencyKey(session.id));
        if (outcome === 'refund_due') counts.refundDue++;
        else counts.fulfilled++;
      } else if (session.status === 'expired') {
        if (row.kind === 'booking') {
          const moved = await prisma.booking.updateMany({ where: { id: row.id, status: 'HELD' }, data: { status: 'EXPIRED', slotLock: null } });
          if (moved.count > 0) counts.expired++;
        } else {
          const moved = await prisma.programAccess.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'EXPIRED', codeActive: false } });
          if (moved.count > 0) counts.expired++;
        }
      }
    } catch (err) {
      counts.errors++;
      console.warn(`[coach-store] reconcile pass1 row=${row.id}`);
    }
  }

  // ── Pass 2: refunds (Dashboard-issued) ──────────────────────────────────────────────────────────────────────
  // B9 fix 5: auto-pagination reads EVERY refund in the window, not just the first 100. A failed page fetch
  // counts one error and ends the pass (rows already reversed stay reversed).
  try {
    for await (const refund of stripe.refunds.list({ created: { gte: Math.floor((now.getTime() - 7 * 86_400_000) / 1000) }, limit: 100 })) {
      if (refund.status !== 'succeeded') continue;
      try {
        const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
        if (!chargeId) continue;
        const charge = await stripe.charges.retrieve(chargeId);
        if (!charge || charge.refunded !== true) {
          // A partial refund is a log line only — no row moves.
          console.warn(`[coach-store] reconcile partial-refund charge=${chargeId} (partial, no row moved)`);
          continue;
        }
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (!piId) continue;
        // B9: a renewal refund's PI is not on the row — resolve it through its invoice's subscription.
        const { booking, access } = await findRowForRefundOrDispute(
          stripe, piId, Math.floor((now.getTime() - 7 * 86_400_000) / 1000),
        );
        if (!booking && !access) continue;
        const moved = await reverseRow({ booking, access, dispute: false });
        if (moved) counts.refunded++;
      } catch (err) {
        counts.errors++;
        console.warn('[coach-store] reconcile pass2 refund row error');
      }
    }
  } catch (err) {
    counts.errors++;
    console.warn('[coach-store] reconcile pass2 list failed');
  }

  // ── Pass 3: disputes ─────────────────────────────────────────────────────────────────────────────────────────
  // B9 fix 5: auto-pagination reads EVERY dispute in the window, not just the first 100. A failed page fetch
  // counts one error and ends the pass (rows already moved stay moved).
  try {
    for await (const dispute of stripe.disputes.list({ created: { gte: Math.floor((now.getTime() - 120 * 86_400_000) / 1000) }, limit: 100 })) {
      try {
        const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
        if (!piId) continue;
        // B9: a renewal dispute's PI is not on the row — resolve it through its invoice's subscription.
        const { booking, access } = await findRowForRefundOrDispute(
          stripe, piId, Math.floor((now.getTime() - 120 * 86_400_000) / 1000),
        );
        if (!booking && !access) continue;
        if (OPEN_DISPUTE_STATUSES.has(dispute.status)) {
          const moved = await reverseRow({ booking, access, dispute: true });
          if (moved) counts.disputed++;
        } else if (dispute.status === 'lost') {
          const moved = await reverseRow({ booking, access, dispute: false });
          if (moved) counts.refunded++;
        } else if (dispute.status === 'won') {
          const moved = await restoreRow({ booking, access });
          if (moved) counts.restored++;
        }
      } catch (err) {
        counts.errors++;
        console.warn('[coach-store] reconcile pass3 dispute row error');
      }
    }
  } catch (err) {
    counts.errors++;
    console.warn('[coach-store] reconcile pass3 list failed');
  }

  // ── Pass 4 (B9): subscription sync ──────────────────────────────────────────────────────────────────────────
  // Memberships sell at launch (Option B). status 'all' lists canceled subscriptions too, so a member who
  // cancelled mid-window is synced here by the access row still pointing at the now-canceled subscription.
  // B9 fix 4: auto-pagination reads EVERY subscription, not just the first 100. A failed page fetch counts
  // one error and ends Pass 4 (rows already synced stay synced).
  try {
    for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
      try {
        const moved = await syncSubscriptionRow(sub);
        counts.subscriptionsChecked = (counts.subscriptionsChecked ?? 0) + 1;
        if (moved === 'renewed') counts.renewed = (counts.renewed ?? 0) + 1;
        else if (moved === 'paused') counts.paused = (counts.paused ?? 0) + 1;
        else if (moved === 'canceled') counts.canceled = (counts.canceled ?? 0) + 1;
      } catch (err) {
        counts.errors++;
        console.warn('[coach-store] reconcile pass4 subscription row error');
        void err;
      }
    }
  } catch (err) {
    counts.errors++;
    console.warn('[coach-store] reconcile pass4 list failed');
    void err;
  }

  return counts;
}

export { paymentIntentIdOf };
