export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { refundMetadata, walletChargeRefunded, walletCheckoutCompleted } from '@/lib/wallet/stripe-wallet-events';

/**
 * POST /api/v1/wallet/stripe-webhook
 *
 * The ONLY path that mints wallet currency from a real-money purchase:
 *   - COIN_PACK sessions mint coins; SHARD_PACK sessions mint shards (M25).
 *     The amount is server-owned (travels in session metadata) so no
 *     pre-registered Stripe price id is required.
 *   - Idempotent on the CHECKOUT SESSION id (`stripe-session:<id>`, the same
 *     key the server-verified success path fulfils under — SEC-F4 follow-up 1:
 *     one payment, one grant). It used to key on the Stripe event id, which a
 *     re-delivered webhook does NOT keep, and which the verify path never
 *     writes — so webhook + verify, or one redelivery, minted twice.
 *   - Signature-verified against STRIPE_WEBHOOK_SECRET before any mutation.
 *   - charge.refunded debits back the same currency, clamped at 0.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[v1/wallet/stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[v1/wallet/stripe-webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // LAUNCH-SALES: the dispatch lives in lib/wallet/stripe-wallet-events.ts, unchanged, so the shared
    // /api/stripe/webhook runs the same grants and refunds (one endpoint, one signing secret).
    if (event.type === 'checkout.session.completed') {
      return NextResponse.json(await walletCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session));
    }

    if (event.type === 'charge.refunded') {
      const md = await refundMetadata(stripe, event.data.object as Stripe.Charge);
      return NextResponse.json(await walletChargeRefunded(event, md));
    }

    return NextResponse.json({ received: true, ignored: event.type });
  } catch (e) {
    console.error('[v1/wallet/stripe-webhook] handler error', e);
    return NextResponse.json({ error: 'handler_error' }, { status: 500 });
  }
}
