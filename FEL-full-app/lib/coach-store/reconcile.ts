/**
 * lib/coach-store/reconcile.ts — STORE-READY B8: bring FEL in line with Stripe for the paid checkouts nobody
 * came back from, and for Dashboard refunds and disputes — with NO webhook. One authed route
 * (app/api/coach-store/reconcile) runs this on a schedule; there is no scheduler/cron/infra in this PR.
 *
 * Pass 1 (checkouts): Bookings HELD|EXPIRED and ProgramAccess PENDING with a stripeCheckoutId created in the
 *   last 24 h are retrieved (expand payment_intent). A paid session fulfils through the SAME B6 fulfilment
 *   (incl. the past-start limit); an expired session flips a still-HELD booking to EXPIRED (slotLock null) and a
 *   still-PENDING access to EXPIRED (codeActive false), each by status-CAS.
 * Pass 2 (refunds):   refunds.list(created >= now-7d, limit 100, auto-paginated), status 'succeeded'. The charge
 *   is retrieved and acted on ONLY when charge.refunded === true (a partial refund is a log line, no row move).
 *   A matching PAID|REFUND_DUE|CANCELLED booking -> REFUNDED (slotLock null); an ACTIVE|PAST_DUE|PAUSED access
 *   -> REFUNDED (codeActive false); a PENDING|PAYABLE referral on the row (sourceId) -> REVERSED.
 * Pass 3 (disputes):  disputes.list(created >= now-120d, limit 100). An open dispute (warning_needs_response,
 *   warning_under_review, needs_response, under_review) -> Booking DISPUTED, access PAUSED + codeActive false,
 *   referral REVERSED. lost -> as a full refund. won -> restore ONLY rows still DISPUTED/PAUSED to PAID/ACTIVE.
 *
 * Every row's error is caught, counted and logged by FEL row id; the run continues. Only counts are returned.
 * No emails, amounts, or Stripe ids are logged — only FEL row ids. B9 adds Pass 4 (subscriptions).
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { verifyIdempotencyKey, isPaidSession } from '@/lib/stripe/verify-checkout';
import { coachStoreSessionMeta, fulfilCoachStoreCheckout } from './webhook';

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

export async function reconcileCoachStore(input: { now: Date; stripe: Stripe }): Promise<ReconcileCounts> {
  const { now, stripe } = input;
  const counts = zeroCounts();

  // ── Pass 1: checkouts nobody came back from (last 24 h) ────────────────────────────────────────────────────
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['HELD', 'EXPIRED'] }, stripeCheckoutId: { not: null }, createdAt: { gte: dayAgo } },
    select: { id: true, status: true, stripeCheckoutId: true },
  });
  const accesses = await prisma.programAccess.findMany({
    where: { status: 'PENDING', stripeCheckoutId: { not: null }, createdAt: { gte: dayAgo } },
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
  try {
    const refunds = await stripe.refunds.list({ created: { gte: Math.floor((now.getTime() - 7 * 86_400_000) / 1000) }, limit: 100 });
    for (const refund of refunds.data) {
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
        const { booking, access } = await findByPaymentIntent(piId);
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
  try {
    const disputes = await stripe.disputes.list({ created: { gte: Math.floor((now.getTime() - 120 * 86_400_000) / 1000) }, limit: 100 });
    for (const dispute of disputes.data) {
      try {
        const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
        if (!piId) continue;
        const { booking, access } = await findByPaymentIntent(piId);
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

  return counts;
}

export { paymentIntentIdOf };
