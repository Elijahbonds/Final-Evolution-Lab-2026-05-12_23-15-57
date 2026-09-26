export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { bookStripeSecret, bookWebhookSecret } from '@/lib/books/bookCheckout';
import { recordBookCheckout, revokeBookCharge } from '@/lib/books/bookFulfill';
import { prismaBookStore } from '@/lib/books/bookStore';

/**
 * POST /api/books/webhook
 * Stripe signature, not a session. Subscribe this endpoint to
 * checkout.session.completed and charge.refunded in test mode.
 * The shared /api/stripe/webhook also delegates book events here so a single
 * existing endpoint still records the purchase.
 */
export async function POST(req: NextRequest) {
  const secret = bookWebhookSecret();
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
    console.error('[books-webhook] signature', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const store = prismaBookStore();
  try {
    if (event.type === 'checkout.session.completed') {
      const result = await recordBookCheckout(event.id, event.data.object as Stripe.Checkout.Session, store);
      return NextResponse.json({ received: true, ...result });
    }
    if (event.type === 'charge.refunded') {
      const result = await revokeBookCharge(event.id, event.data.object as Stripe.Charge, store);
      return NextResponse.json({ received: true, ...result });
    }
    return NextResponse.json({ received: true, ignored: true, reason: event.type });
  } catch (err) {
    console.error('[books-webhook]', event.type, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'fulfillment failed' }, { status: 500 });
  }
}
