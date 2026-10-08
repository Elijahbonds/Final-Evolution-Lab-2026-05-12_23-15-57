export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { purchasesEnabledFromEnv } from '@/lib/wallet/purchases';
import { getShardPack, shardPackTotal } from '@/lib/shard-packs';
import { storeClosed } from '@/lib/coach-store/gate';
import { siteOrigin } from '@/lib/stripe/site-origin';

/**
 * POST /api/v1/wallet/shard-checkout
 * Body: { pack_id }
 * Returns: { url } — redirect to Stripe Checkout for a SHARD pack (M25).
 *
 * The shard amount is SERVER-OWNED (from lib/shard-packs) and travels in
 * session + payment_intent metadata so the webhook can mint shards WITHOUT a
 * pre-registered Stripe price id, and so a refund (charge.refunded) can debit
 * the same amount.
 *
 * STORE-READY B10: while the live-key fence is off, this route refuses with 409
 * store_closed (never 503) BEFORE any body read, Stripe call or DB write; the
 * store UI shows "purchases coming soon" while earned-shard spending still works.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // STORE-READY B10: no key -> payments_not_set_up; key but VIRTUAL_PURCHASES_ENABLED off ->
  // virtual_purchases_off. Both are 409 store_closed, never 503, before anything else runs.
  if (!(process.env.STRIPE_SECRET_KEY ?? '').trim()) return storeClosed('payments_not_set_up');
  if (!purchasesEnabledFromEnv()) return storeClosed('virtual_purchases_off');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const pack = getShardPack(typeof body?.pack_id === 'string' ? body.pack_id : '');
  if (!pack) return NextResponse.json({ error: 'unknown_pack' }, { status: 404 });

  const totalShards = shardPackTotal(pack);
  // STORE-READY B3/B10: Stripe URLs come from the server constant NEXTAUTH_URL, never the Origin header.
  const origin = siteOrigin();
  if (!origin) return storeClosed('site_url_not_set');
  const stripe = getStripe();

  try {
    // Reuse an existing Stripe customer if the app already tracks one.
    let customerId: string | undefined;
    const existing = await prisma.stripeCustomer.findUnique({ where: { userId: playerId } });
    if (existing) {
      customerId = existing.stripeCustomerId;
    } else {
      const user = await prisma.user.findUnique({ where: { id: playerId }, select: { email: true } });
      const cust = await stripe.customers.create({ email: user?.email ?? undefined, metadata: { userId: playerId } });
      await prisma.stripeCustomer.create({ data: { userId: playerId, stripeCustomerId: cust.id } });
      customerId = cust.id;
    }

    const desc = pack.badge
      ? `${pack.badge}${pack.bonus ? ` \u00b7 +${pack.bonus.toLocaleString()} bonus shards` : ''}`
      : (pack.bonus ? `+${pack.bonus.toLocaleString()} bonus shards` : 'Prepaid shards for plans, passes & live sessions');

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: playerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${pack.name} \u2014 ${totalShards.toLocaleString()} shards`, description: desc },
          unit_amount: pack.usdCents,
        },
        quantity: 1,
      }],
      // The webhook mints shards from this metadata (product SHARD_PACK).
      metadata: { playerId, product: 'SHARD_PACK', packId: pack.id, shards: String(totalShards) },
      // Mirror onto the PaymentIntent/Charge so charge.refunded can debit back.
      payment_intent_data: { metadata: { playerId, product: 'SHARD_PACK', shards: String(totalShards) } },
      // session_id lets /shop/shards fulfil through POST /api/stripe/verify-session even
      // when no webhook is configured (SEC-F4 NO-WEBHOOK follow-up).
      success_url: `${origin}/shop/shards?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop/shards?canceled=1`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[v1/wallet/shard-checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
