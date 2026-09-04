export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getCoinStorePack, coinStorePackTotal } from '@/lib/wallet/catalog';

/**
 * POST /api/v1/wallet/checkout
 * Body: { pack_id }
 * Returns: { url } — redirect to Stripe Checkout for a COIN pack.
 *
 * Monetization entry point. Coins ONLY (shards are never sold). The pack price
 * is SERVER-OWNED (from the catalog); a client-supplied price is ignored. The
 * granted coin amount travels in session metadata so the webhook can mint them
 * WITHOUT needing a pre-registered Stripe price id.
 *
 * If Stripe is not configured (no STRIPE_SECRET_KEY), returns 503 so the store
 * UI can show "purchases coming soon" while still allowing earned-coin spending.
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

  const pack = getCoinStorePack(typeof body?.pack_id === 'string' ? body.pack_id : '');
  if (!pack) return NextResponse.json({ error: 'unknown_pack' }, { status: 404 });

  const totalCoins = coinStorePackTotal(pack);
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

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: playerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${pack.label} — ${totalCoins.toLocaleString()} coins`, description: pack.blurb },
          unit_amount: pack.priceUsdCents,
        },
        quantity: 1,
      }],
      // The webhook mints coins from this metadata (product COIN_PACK).
      metadata: { playerId, product: 'COIN_PACK', packId: pack.id, coins: String(totalCoins) },
      payment_intent_data: { metadata: { playerId, coins: String(totalCoins) } },
      success_url: `${origin}/store?purchase=success`,
      cancel_url: `${origin}/store?purchase=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[v1/wallet/checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
