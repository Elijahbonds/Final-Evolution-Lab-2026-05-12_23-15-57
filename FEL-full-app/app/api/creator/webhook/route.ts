export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { bookStripeSecret } from '@/lib/books/bookCheckout';
import { handleCreatorEvent } from '@/lib/creator/creatorWebhook';
import { creatorStoreFromEnv } from '@/lib/creator/creatorStore.firestore';

/**
 * POST /api/creator/webhook
 * Stripe signature (STRIPE_CREATOR_WEBHOOK_SECRET), not a session. Subscribe this endpoint, in test mode,
 * to checkout.session.completed, checkout.session.expired and charge.refunded. Idempotent by event id.
 * A failure returns 500 so Stripe retries.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_CREATOR_WEBHOOK_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  const key = bookStripeSecret();
  if (!key) return NextResponse.json({ error: 'Stripe key not configured' }, { status: 500 });

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' as never });
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error('[creator-webhook] signature', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const store = creatorStoreFromEnv();
  if (!store) return NextResponse.json({ error: 'Booking store not configured' }, { status: 500 });
  try {
    const result = await handleCreatorEvent(event, store);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    console.error('[creator-webhook]', event.type, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'booking update failed' }, { status: 500 });
  }
}
