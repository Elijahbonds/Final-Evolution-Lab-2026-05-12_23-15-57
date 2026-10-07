/**
 * lib/stripe/checkout-fulfil.ts — the fulfilment half of app/api/stripe/webhook/route.ts,
 * extracted unchanged so a second, server-verified path can run it (SEC-F4 NO-WEBHOOK):
 *
 *   - the signature-verified webhook calls fulfilCheckoutSession for
 *     `checkout.session.completed`, exactly as before;
 *   - POST /api/stripe/verify-session retrieves the session from Stripe itself
 *     (no webhook needed) and calls the same function once Stripe reports it paid.
 *
 * Idempotency is the schema's, not the caller's: Order.stripeSessionId is unique
 * (upserted), LedgerTransaction.idempotencyKey is unique (postTransaction returns the
 * prior row), and MarketplacePurchase is unique on (buyerId, listingId). The webhook
 * keys on the Stripe event id (`stripe-event:<id>`); the verify path keys on the
 * session id (`stripe-session:<id>`) — the two never collide, and both are deduped
 * per session by the Order/entitlement upserts, so webhook + verify = one grant.
 */

import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { PLATFORM_TAKE_RATE } from '@/lib/stripe';
import { splitPayment } from '@/lib/store/split';
import { prisma } from '@/lib/db';
import {
  ledgerCosmeticPurchase,
  ledgerMarketplaceSale,
} from '@/lib/stripe-helpers';
import { ledgerStudioCreditsGrant } from '@/lib/studio-credits';

/**
 * The grants a fulfilled checkout can produce. Mirrors the product branches below;
 * `subscription` also covers the FEL_COACH / FEL_FACILITY checkout keys, which all
 * write the entitlement under cfg.product. Nothing here is read from the client —
 * the caller passes the Stripe-retrieved session.
 */
export type CheckoutFulfilment =
  | { kind: 'subscription'; userId: string; product: string }
  | { kind: 'cosmetic'; userId: string; itemKey: string }
  | { kind: 'studio_credits'; userId: string; itemKey: string; credits: number }
  | { kind: 'coach_program'; userId: string; listingId: string }
  | { kind: 'marketplace'; userId: string; listingId: string }
  | { kind: 'none' };

/**
 * Fulfil a PAID checkout session: Order + ledger + entitlement, per metadata.product.
 * Idempotent per session — a second call (reload, verify-after-webhook) upserts the
 * same Order, dedupes the ledger rows, and upserts the same entitlement.
 *
 * The CALLER decides the session is paid and belongs to the user (the webhook: a
 * signature-verified checkout.session.completed; verify-session: a Stripe retrieve
 * reporting payment_status 'paid'). Callers pass `meta` only when they retrieved
 * the session with metadata expansion explicitly disabled; normally it is read off
 * the session itself.
 */
export async function fulfilCheckoutSession(
  session: Stripe.Checkout.Session,
  idempotencyKey: string,
  metaOverride?: Record<string, string>,
): Promise<CheckoutFulfilment> {
  const meta = metaOverride ?? session.metadata ?? {};
  const userId = meta.userId;
  if (!userId) { console.warn('[webhook] checkout.session.completed missing userId'); return { kind: 'none' }; }

  const product = meta.product;

  if (product === 'FEL_PRO' || product === 'STUDIO_CREATOR') {
    // Subscription — the subscription object is created by Stripe.
    // We'll get details from invoice.paid for the ledger entry.
    // Here we just create the Order record.
    await prisma.order.upsert({
      where: { stripeSessionId: session.id },
      update: { status: 'PAID' },
      create: {
        userId,
        stripeSessionId: session.id,
        type: 'SUBSCRIPTION',
        amount: session.amount_total ?? 0,
        status: 'PAID',
        metadata: meta,
      },
    });

    // Create Subscription record from the stripe subscription
    if (session.subscription) {
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(subId);
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: subId },
        update: {
          status: 'ACTIVE',
          stripePriceId: stripeSub.items.data[0]?.price?.id ?? '',
          currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000),
        },
        create: {
          userId,
          stripeSubscriptionId: subId,
          stripePriceId: stripeSub.items.data[0]?.price?.id ?? '',
          product: product as any,
          status: 'ACTIVE',
          currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000),
        },
      });
    }
    return { kind: 'subscription', userId, product };
  }

  if (product === 'COSMETIC') {
    const itemKey = meta.itemKey ?? '';
    await prisma.$transaction(async (tx: any) => {
      await tx.order.upsert({
        where: { stripeSessionId: session.id },
        update: { status: 'PAID' },
        create: {
          userId,
          stripeSessionId: session.id,
          type: 'COSMETIC',
          amount: session.amount_total ?? 0,
          status: 'PAID',
          itemKey,
          metadata: meta,
        },
      });
      // Ledger: EXTERNAL → PLATFORM_REVENUE
      await ledgerCosmeticPurchase(tx, {
        userId,
        amountCents: session.amount_total ?? 0,
        idempotencyKey,
        metadata: { stripeSessionId: session.id, itemKey },
      });
    });
    return { kind: 'cosmetic', userId, itemKey };
  }

  if (product === 'STUDIO_CREDITS') {
    const itemKey = meta.itemKey ?? '';
    const credits = Number(meta.credits ?? 0) || 0;
    const totalCents = session.amount_total ?? 0;
    await prisma.$transaction(async (tx: any) => {
      await tx.order.upsert({
        where: { stripeSessionId: session.id },
        update: { status: 'PAID' },
        create: {
          userId,
          stripeSessionId: session.id,
          type: 'COSMETIC', // one-time purchase family
          amount: totalCents,
          status: 'PAID',
          itemKey,
          metadata: meta,
        },
      });
      // Real USD revenue recognized now (EXTERNAL → PLATFORM_REVENUE).
      await ledgerCosmeticPurchase(tx, {
        userId,
        amountCents: totalCents,
        idempotencyKey,
        metadata: { stripeSessionId: session.id, itemKey, kind: 'STUDIO_CREDITS' },
      });
      // Grant the prepaid virtual credits on the isolated STUDIO_CREDIT book.
      if (credits > 0) {
        await ledgerStudioCreditsGrant(tx, {
          userId,
          credits,
          idempotencyKey: `${idempotencyKey}:grant`,
          metadata: { stripeSessionId: session.id, itemKey, credits },
        });
      }
    });
    return { kind: 'studio_credits', userId, itemKey, credits };
  }

  // A coach's training block. Separate from MARKETPLACE because the rate is different and the split is
  // computed rather than rounded: coaching takes PLATFORM_TAKE (30%, lib/marketing/referralTree.ts), where
  // cosmetics take PLATFORM_TAKE_RATE (15%, lib/stripe.ts). Two near-identically-named constants for two
  // genuinely different products — importing the wrong one here would silently underpay a coach by half.
  if (product === 'COACH_PROGRAM') {
    const listingId = meta.listingId ?? '';
    const coachId = meta.coachId ?? '';
    const totalCents = session.amount_total ?? 0;
    if (!listingId || !coachId || totalCents <= 0) {
      console.error('coach program webhook missing metadata', { listingId, coachId, totalCents });
      return { kind: 'none' };
    }

    const split = splitPayment(
      { id: session.id, payerId: userId, amountCents: totalCents, kind: 'program_purchase', recurring: false },
      [],
    );
    // a one-off block is not a QUALIFYING_KIND, so the tree pays nothing and the whole take stays with the
    // platform. Asserted rather than assumed: if that boundary ever moves, this ledger call would quietly
    // book commission money as platform revenue.
    if (split.commissionCents !== 0) {
      console.error('unexpected commission on a program purchase', session.id);
      return { kind: 'none' };
    }

    await prisma.$transaction(async (tx: any) => {
      const order = await tx.order.upsert({
        where: { stripeSessionId: session.id },
        update: { status: 'PAID' },
        create: {
          userId,
          stripeSessionId: session.id,
          type: 'MARKETPLACE',
          amount: totalCents,
          status: 'PAID',
          itemKey: listingId,
          metadata: meta,
        },
      });
      const { transactionId } = await ledgerMarketplaceSale(tx, {
        buyerId: userId,
        creatorId: coachId,
        totalCents: split.grossCents,
        platformCutCents: split.platformCents,     // coach receives gross - platform, which is split.coachCents
        idempotencyKey,
        metadata: { stripeSessionId: session.id, listingId, coachId, kind: 'coach_program' },
      });
      // the entitlement. Unique on (buyer, listing), so a replayed webhook updates rather than duplicates.
      await tx.marketplacePurchase.upsert({
        where: { buyerId_listingId: { buyerId: userId, listingId } },
        update: { orderId: order.id, ledgerTxId: transactionId },
        create: { buyerId: userId, listingId, orderId: order.id, ledgerTxId: transactionId },
      });
    });
    return { kind: 'coach_program', userId, listingId };
  }

  if (product === 'MARKETPLACE') {
    const listingId = meta.listingId ?? '';
    const creatorId = meta.creatorId ?? '';
    const itemKey = meta.itemKey ?? '';
    const totalCents = session.amount_total ?? 0;
    const platformCutCents = Math.round(totalCents * PLATFORM_TAKE_RATE);

    await prisma.$transaction(async (tx: any) => {
      const order = await tx.order.upsert({
        where: { stripeSessionId: session.id },
        update: { status: 'PAID' },
        create: {
          userId,
          stripeSessionId: session.id,
          type: 'MARKETPLACE',
          amount: totalCents,
          status: 'PAID',
          itemKey,
          metadata: meta,
        },
      });
      // Ledger: EXTERNAL → PLATFORM_REVENUE + CREATOR_ACCRUAL
      const { transactionId } = await ledgerMarketplaceSale(tx, {
        buyerId: userId,
        creatorId,
        totalCents,
        platformCutCents,
        idempotencyKey,
        metadata: { stripeSessionId: session.id, listingId, creatorId },
      });
      // Record the purchase unlock
      await tx.marketplacePurchase.upsert({
        where: { buyerId_listingId: { buyerId: userId, listingId } },
        update: { orderId: order.id, ledgerTxId: transactionId },
        create: {
          buyerId: userId,
          listingId,
          orderId: order.id,
          ledgerTxId: transactionId,
        },
      });
    });
    return { kind: 'marketplace', userId, listingId };
  }

  return { kind: 'none' };
}
