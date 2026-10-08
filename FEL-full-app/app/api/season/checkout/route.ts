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
 *     no price configured this route refuses to sell (409 store_closed price_not_set)
 *     rather than guessing.
 *   - STORE-READY B10: fenced with VIRTUAL_PURCHASES_ENABLED on top of its own
 *     SEASON_PASS_PURCHASE + price gates; every refusal below is 409 store_closed
 *     (never 503) before any Stripe call or prisma write.
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
import { FEATURE_DISABLED, isSeasonPassPurchaseEnabled, isVirtualPurchasesEnabled, seasonPassProPriceUsdCents } from '@/lib/flags';
import { getActiveSeason, getPassState } from '@/lib/season/season-service';
import { storeClosed } from '@/lib/coach-store/gate';
import { siteOrigin } from '@/lib/stripe/site-origin';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isSeasonPassPurchaseEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }
  // STORE-READY B10: every refusal this route used to answer 503 for is 409 store_closed — no key,
  // the B10 live-key fence off (the season pass PRO lane is fenced with the SAME flag), no price —
  // all BEFORE getActiveSeason(), getStripe(), customers.create or any prisma write.
  if (!(process.env.STRIPE_SECRET_KEY ?? '').trim()) return storeClosed('payments_not_set_up');
  if (!isVirtualPurchasesEnabled()) return storeClosed('virtual_purchases_off');

  const priceUsdCents = seasonPassProPriceUsdCents();
  if (priceUsdCents === null) {
    console.warn('[season/checkout] SEASON_PASS_PRO_PRICE_USD_CENTS unset; refusing to sell');
    return storeClosed('price_not_set');
  }

  const activeSeason = await getActiveSeason();
  if (!activeSeason) return NextResponse.json({ error: 'no_active_season' }, { status: 404 });

  // Already owned — never charge twice for the same season.
  const state = await getPassState(userId);
  if (state?.hasPro) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  // STORE-READY B3/B10: Stripe URLs come from the server constant NEXTAUTH_URL, never the Origin header.
  const origin = siteOrigin();
  if (!origin) return storeClosed('site_url_not_set');
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
      // session_id lets the landing page fulfil through POST /api/stripe/verify-session
      // even when no webhook is configured (SEC-F4 NO-WEBHOOK follow-up).
      success_url: `${origin}/?season=pro-unlocked&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?season=pro-cancelled`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[season/checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
