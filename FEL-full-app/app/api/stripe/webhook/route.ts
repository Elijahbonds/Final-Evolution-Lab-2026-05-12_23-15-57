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
import {
  invoicePeriodEnd,
  invoiceSubscriptionId,
  invoiceSubscriptionMetadata,
  isSubscriptionProduct,
  subscriptionEnded,
  subscriptionPeriodEnd,
} from '@/lib/stripe/basil-shapes';
import { revokeForRefundedCharge } from '@/lib/stripe/refund-revoke';
import { isWalletSession, walletCheckoutCompleted } from '@/lib/wallet/stripe-wallet-events';
import { fulfilCoachConnect, isCoachConnectEvent } from '@/lib/coach-business/webhook';
import { coachConnectEvent } from '@/lib/coach-business/events';
import { prismaConnectDeps } from '@/lib/coach-business/server';
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

  // PAYMENTS-READY: events on coaches' CONNECTED accounts (account.updated) come from a second Stripe endpoint ("events on
  // connected accounts") with its own signing secret, STRIPE_CONNECT_WEBHOOK_SECRET. The same URL verifies either secret;
  // an event that matches neither is refused exactly as before.
  const connectSecret = (process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '').trim();
  let event: Stripe.Event | null = null;
  let lastError = '';
  for (const secret of connectSecret ? [webhookSecret, connectSecret] : [webhookSecret]) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
      break;
    } catch (err: any) {
      lastError = err?.message ?? String(err);
    }
  }
  if (!event) {
    console.error('[stripe-webhook] Signature verification failed:', lastError);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // PAYMENTS-READY (lib/coach-business/events.ts): a coach's Express account changed (account.updated), or a buyer
  // disputed a coach's sale (charge.dispute.*). Asked before everything else; anything that is not the coach business's
  // answers null here and carries on below exactly as before. A failure returns 500 so Stripe retries.
  if (event.type === 'account.updated' || event.type.startsWith('charge.dispute.')) {
    try {
      const outcome = await coachConnectEvent(prismaConnectDeps(), event);
      if (outcome) return NextResponse.json({ received: true, coachConnect: outcome });
    } catch (err) {
      console.error('[stripe-webhook] coach-connect event failed', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
    }
  }
  // An event from a CONNECTED account that is not handled above is acknowledged and left alone: no handler below is about
  // a coach's own account.
  if ((event as { account?: string }).account) {
    return NextResponse.json({ received: true, ignored: 'connected_account_event' });
  }

  // COACH-BUSINESS (2026-10-25): a coach's own sale through Stripe Connect (metadata.product COACH_CONNECT). Handled
  // first, before the book refund path, whose event-id memory would answer a redelivered refund `deduped` before it got
  // here. Status moves and FEL's 5% fee are booked by lib/coach-business/webhook.ts, idempotent per payment; a failure
  // returns 500 so Stripe retries.
  if (isCoachConnectEvent(event)) {
    try {
      const coachConnect = await fulfilCoachConnect(prismaConnectDeps(), event);
      return NextResponse.json({ received: true, coachConnect });
    } catch (err) {
      console.error('[stripe-webhook] coach-connect failed', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
    }
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
  //
  // DEDUPE PER HANDLER (coach-fee-passthrough, 2026-10-25; the follow-up PR #442 found). revokeBookCharge remembers
  // every charge.refunded event id in the BOOK store, before the handlers below run. Its `deduped` answer therefore
  // means only "the book handler has seen this event", not "every handler finished": when the coach-store (or any
  // later) handler threw and Stripe retried, answering `deduped` here lost that refund for good. So the book path
  // answers only when it actually revoked a book; `deduped` and `ignored` fall through to the handlers below, each of
  // which is idempotent on its own (status compare-and-set, ledger keys per charge).
  if (event.type === 'charge.refunded') {
    const { bookTablesReady, prismaBookStore } = await import('@/lib/books/bookStore');
    if (bookTablesReady()) {
      try {
        const { revokeBookCharge } = await import('@/lib/books/bookFulfill');
        const result = await revokeBookCharge(event.id, event.data.object as Stripe.Charge, prismaBookStore());
        if ('revoked' in result) {
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
      case 'checkout.session.completed': {
        // LAUNCH-SALES: coin packs, shard packs and the season pass PRO lane fulfil here too, through the wallet
        // webhook's own code (one endpoint can be subscribed per signing secret; see stripe-wallet-events.ts).
        const session = event.data.object as Stripe.Checkout.Session;
        if (isWalletSession(session)) {
          return NextResponse.json(await walletCheckoutCompleted(stripe, session));
        }
        await handleCheckoutCompleted(event, eventIdempotencyKey);
        break;
      }
      case 'invoice.paid':
        await handleInvoicePaid(event);
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
      case 'charge.refunded': {
        // LAUNCH-SALES: a refund revokes what it paid for (lib/stripe/refund-revoke.ts). Books and coach-store rows
        // with metadata were handled above; this covers subscriptions, wallet products, cosmetics and memberships.
        const outcome = await revokeForRefundedCharge(stripe, event);
        return NextResponse.json({ received: true, refund: outcome.kind });
      }
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

// LAUNCH-SALES B-W3. The pinned API version (2025-04-30.basil) removed invoice.subscription and
// subscription.current_period_end; these handlers read the basil fields through lib/stripe/basil-shapes.ts (which
// still accepts the old shape). Before: every renewal and failed payment returned early on a missing subscription
// id (no ledger row, no period moved, never PAST_DUE), and every period write was `new Date(NaN)`, which Prisma
// refuses, so customer.subscription.updated 500'd on every retry.

/** The Subscription row for a Stripe subscription id, written from the invoice's metadata when it is missing. */
async function subscriptionRowFor(
  subId: string,
  invoice: Stripe.Invoice,
  stripeSub: Stripe.Subscription,
): Promise<{ userId: string; product: string; status: string } | null> {
  const row = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
  if (row) return row;
  // invoice.paid may land BEFORE checkout.session.completed (Stripe does not order events). The subscription's own
  // metadata (written at checkout, snapshotted onto every invoice) is enough to create the row the checkout would.
  const meta = { ...(stripeSub.metadata ?? {}), ...invoiceSubscriptionMetadata(invoice) } as Record<string, string>;
  if (!meta.userId || !isSubscriptionProduct(meta.product)) return null;
  const periodEnd = subscriptionPeriodEnd(stripeSub) ?? invoicePeriodEnd(invoice);
  return prisma.subscription.upsert({
    where: { stripeSubscriptionId: subId },
    update: {},
    create: {
      userId: meta.userId,
      stripeSubscriptionId: subId,
      stripePriceId: stripeSub.items?.data?.[0]?.price?.id ?? '',
      product: meta.product,
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd,
    },
  });
}

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;

  const amountCents = invoice.amount_paid ?? 0;
  if (amountCents <= 0) return; // trial or free

  // The Stripe read happens OUTSIDE the database transaction.
  const stripeSub = await getStripe().subscriptions.retrieve(subId);
  const sub = await subscriptionRowFor(subId, invoice, stripeSub);
  if (!sub) { console.warn(`[webhook] invoice.paid for unknown sub ${subId}`); return; }
  const periodEnd = subscriptionPeriodEnd(stripeSub) ?? invoicePeriodEnd(invoice);

  await prisma.$transaction(async (tx: any) => {
    // Update subscription period. A paid invoice re-opens the row (an unpaid subscription that was paid comes
    // back) unless Stripe has ended the subscription: a refund cancels it (lib/stripe/refund-revoke.ts), and an
    // invoice paid after that is recorded, never a re-grant.
    await tx.subscription.update({
      where: { stripeSubscriptionId: subId },
      data: {
        ...(subscriptionEnded(stripeSub) ? {} : { status: 'ACTIVE' }),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      },
    });
    // Ledger: EXTERNAL → PLATFORM_REVENUE. Keyed on the INVOICE, so a redelivered or replayed event (or both
    // events of a retry) books one payment once.
    await ledgerSubscriptionPayment(tx, {
      userId: sub.userId,
      amountCents,
      idempotencyKey: `stripe-invoice:${invoice.id}`,
      kind: `SUBSCRIPTION_PAYMENT_${sub.product}`,
      metadata: { invoiceId: invoice.id ?? null, subscriptionId: subId, product: sub.product },
    });
  });
}

async function handleInvoiceFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subId, status: { not: 'CANCELED' } },
    data: { status: 'PAST_DUE' },
  });
  console.log(`[webhook] Subscription ${subId} marked PAST_DUE`);
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
  if (!sub) return;

  const status = mapStripeStatus(stripeSub.status);
  const periodEnd = subscriptionPeriodEnd(stripeSub);
  // Stripe does not order events. An 'active' update delivered after a refund cancelled the subscription is stale:
  // before re-opening a CANCELED row, ask Stripe for the subscription as it is now.
  const stale = sub.status === 'CANCELED' && status === 'ACTIVE'
    && subscriptionEnded(await getStripe().subscriptions.retrieve(stripeSub.id));
  await prisma.subscription.update({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      ...(stale ? {} : { status }),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
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
