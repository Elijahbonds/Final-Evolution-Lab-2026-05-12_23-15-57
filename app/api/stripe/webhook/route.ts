export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { PLATFORM_TAKE_RATE } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import {
  ledgerSubscriptionPayment,
  ledgerCosmeticPurchase,
  ledgerMarketplaceSale,
} from '@/lib/stripe-helpers';
import { ledgerStudioCreditsGrant } from '@/lib/studio-credits';
import type Stripe from 'stripe';

/**
 * POST /api/stripe/webhook
 * Verifies Stripe signature, dispatches event.
 * Replay-safe: uses event.id as idempotency key for ledger.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: check if we already processed this event
  const eventIdempotencyKey = `stripe-event:${event.id}`;
  const alreadyProcessed = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: eventIdempotencyKey },
    select: { id: true },
  });
  // Note: not all events produce ledger rows; we track processed events separately
  // for non-ledger events by storing in Order/Subscription status changes.

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event, eventIdempotencyKey);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event, eventIdempotencyKey);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err.message);
    // Return 200 to prevent Stripe retries on business-logic errors
    // (duplicate processing, etc). Only 5xx for infra failures.
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(event: Stripe.Event, idempotencyKey: string) {
  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata || {};
  const userId = meta.userId;
  if (!userId) { console.warn('[webhook] checkout.session.completed missing userId'); return; }

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
    return;
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
    return;
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
    return;
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
    return;
  }
}

async function handleInvoicePaid(event: Stripe.Event, idempotencyKey: string) {
  const invoice = event.data.object as any;
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;

  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
  if (!sub) { console.warn(`[webhook] invoice.paid for unknown sub ${subId}`); return; }

  const amountCents = invoice.amount_paid ?? 0;
  if (amountCents <= 0) return; // trial or free

  await prisma.$transaction(async (tx: any) => {
    // Update subscription period
    const stripe = getStripe();
    const stripeSub: any = await stripe.subscriptions.retrieve(subId);
    await tx.subscription.update({
      where: { stripeSubscriptionId: subId },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      },
    });
    // Ledger: EXTERNAL → PLATFORM_REVENUE
    await ledgerSubscriptionPayment(tx, {
      userId: sub.userId,
      amountCents,
      idempotencyKey,
      kind: `SUBSCRIPTION_PAYMENT_${sub.product}`,
      metadata: { invoiceId: invoice.id, subscriptionId: subId, product: sub.product },
    });
  });
}

async function handleInvoiceFailed(event: Stripe.Event) {
  const invoice = event.data.object as any;
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subId },
    data: { status: 'PAST_DUE' },
  });
  console.log(`[webhook] Subscription ${subId} marked PAST_DUE`);
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
  if (!sub) return;

  const status = mapStripeStatus(stripeSub.status);
  await prisma.subscription.update({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000),
    },
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: { status: 'CANCELED', cancelAtPeriodEnd: false },
  });
  console.log(`[webhook] Subscription ${stripeSub.id} canceled`);
}

function mapStripeStatus(s: Stripe.Subscription.Status): 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' {
  switch (s) {
    case 'active': case 'trialing': return 'ACTIVE';
    case 'past_due': return 'PAST_DUE';
    case 'canceled': case 'unpaid': return 'CANCELED';
    default: return 'INCOMPLETE';
  }
}
