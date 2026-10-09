export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import {
  ledgerSubscriptionPayment,
} from '@/lib/stripe-helpers';
import { fulfilCheckoutSession } from '@/lib/stripe/checkout-fulfil';
import { verifyIdempotencyKey } from '@/lib/stripe/verify-checkout';
import { coachStoreMeta, fulfilCoachStore } from '@/lib/coach-store/webhook';
import type Stripe from 'stripe';

/**
 * POST /api/stripe/webhook
 * Verifies Stripe signature, dispatches event.
 * Replay-safe: uses event.id as idempotency key for ledger.
 */
export async function POST(req: NextRequest) {
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) {
    console.error('[stripe-webhook] payments not set up');
    return NextResponse.json({ error: 'payments not set up', message: 'payments not set up' }, { status: 503 });
  }
  const stripe = getStripe();

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

  // Book sales (Final Evolution Press, PR #17). Handled before the coach-store and ledger dispatch: a guest book
  // purchase has no userId. MERGE (2026-10-09), ported to SEC-F4 (#200): a purchase is keyed on the Checkout
  // Session (recordPaidBookSession), the same key the /press receipt page fulfils under, so webhook + receipt +
  // redelivery grant once. A failure returns 500 so Stripe retries.
  const bookSession = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded'
    ? (event.data.object as Stripe.Checkout.Session)
    : null;
  if (bookSession?.metadata?.product === 'BOOK') {
    try {
      const { recordPaidBookSession } = await import('@/lib/books/bookFulfill');
      const { prismaBookStore } = await import('@/lib/books/bookStore');
      const result = await recordPaidBookSession(bookSession, prismaBookStore());
      return NextResponse.json({ received: true, ...result });
    } catch (err) {
      console.error('[stripe-webhook] book fulfillment failed', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'book fulfillment failed' }, { status: 500 });
    }
  }
  // A refund may be a book's. Only asked once the book tables exist (prisma/pending/2026-10-09-book-shop.sql):
  // before that no book was ever granted, and a refund for any other product (the coach store's B9 mapping)
  // must never 500 here.
  if (event.type === 'charge.refunded') {
    const { bookTablesReady, prismaBookStore } = await import('@/lib/books/bookStore');
    if (bookTablesReady()) {
      try {
        const { revokeBookCharge } = await import('@/lib/books/bookFulfill');
        const result = await revokeBookCharge(event.id, event.data.object as Stripe.Charge, prismaBookStore());
        if (!('ignored' in result && result.ignored)) {
          return NextResponse.json({ received: true, ...result });
        }
      } catch (err) {
        const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: string }).code : '';
        if (code === 'P2021') {
          console.error('[stripe-webhook] book tables are not in the database yet');
        } else {
          console.error('[stripe-webhook] book refund failed', err instanceof Error ? err.message : err);
          return NextResponse.json({ error: 'book fulfillment failed' }, { status: 500 });
        }
      }
    }
  }

  // Idempotency: check if we already processed this event
  const eventIdempotencyKey = `stripe-event:${event.id}`;
  const alreadyProcessed = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: eventIdempotencyKey },
    select: { id: true },
  });
  // Note: not all events produce ledger rows; we track processed events separately
  // for non-ledger events by storing in Order/Subscription status changes.
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    if (coachStoreMeta(event)) {
      // Coach-store fulfilment ignores event.livemode. Other products keep the switch below.
      await fulfilCoachStore(event, eventIdempotencyKey);
    } else switch (event.type) {
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
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// The grants themselves live in lib/stripe/checkout-fulfil.ts so the
// server-verified success path (app/api/stripe/verify-session) fulfils through
// the SAME code as this webhook (SEC-F4 NO-WEBHOOK). SEC-F4 follow-up 1: the
// fulfilment key is the CHECKOUT SESSION id, not this event's id — the same key
// verify-session uses, so webhook + verify (or a redelivered event, which is a
// NEW event id for the SAME session) grants once. The pre-dispatch dedupe above
// still runs on the event id: that one answers Stripe's retry with `deduped`,
// this one makes the grant itself one-per-payment.
async function handleCheckoutCompleted(event: Stripe.Event, _eventIdempotencyKey: string) {
  const session = event.data.object as Stripe.Checkout.Session;
  await fulfilCheckoutSession(session, verifyIdempotencyKey(session.id));
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
