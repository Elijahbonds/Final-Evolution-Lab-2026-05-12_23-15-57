export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getShardPack, shardPackTotal } from '@/lib/shard-packs';

/**
 * POST /api/v1/wallet/shard-checkout
 * Body: { pack_id }
 * Returns: { url } — redirect to Stripe Checkout for a SHARD pack (M25).
 *
 * The ONLY real-money product family. The shard amount is SERVER-OWNED (from
 * lib/shard-packs) and travels in session + payment_intent metadata so the
 * webhook can mint shards WITHOUT a pre-registered Stripe price id, and so a
 * refund (charge.refunded) can debit the same amount.
 *
 * If Stripe is not configured (no STRIPE_SECRET_KEY), returns 503 so the store
 * UI can show "purchases coming soon" while earned-shard spending still works.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const pack = getShardPack(typeof body?.pack_id === 'string' ? body.pack_id : '');
  if (!pack) return NextResponse.json({ error: 'unknown_pack' }, { status: 404 });

  const totalShards = shardPackTotal(pack);
  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
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
      success_url: `${origin}/shop/shards?paid=1`,
      cancel_url: `${origin}/shop/shards?canceled=1`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[v1/wallet/shard-checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
