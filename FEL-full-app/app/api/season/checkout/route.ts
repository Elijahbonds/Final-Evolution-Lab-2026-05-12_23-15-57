/**
 * app/api/season/checkout/route.ts
 * ================================
 * POST /api/season/checkout — start a Stripe Checkout for the season pass PRO
 * lane. Returns { url } for the client to redirect to.
 *
 * Rules this route exists to hold:
 *   - The PRO lane is COSMETIC-ONLY (Blueprint Pillar 7). Buying it changes no
 *     stat, no PRQ, no gameplay balance — only which cosmetics a tier hands out.
 *   - Price is server-owned and OWNER-owned: it comes from env via
 *     seasonPassProPriceUsdCents(). A client-supplied price is ignored, and with
 *     no price configured this route refuses to sell (503) rather than guessing.
 *   - Nothing is unlocked here. The lane opens only in the signature-verified
 *     webhook (app/api/v1/wallet/stripe-webhook) after Stripe confirms payment.
 *   - Dark by default behind SEASON_PASS_PURCHASE (403 while off).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { FEATURE_DISABLED, isSeasonPassPurchaseEnabled, seasonPassProPriceUsdCents } from '@/lib/flags';
import { getActiveSeason, getPassState } from '@/lib/season/season-service';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isSeasonPassPurchaseEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const priceUsdCents = seasonPassProPriceUsdCents();
  if (priceUsdCents === null) {
    console.warn('[season/checkout] SEASON_PASS_PRO_PRICE_USD_CENTS unset; refusing to sell');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const activeSeason = await getActiveSeason();
  if (!activeSeason) return NextResponse.json({ error: 'no_active_season' }, { status: 404 });

  // Already owned — never charge twice for the same season.
  const state = await getPassState(userId);
  if (state?.hasPro) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  const stripe = getStripe();

  try {
    // Reuse the app's Stripe customer when one already exists (same pattern as
    // the coin store) so a player's purchases stay on one customer record.
    let customerId: string | undefined;
    const existing = await prisma.stripeCustomer.findUnique({ where: { userId } });
    if (existing) {
      customerId = existing.stripeCustomerId;
    } else {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      const cust = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { userId },
      });
      await prisma.stripeCustomer.create({ data: { userId, stripeCustomerId: cust.id } });
      customerId = cust.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: userId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${activeSeason.name} — Season Pass PRO`,
            description: 'Rare and legendary cosmetics on every tier. Cosmetic only — never pay-to-win.',
          },
          unit_amount: priceUsdCents,
        },
        quantity: 1,
      }],
      // The webhook opens the lane from this metadata (product SEASON_PASS_PRO).
      // seasonId is pinned so a payment that lands after a season rolls over
      // still unlocks the season it was bought for, not whatever is active then.
      metadata: {
        playerId: userId,
        product: 'SEASON_PASS_PRO',
        seasonId: activeSeason.id,
        seasonKey: activeSeason.key,
      },
      payment_intent_data: {
        metadata: {
          playerId: userId,
          product: 'SEASON_PASS_PRO',
          seasonId: activeSeason.id,
        },
      },
      success_url: `${origin}/?season=pro-unlocked`,
      cancel_url: `${origin}/?season=pro-cancelled`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[season/checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
