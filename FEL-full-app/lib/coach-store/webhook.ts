import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { postTransaction } from '@/lib/ledger';
import { getStripe } from '@/lib/stripe';
import { PLATFORM_FEE_RATE } from '@/lib/fees';
import { termsVersionStatus } from '@/lib/store-terms';
import { isVerifiedAdult } from './adult';
import { slotStillFree } from './slotCheck';
import {
  coachStorePostings,
  coachStoreSplit,
  decideReferral,
  nextReviewCredits,
  referralShareOfFee,
  type ReferralSource,
} from './money';
import { invoiceChargeOrIntent, invoiceSubscriptionId, subscriptionPeriodEndUnix } from './stripeShapes';

type Meta = Record<string, string>;

function asMeta(value: unknown): Meta {
  if (!value || typeof value !== 'object') return {};
  const out: Meta = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function coachStoreMeta(event: Stripe.Event): Meta | null {
  const obj = event.data.object as {
    metadata?: unknown;
    parent?: { subscription_details?: { metadata?: unknown } };
    subscription_details?: { metadata?: unknown };
  };
  return coachStoreSessionMeta(obj);
}

/** The coach-store metadata of a Checkout Session (or null when the session is not one). The invoice
 *  shapes (parent/subscription_details metadata) are read by coachStoreMeta above, not here — the
 *  server-verified success path only ever holds a session. */
export function coachStoreSessionMeta(obj: {
  metadata?: unknown;
  parent?: { subscription_details?: { metadata?: unknown } };
  subscription_details?: { metadata?: unknown };
}): Meta | null {
  const meta = {
    ...asMeta(obj.parent?.subscription_details?.metadata),
    ...asMeta(obj.subscription_details?.metadata),
    ...asMeta(obj.metadata),
  };
  if (meta.product !== 'COACH_STORE') return null;
  return meta;
}

/** Fulfilment ignores event.livemode. A test-mode build still records a coach-store event that Stripe marked live, and a live event is not rejected for the rest of the webhook. */
export async function fulfilCoachStore(event: Stripe.Event, idempotencyKey: string): Promise<void> {
  const meta = coachStoreMeta(event);
  if (!meta?.rowId) return;
  if (event.type === 'checkout.session.completed') await onCheckout(event, meta, idempotencyKey);
  else if (event.type === 'checkout.session.expired') await onExpired(meta);
  else if (event.type === 'invoice.paid') await onInvoicePaid(event, meta, idempotencyKey);
  else if (event.type === 'invoice.payment_failed') await onInvoiceFailed(meta);
  else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    await onSubscription(event, meta);
  } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    await onReverse(meta, event.type === 'charge.dispute.created');
  }
}

/**
 * The checkout.session.completed half of fulfilCoachStore, on the session itself rather than the event,
 * so the server-verified success path (SEC-F4 NO-WEBHOOK, lib/stripe/verify-checkout.ts) fulfils a paid
 * coach-store checkout through the SAME code as the webhook. Idempotent the way the webhook is: the
 * HELD→PAID / PENDING→ACTIVE status CAS runs once, and the sale's ledger row is unique on the session's
 * `stripe-session:<id>` key — the caller's idempotency key argument is ignored for this event type
 * (SEC-F4 follow-up 1: one payment, one grant, whichever path — or how many event deliveries — ran).
 */
/** The outcome of one checkout fulfilment (STORE-READY B6): 'refund_due' when a paid booking could not be honoured. */
export type FulfilOutcome = 'fulfilled' | 'refund_due' | 'noop';

export async function fulfilCoachStoreCheckout(
  session: Stripe.Checkout.Session,
  meta: Meta,
  idempotencyKey: string,
): Promise<FulfilOutcome> {
  const termsStatus = termsVersionStatus(session.metadata);
  if (termsStatus !== 'current') console.warn(`[coach-store] terms_version ${termsStatus}`, meta.rowId);
  return onCheckoutSession(session, meta, idempotencyKey);
}

function feeOf(bt: unknown): number {
  if (!bt || typeof bt === 'string' || typeof (bt as { fee?: unknown }).fee !== 'number') {
    throw new Error('stripe fee not ready');
  }
  return (bt as { fee: number }).fee;
}

async function stripeFeeCents(session: Stripe.Checkout.Session): Promise<number> {
  const pi = session.payment_intent;
  const piId = typeof pi === 'string' ? pi : pi?.id;
  if (!piId) return 0;
  return feeFromIds({ paymentIntentId: piId, chargeId: null });
}

async function invoiceFeeCents(invoice: Stripe.Invoice): Promise<number> {
  return feeFromIds(invoiceChargeOrIntent(invoice));
}

async function feeFromIds(ids: { paymentIntentId: string | null; chargeId: string | null }): Promise<number> {
  const stripe = getStripe();
  if (ids.paymentIntentId) {
    const full = await stripe.paymentIntents.retrieve(ids.paymentIntentId, { expand: ['latest_charge.balance_transaction'] });
    const charge = full.latest_charge;
    if (!charge || typeof charge === 'string') throw new Error('stripe fee not ready');
    return feeOf(charge.balance_transaction);
  }
  if (ids.chargeId) {
    const charge = await stripe.charges.retrieve(ids.chargeId, { expand: ['balance_transaction'] });
    return feeOf(charge.balance_transaction);
  }
  throw new Error('stripe fee not ready');
}

async function postSale(idempotencyKey: string, price: number, fee: number, coachUserId: string, rowId: string): Promise<void> {
  const split = coachStoreSplit(price, fee);
  const postings = coachStorePostings(split, coachUserId).map((p) => ({
    account: { type: p.type, currency: 'USD_CENTS' as const, ...(p.userId ? { userId: p.userId } : {}) },
    amount: p.amount,
  }));
  await postTransaction(prisma, {
    kind: 'MARKETPLACE_SALE',
    idempotencyKey,
    currency: 'USD_CENTS',
    enforceNonNegative: false,
    metadata: { product: 'COACH_STORE', rowId },
    postings,
  });
}

async function onCheckout(event: Stripe.Event, meta: Meta, idempotencyKey: string): Promise<FulfilOutcome> {
  return onCheckoutSession(event.data.object as Stripe.Checkout.Session, meta, idempotencyKey);
}

async function onCheckoutSession(session: Stripe.Checkout.Session, meta: Meta, _callerKey: string): Promise<FulfilOutcome> {
  // ONE PAYMENT, ONE GRANT (SEC-F4 follow-up 1): the sale's ledger row is keyed on the Checkout
  // Session id — the same key the server-verified success path (lib/stripe/verify-checkout.ts)
  // fulfils under — never on the Stripe event id, which a redelivery does not keep. Imported
  // lazily so this module never pays for the verify import graph outside this one call.
  const { verifyIdempotencyKey } = await import('@/lib/stripe/verify-checkout');
  const idempotencyKey = verifyIdempotencyKey(session.id);
  const booking = await prisma.booking.findUnique({ where: { id: meta.rowId } });
  if (booking) {
    if (booking.status === 'PAID') {
      await postSale(idempotencyKey, booking.priceCents, booking.stripeFeeCents, booking.coachUserId, booking.id);
      return 'fulfilled';
    }
    if (booking.status === 'REFUND_DUE') {
      // A replay of a session already found refund-due posts nothing again and changes nothing.
      return 'refund_due';
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

    // STORE-READY B6 (F2): a paid booking is never dropped silently, and the null-slotLock "taken" bug is gone.
    // For a live_1on1 paid after its hold the notice/maxDaysAhead check runs from the BOOKING's createdAt (the
    // buyer passed notice when they booked), but a session whose start time has ALREADY passed when the payment
    // lands goes REFUND_DUE — never PAID — whatever the slot check says.
    if (booking.kind === 'live_1on1' && booking.startsAt) {
      const now = new Date();
      const instructor = await prisma.instructor.findUnique({ where: { id: booking.instructorId } });
      const pastStart = booking.startsAt.getTime() <= now.getTime();
      if (pastStart) {
        const fee = await stripeFeeCents(session);
        const due = await prisma.booking.updateMany({
          where: { id: booking.id, status: { in: ['HELD', 'EXPIRED'] } },
          data: { status: 'REFUND_DUE', slotLock: null, stripePaymentIntentId: paymentIntentId },
        });
        // The sale is posted ONCE (the ledger key dedupes); a refund-due booking still took the money, and the
        // referral guard below — only PAID bookings refer — keeps it out of the referral tree.
        if (due.count === 1) await postSale(idempotencyKey, booking.priceCents, fee, booking.coachUserId, booking.id);
        await prisma.order.updateMany({ where: { stripeSessionId: session.id }, data: { status: 'PAID' } });
        if (booking.status === 'EXPIRED') console.warn(`[coach-store] coach_store_paid_after_expiry row=${booking.id} outcome=refund_due`);
        return 'refund_due';
      }
      // Notice/maxDaysAhead measured from booking.createdAt for a payment landing after the hold sweep (the
      // buyer had already passed notice when they booked); B7's reschedule passes the real now.
      const free = instructor
        ? await slotStillFree({
            instructor, startsAt: booking.startsAt, durationMin: booking.durationMin ?? 30,
            excludeBookingId: booking.id, now: booking.createdAt,
          })
        : false;
      if (free && booking.durationMin) {
        const fee = await stripeFeeCents(session);
        // ONE status-CAS from HELD|EXPIRED: the unique slotLock makes a same-slot race a P2002, which falls to
        // the REFUND_DUE branch below instead of paying twice.
        const moved = await prisma.booking.updateMany({
          where: { id: booking.id, status: { in: ['HELD', 'EXPIRED'] } },
          data: {
            status: 'PAID',
            slotLock: `${booking.instructorId}:${booking.startsAt.toISOString()}`,
            stripeFeeCents: fee,
            platformFeeCents: Math.floor(booking.priceCents * PLATFORM_FEE_RATE),
            stripePaymentIntentId: paymentIntentId,
          },
        }).catch((err) => {
          if ((err as { code?: string })?.code === 'P2002') return { count: 0 };
          throw err;
        });
        if (moved.count === 1) {
          if (booking.status === 'EXPIRED') console.warn(`[coach-store] coach_store_paid_after_expiry row=${booking.id} outcome=paid`);
          await postSale(idempotencyKey, booking.priceCents, fee, booking.coachUserId, booking.id);
          await recordReferral({
            meta, priceCents: booking.priceCents, coachUserId: booking.coachUserId, sourceId: booking.id,
            source: 'live_1on1', renewalIndex: 0, sessionEndsAt: booking.endsAt, billing: 'one_time',
          });
          await prisma.order.updateMany({ where: { stripeSessionId: session.id }, data: { status: 'PAID' } });
          return 'fulfilled';
        }
      }
      // Not free (or the slotLock race lost) -> REFUND_DUE, slotLock null, NEVER throw for slot-taken.
      const fee = await stripeFeeCents(session);
      const due = await prisma.booking.updateMany({
        where: { id: booking.id, status: { in: ['HELD', 'EXPIRED'] } },
        data: { status: 'REFUND_DUE', slotLock: null, stripePaymentIntentId: paymentIntentId },
      });
      if (due.count === 1) await postSale(idempotencyKey, booking.priceCents, fee, booking.coachUserId, booking.id);
      await prisma.order.updateMany({ where: { stripeSessionId: session.id }, data: { status: 'PAID' } });
      if (booking.status === 'EXPIRED') console.warn(`[coach-store] coach_store_paid_after_expiry row=${booking.id} outcome=refund_due`);
      return 'refund_due';
    }

    // video_review (and any non-live_1on1 booking): PAID as today.
    const fee = await stripeFeeCents(session);
    const moved = await prisma.booking.updateMany({
      where: { id: booking.id, status: { in: ['HELD', 'EXPIRED'] } },
      data: {
        status: 'PAID',
        stripeFeeCents: fee,
        platformFeeCents: Math.floor(booking.priceCents * PLATFORM_FEE_RATE),
        stripePaymentIntentId: paymentIntentId,
      },
    });
    if (moved.count === 0) return 'noop';
    if (booking.status === 'EXPIRED') console.warn(`[coach-store] coach_store_paid_after_expiry row=${booking.id} outcome=paid`);
    await postSale(idempotencyKey, booking.priceCents, fee, booking.coachUserId, booking.id);
    await recordReferral({
      meta, priceCents: booking.priceCents, coachUserId: booking.coachUserId, sourceId: booking.id,
      source: booking.kind === 'video_review' ? 'video_review' : 'live_1on1',
      renewalIndex: 0, sessionEndsAt: booking.endsAt, billing: 'one_time',
    });
    await prisma.order.updateMany({ where: { stripeSessionId: session.id }, data: { status: 'PAID' } });
    return 'fulfilled';
  }

  const access = await prisma.programAccess.findUnique({ where: { id: meta.rowId } });
  if (!access || access.status === 'ACTIVE') {
    if (access?.status === 'ACTIVE') {
      await postSale(idempotencyKey, access.priceCents, access.stripeFeeCents, await coachOf(access.instructorId), access.id);
      // A replay still closes the bookkeeping row: the buy lane writes a PENDING Order at checkout time
      // (lib/coach-store/checkout.ts), so the Order status is not proof the sale was posted.
      await prisma.order.updateMany({
        where: { stripeSessionId: session.id, status: { not: 'PAID' } },
        data: { status: 'PAID' },
      });
      return 'fulfilled';
    }
    return 'noop';
  }
  const subscription = session.mode === 'subscription';
  const fee = subscription ? 0 : await stripeFeeCents(session);
  const instructor = await prisma.instructor.findUnique({ where: { id: access.instructorId }, select: { userId: true } });
  const moved = await prisma.programAccess.updateMany({
    where: { id: access.id, status: 'PENDING' },
    data: {
      status: 'ACTIVE',
      stripeFeeCents: fee,
      platformFeeCents: Math.floor(access.priceCents * PLATFORM_FEE_RATE),
      startedAt: new Date(),
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
    },
  });
  if (moved.count === 0) return 'noop';
  // A subscription's money is recorded on invoice.paid so the first invoice and the checkout event are not two sales.
  if (!subscription && instructor) {
    await postSale(idempotencyKey, access.priceCents, fee, instructor.userId, access.id);
    await recordReferral({
      meta, priceCents: access.priceCents, coachUserId: instructor.userId, sourceId: access.id,
      source: 'program',
      renewalIndex: 0, sessionEndsAt: null, billing: 'one_time',
    });
  }
  // FLAG (SEC-F4): the where clause gained `status: { not: 'PAID' }`. The buy lane creates this Order as
  // PENDING when checkout starts, and without the guard the updateMany throws P2025 on it (a real
  // no-webhook fulfilment would die AFTER the access was granted, on the bookkeeping row). The guard
  // only widens which row is flipped to PAID; a row already PAID — the true already-fulfilled signal —
  // behaves exactly as before (0 rows, nothing thrown).
  await prisma.order.updateMany({
    where: { stripeSessionId: session.id, status: { not: 'PAID' } },
    data: { status: 'PAID' },
  });
  return 'fulfilled';
}

async function coachOf(instructorId: string): Promise<string> {
  const row = await prisma.instructor.findUnique({ where: { id: instructorId }, select: { userId: true } });
  return row?.userId ?? '';
}

async function onExpired(meta: Meta): Promise<void> {
  await prisma.booking.updateMany({ where: { id: meta.rowId, status: 'HELD' }, data: { status: 'EXPIRED', slotLock: null } });
  await prisma.programAccess.updateMany({ where: { id: meta.rowId, status: 'PENDING' }, data: { status: 'EXPIRED', codeActive: false } });
}

async function onInvoicePaid(event: Stripe.Event, meta: Meta, idempotencyKey: string): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = invoiceSubscriptionId(invoice);
  const access = meta.rowId
    ? await prisma.programAccess.findUnique({ where: { id: meta.rowId } })
    : subId
      ? await prisma.programAccess.findFirst({ where: { stripeSubscriptionId: subId } })
      : null;
  if (!access) return;
  const grant = access.scope === 'all' && access.beneficiary === 'self';
  const credits = nextReviewCredits(access.reviewCredits, access.lastCreditInvoiceId, invoice.id, grant);
  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  await prisma.programAccess.update({
    where: { id: access.id },
    data: {
      status: 'ACTIVE',
      reviewCredits: credits.credits,
      lastCreditInvoiceId: credits.lastInvoiceId,
      ...(typeof periodEnd === 'number' ? { accessUntil: new Date(periodEnd * 1000) } : {}),
    },
  });
  if (invoice.amount_paid && invoice.amount_paid > 0 && invoice.billing_reason !== 'subscription_update') {
    const fee = await invoiceFeeCents(invoice);
    await prisma.programAccess.update({ where: { id: access.id }, data: { stripeFeeCents: fee } });
    const instructor = await prisma.instructor.findUnique({ where: { id: access.instructorId }, select: { userId: true } });
    if (instructor) {
      await postSale(idempotencyKey, invoice.amount_paid, fee, instructor.userId, access.id);
      const prior = await prisma.coachStoreReferral.count({ where: { sourceId: access.id, sourceKind: 'membership' } });
      await recordReferral({
        meta: { ...meta, referrerUserId: meta.referrerUserId ?? '' },
        priceCents: invoice.amount_paid,
        coachUserId: instructor.userId,
        sourceId: access.id,
        source: 'membership',
        renewalIndex: Math.max(0, prior),
        sessionEndsAt: null,
        billing: 'month',
      });
    }
  }
}

async function onInvoiceFailed(meta: Meta): Promise<void> {
  if (!meta.rowId) return;
  await prisma.programAccess.updateMany({ where: { id: meta.rowId, status: 'ACTIVE' }, data: { status: 'PAST_DUE' } });
}

async function onSubscription(event: Stripe.Event, meta: Meta): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const access = meta.rowId
    ? await prisma.programAccess.findUnique({ where: { id: meta.rowId } })
    : await prisma.programAccess.findFirst({ where: { stripeSubscriptionId: sub.id } });
  if (!access) return;
  const endUnix = subscriptionPeriodEndUnix(sub);
  const ended = event.type === 'customer.subscription.deleted' || sub.status === 'canceled';
  await prisma.programAccess.update({
    where: { id: access.id },
    data: {
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || ended,
      ...(endUnix ? { accessUntil: new Date(endUnix * 1000) } : {}),
      ...(ended ? { status: 'CANCELED', codeActive: false } : {}),
    },
  });
}

async function onReverse(meta: Meta, dispute: boolean): Promise<void> {
  if (meta.rowId) {
    await prisma.booking.updateMany({ where: { id: meta.rowId, status: 'PAID' }, data: { status: dispute ? 'DISPUTED' : 'REFUNDED', slotLock: null } });
    await prisma.programAccess.updateMany({
      where: { id: meta.rowId },
      data: { status: dispute ? 'PAUSED' : 'REFUNDED', codeActive: false },
    });
    await prisma.coachStoreReferral.updateMany({ where: { sourceId: meta.rowId, status: { in: ['PENDING', 'PAYABLE'] } }, data: { status: 'REVERSED' } });
  }
}

async function recordReferral(input: {
  meta: Meta;
  priceCents: number;
  coachUserId: string;
  sourceId: string;
  source: ReferralSource;
  renewalIndex: number;
  sessionEndsAt: Date | null;
  billing: 'one_time' | 'week' | 'month';
}): Promise<void> {
  const referrer = input.meta.referrerUserId || null;
  const buyer = input.meta.userId;
  if (!referrer || !buyer) return;
  const [referrerIsAdult, buyerIsAdult] = await Promise.all([
    isVerifiedAdult(prisma, referrer),
    isVerifiedAdult(prisma, buyer),
  ]);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const month = await prisma.coachStoreReferral.aggregate({
    where: { referrerUserId: referrer, status: { in: ['PENDING', 'PAYABLE', 'PAID'] }, createdAt: { gte: monthStart } },
    _sum: { cutCents: true },
  });
  const platformFeeCents = Math.floor(input.priceCents * PLATFORM_FEE_RATE);
  const decision = decideReferral({
    referrerUserId: referrer,
    buyerUserId: buyer,
    coachUserId: input.coachUserId,
    referrerIsAdult,
    buyerIsAdult,
    priceCents: input.priceCents,
    platformFeeCents,
    renewalIndex: input.renewalIndex,
    source: input.source,
    billing: input.billing,
    // Floor uses billing === 'week' only; weeklyCents is the weekly price when billed weekly, else null.
    weeklyCents: input.billing === 'week' ? input.priceCents : null,
    monthCutCents: month._sum.cutCents ?? 0,
    share: referralShareOfFee(),
    paidAt: new Date(),
    sessionEndsAt: input.sessionEndsAt,
  });
  if (!decision.reason && decision.cutCents > 0) {
    await prisma.coachStoreReferral.create({
      data: {
        paymentKey: `${input.source}:${input.sourceId}:${input.renewalIndex}`,
        referrerUserId: referrer,
        buyerUserId: buyer,
        coachUserId: input.coachUserId,
        sourceKind: input.source,
        sourceId: input.sourceId,
        grossCents: input.priceCents,
        platformFeeCents,
        shareOfFee: decision.shareOfFee,
        cutCents: decision.cutCents,
        renewalIndex: input.renewalIndex,
        status: 'PENDING',
        holdUntil: decision.holdUntil,
      },
    }).catch(() => undefined);
  }
}
