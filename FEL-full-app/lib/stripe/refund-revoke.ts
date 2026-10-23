/**
 * lib/stripe/refund-revoke.ts — LAUNCH-SALES (P0, 2026-10-20): a refund revokes what it paid for.
 *
 * STORE-READY B10 kept VIRTUAL_PURCHASES_ENABLED off until each product had "an 18+ check and a refund path". The
 * book shop (lib/books/bookFulfill.ts revokeBookCharge) and the coach store's one-time rows (charge metadata ->
 * lib/coach-store/webhook.ts onReverse) already had one; the shared webhook ignored every other refund. This is the
 * charge.refunded path for the rest, called by app/api/stripe/webhook after the book and coach-store-metadata paths:
 *
 *   1. wallet products (season pass PRO, coin and shard packs): the wallet's own refund, unchanged
 *      (lib/wallet/stripe-wallet-events.ts): the PRO lane closes and its cosmetics are withdrawn; coins and shards are
 *      debited, clamped at 0.
 *   2. a PARTIAL refund changes nothing else (a goodwill credit is not a cancellation). Logged.
 *   3. a coach-store booking or access found by its payment intent (the metadata fallback) -> reversed.
 *   4. a SUBSCRIPTION payment (FEL Pro weekly/monthly, FEL Coach, FEL Facility, Studio Creator), found through the
 *      invoice (basil: no charge.invoice, see ./basil-shapes): the Subscription row goes CANCELED at once (the Pro
 *      gate reads status ACTIVE), the payment is reversed in the ledger, and the Stripe subscription is cancelled so
 *      it never bills again. A coach-store membership found the same way is reversed by the coach store's own code
 *      and its subscription is cancelled the same way.
 *   5. a one-time /api/stripe/checkout purchase (COSMETIC and the rest), found through its Checkout Session: the
 *      Order goes REFUNDED, and a COSMETIC sale is reversed in the ledger.
 *
 * Every step is idempotent: status moves are compare-and-set, the ledger reversal is keyed `stripe-refund:<charge>`,
 * and a subscription already cancelled at Stripe is not cancelled again. A Stripe failure throws, so the webhook
 * answers 500 and Stripe retries.
 */
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { postTransaction } from '@/lib/ledger';
import { reverseCoachStoreRow } from '@/lib/coach-store/webhook';
import { isMissingTable } from '@/lib/coach-store/gate';
import { isWalletRefundMeta, refundMetadata, walletChargeRefunded } from '@/lib/wallet/stripe-wallet-events';
import { paymentIntentIdOf, subscriptionIdForCharge } from './basil-shapes';

export type RefundOutcome =
  | { kind: 'wallet'; result: Record<string, unknown> }
  | { kind: 'partial'; amountRefunded: number }
  | { kind: 'coach_store'; rowId: string; subscriptionCancelled?: boolean }
  | { kind: 'subscription'; product: string; subscriptionId: string; revoked: boolean; subscriptionCancelled: boolean }
  | { kind: 'order'; product: string; orderId: string; revoked: boolean }
  | { kind: 'unmatched' };

const ENDED_AT_STRIPE = new Set(['canceled', 'incomplete_expired']);

/** Cancel a Stripe subscription unless Stripe already ended it. Returns true when this call cancelled it. */
async function stopBilling(stripe: Stripe, subscriptionId: string): Promise<boolean> {
  const live = await stripe.subscriptions.retrieve(subscriptionId);
  if (ENDED_AT_STRIPE.has(String(live.status))) return false;
  await stripe.subscriptions.cancel(subscriptionId);
  return true;
}

/** EXTERNAL <- PLATFORM_REVENUE for a refunded platform sale (the reverse of ledgerSubscriptionPayment / Cosmetic). */
async function reverseSale(charge: Stripe.Charge, kind: string, metadata: Record<string, string>): Promise<void> {
  const cents = Number(charge.amount_refunded ?? 0);
  if (!Number.isInteger(cents) || cents <= 0) return;
  await postTransaction(prisma, {
    kind,
    idempotencyKey: `stripe-refund:${charge.id}`,
    currency: 'USD_CENTS',
    enforceNonNegative: false,
    metadata: { chargeId: charge.id, ...metadata },
    postings: [
      { account: { type: 'EXTERNAL', currency: 'USD_CENTS' }, amount: -cents },
      { account: { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' }, amount: cents },
    ],
  });
}

/**
 * A coach-store read that answers null while the coach-store tables do not exist yet (pending SQL 7-11,
 * docs/SHIP-READINESS.md §3.2): FEL Pro can be sold before the coach store, and its refunds must not 500 on a
 * missing Booking table.
 */
async function coachStoreRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

async function coachStoreRowByPaymentIntent(pi: string): Promise<string | null> {
  const booking = await coachStoreRead(() => prisma.booking.findUnique({ where: { stripePaymentIntentId: pi }, select: { id: true } }));
  if (booking) return booking.id;
  const access = await coachStoreRead(() => prisma.programAccess.findUnique({ where: { stripePaymentIntentId: pi }, select: { id: true } }));
  return access?.id ?? null;
}

export async function revokeForRefundedCharge(stripe: Stripe, event: Stripe.Event): Promise<RefundOutcome> {
  const charge = event.data.object as Stripe.Charge;
  const md = await refundMetadata(stripe, charge);

  // 1. Wallet products keep their own rule (they act on any refund event, as they always have).
  if (isWalletRefundMeta(md)) {
    return { kind: 'wallet', result: await walletChargeRefunded(event, md) };
  }

  // 2. Partial refunds revoke nothing.
  if (charge.refunded !== true) {
    console.log(`[refund] partial refund on ${charge.id}; nothing revoked`);
    return { kind: 'partial', amountRefunded: Number(charge.amount_refunded ?? 0) };
  }

  const pi = paymentIntentIdOf(charge);

  // 3. A coach-store one-time row whose charge arrived without the coach-store metadata.
  if (pi) {
    const rowId = await coachStoreRowByPaymentIntent(pi);
    if (rowId) {
      await reverseCoachStoreRow(rowId);
      return { kind: 'coach_store', rowId };
    }
  }

  // 4. A subscription payment.
  const subscriptionId = await subscriptionIdForCharge(stripe, charge);
  if (subscriptionId) {
    const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
    if (sub) {
      const moved = await prisma.subscription.updateMany({
        where: { id: sub.id, status: { not: 'CANCELED' } },
        data: { status: 'CANCELED', cancelAtPeriodEnd: false },
      });
      await reverseSale(charge, `SUBSCRIPTION_REFUND_${sub.product}`, { subscriptionId, product: sub.product, userId: sub.userId });
      const subscriptionCancelled = await stopBilling(stripe, subscriptionId);
      return { kind: 'subscription', product: sub.product, subscriptionId, revoked: moved.count > 0, subscriptionCancelled };
    }
    const access = await coachStoreRead(() => prisma.programAccess.findFirst({ where: { stripeSubscriptionId: subscriptionId }, select: { id: true } }));
    if (access) {
      await reverseCoachStoreRow(access.id);
      const subscriptionCancelled = await stopBilling(stripe, subscriptionId);
      return { kind: 'coach_store', rowId: access.id, subscriptionCancelled };
    }
  }

  // 5. A one-time /api/stripe/checkout purchase, through its Checkout Session.
  if (pi) {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
    const session = sessions.data[0];
    if (session) {
      const order = await prisma.order.findUnique({ where: { stripeSessionId: session.id } });
      if (order) {
        const product = String((order.metadata as Record<string, unknown> | null)?.product ?? md.product ?? order.type);
        const moved = await prisma.order.updateMany({
          where: { id: order.id, status: { not: 'REFUNDED' } },
          data: { status: 'REFUNDED' },
        });
        if (order.type === 'COSMETIC' && product === 'COSMETIC') {
          await reverseSale(charge, 'COSMETIC_REFUND', { orderId: order.id, itemKey: order.itemKey ?? '', userId: order.userId });
        }
        return { kind: 'order', product, orderId: order.id, revoked: moved.count > 0 };
      }
    }
  }

  console.warn(`[refund] charge ${charge.id} matched no purchase`);
  return { kind: 'unmatched' };
}
