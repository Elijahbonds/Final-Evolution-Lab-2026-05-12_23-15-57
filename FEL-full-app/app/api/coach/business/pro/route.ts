// COACH-BUSINESS: POST → a Stripe Checkout for Coach Pro (the FEL_COACH subscription at the owner's
// COACH_PRO_PRICE_USD_CENTS). Closed (409 store_closed) while COACH_PRO_ENABLED is off or no price is set; the existing
// webhook, verify and refund paths handle the subscription once bought (lib/coach-business/pro.ts).
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe';
import { adultBuyerGate } from '@/lib/stripe/adult-gate';
import { ensureStripeCustomer } from '@/lib/stripe/product-checkout';
import { PAYMENTS_NOT_LIVE } from '@/lib/coach-business/config';
import { proCheckoutParams, proGate } from '@/lib/coach-business/pro';
import { readCoachPlan } from '@/lib/coach-business/planServer';
import { bad, json, planDb, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const gate = proGate();
  if (!gate.ok) {
    console.warn(`[coach-business] pro closed reason=${gate.reason}`);
    return bad('store_closed', 409, { reason: gate.reason, message: PAYMENTS_NOT_LIVE });
  }
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:pro:${userId}`, 5, 60_000).ok) return bad('rate_limited', 429);
  if ((await readCoachPlan(planDb(), userId)) === 'pro') return bad('already_pro', 409);
  const refused = await adultBuyerGate(prisma, userId);
  if (refused) return refused;
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(stripe, userId);
  const s = await stripe.checkout.sessions.create(proCheckoutParams({ userId, customerId, priceCents: gate.priceCents, origin: gate.origin }));
  return json({ url: s.url });
}
