/**
 * lib/stripe/verify-checkout.ts — SEC-F4 NO-WEBHOOK: server-verified checkout fulfilment.
 *
 * Today a purchase is fulfilled only when Stripe calls us (app/api/stripe/webhook,
 * app/api/v1/wallet/stripe-webhook — both need STRIPE_WEBHOOK_SECRET). This helper is
 * the no-webhook path: after Stripe Checkout redirects the buyer back, the SERVER
 * retrieves the Checkout Session from Stripe itself and grants ONLY what that
 * session proves:
 *
 *   1. the id is a real `cs_…` — a lookup key, never a payload (no amount, product
 *      or coin count is ever read from the client's URL/body);
 *   2. stripe.checkout.sessions.retrieve (the same STRIPE_SECRET_KEY the checkout
 *      routes already use) says the session is PAID — payment_status 'paid', and
 *      for a subscription also status 'complete'. unpaid / open / expired grants
 *      NOTHING and reports 'pending';
 *   3. the session belongs to the signed-in user — metadata.userId /
 *      client_reference_id must match the authenticated session user, or 403;
 *   4. fulfilment runs through the SAME functions the webhooks use, keyed
 *      `stripe-session:<id>` — a key the webhooks never write (they key on the
 *      Stripe event id), and one the schema already dedupes: Order.stripeSessionId
 *      is unique, every ledger/wallet row is unique on its idempotency key, the
 *      entitlements are upserts (MarketplacePurchase) or status CAS
 *      (Booking HELD→PAID, ProgramAccess PENDING→ACTIVE). A page reload, a second
 *      verify call, or the webhook ALSO firing can never double-grant.
 */

import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { fulfilCheckoutSession, type CheckoutFulfilment } from '@/lib/stripe/checkout-fulfil';
import { coachStoreSessionMeta, fulfilCoachStoreCheckout } from '@/lib/coach-store/webhook';
import { grantCoinPurchase, grantShardPurchase } from '@/lib/wallet/wallet-service';
import { unlockProLane } from '@/lib/season/season-service';

export type VerifyCheckoutResult =
  | { ok: true; status: 'fulfilled'; product: string; fulfilment: Record<string, unknown> }
  | { ok: true; status: 'pending'; product: string | null }
  | { ok: false; status: number; error: string };

/** The ledger/wallet key this path fulfils under. Never written by the webhooks (they use
 *  `stripe-event:<id>` / the raw event id), always deduped per session by the schema's
 *  unique keys — see the header. Exported so a test (and a future reader) can assert on it. */
export function verifyIdempotencyKey(sessionId: string): string {
  return `stripe-session:${sessionId}`;
}

/**
 * Verify and fulfil one Checkout Session for the signed-in user. `sessionId` comes
 * from the client but is used only to look the session up at Stripe; everything
 * that is granted comes from the retrieved session's own metadata.
 */
export async function verifyCheckoutSession(userId: string, sessionId: string): Promise<VerifyCheckoutResult> {
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { ok: false, status: 400, error: 'invalid_session' };
  }

  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  } catch (err: any) {
    // Stripe answers 404 for an id that was never this account's — the response the
    // tamper case gets. Never log the error object: it can carry request detail.
    if (err?.type === 'StripeInvalidRequestError' || err?.statusCode === 404 || err?.code === 'resource_missing') {
      return { ok: false, status: 404, error: 'session_not_found' };
    }
    console.error('[verify-checkout] stripe retrieve failed:', err?.message ?? 'unknown');
    return { ok: false, status: 502, error: 'stripe_unavailable' };
  }

  // Ownership: the session must have been created FOR this user. Every checkout
  // route stamps metadata.userId and/or client_reference_id at creation time.
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const owner = meta.userId ?? meta.playerId ?? session.client_reference_id ?? null;
  if (!owner || owner !== userId) {
    return { ok: false, status: 403, error: 'not_your_session' };
  }

  // Paid? An open/unpaid/expired session grants nothing — the friendly
  // "payment pending" state the success pages poll past.
  if (!isPaidSession(session)) {
    return { ok: true, status: 'pending', product: meta.product ?? null };
  }

  const idempotencyKey = verifyIdempotencyKey(session.id);
  const product = meta.product ?? '';

  // Coach-store rows (booking / program access / membership) fulfil through the
  // coach-store webhook's own checkout handler.
  const coachMeta = coachStoreSessionMeta(session);
  if (coachMeta?.rowId) {
    await fulfilCoachStoreCheckout(session, coachMeta, idempotencyKey);
    return { ok: true, status: 'fulfilled', product, fulfilment: { kind: 'coach_store', rowId: coachMeta.rowId } };
  }

  // Wallet + season-pass products fulfil through the v1 wallet webhook's grants.
  if (product === 'COIN_PACK') {
    const coins = Number(meta.coins || 0);
    if (!Number.isFinite(coins) || coins <= 0) {
      console.warn('[verify-checkout] COIN_PACK with non-positive coins; refusing');
      return { ok: false, status: 422, error: 'bad_coin_amount' };
    }
    const res = await grantCoinPurchase(prisma, {
      playerId: userId,
      coins,
      idempotencyKey,
      metadata: { packId: meta.packId ?? null, stripeSessionId: session.id, via: 'verify-session' },
    });
    return { ok: true, status: 'fulfilled', product, fulfilment: { kind: 'coins', coins, entryId: res.entry_id, balances: res.balances } };
  }

  if (product === 'SHARD_PACK') {
    const shards = Number(meta.shards || 0);
    if (!Number.isFinite(shards) || shards <= 0) {
      console.warn('[verify-checkout] SHARD_PACK with non-positive shards; refusing');
      return { ok: false, status: 422, error: 'bad_shard_amount' };
    }
    const res = await grantShardPurchase(prisma, {
      playerId: userId,
      shards,
      idempotencyKey,
      metadata: { packId: meta.packId ?? null, stripeSessionId: session.id, via: 'verify-session' },
    });
    return { ok: true, status: 'fulfilled', product, fulfilment: { kind: 'shards', shards, entryId: res.entry_id, balances: res.balances } };
  }

  if (product === 'SEASON_PASS_PRO') {
    const res = await unlockProLane({
      userId,
      seasonId: typeof meta.seasonId === 'string' ? meta.seasonId : undefined,
      stripeEventId: idempotencyKey,
    });
    if (!res) {
      console.warn('[verify-checkout] SEASON_PASS_PRO for unknown season; not granted');
      return { ok: false, status: 422, error: 'no_season' };
    }
    return { ok: true, status: 'fulfilled', product, fulfilment: { kind: 'season_pro', seasonKey: res.seasonKey, backfilled: res.backfilled } };
  }

  // Everything else (subscriptions, cosmetics, studio credits, coach programs,
  // marketplace listings) fulfils through the stripe webhook's own handler.
  const fulfilment: CheckoutFulfilment = await fulfilCheckoutSession(session, idempotencyKey);
  if (fulfilment.kind === 'none') {
    return { ok: false, status: 422, error: 'unknown_product' };
  }
  return { ok: true, status: 'fulfilled', product: product || fulfilment.kind, fulfilment: fulfilment as unknown as Record<string, unknown> };
}

/**
 * Stripe's own word on whether the money moved. `payment_status: 'paid'` is the
 * gate for every mode; a subscription-mode session must also be `status:
 * 'complete'` (an open subscription checkout has paid nothing). `no_payment_required`
 * is not accepted: no product sold through these checkouts is free, so a $0
 * session is a misconfiguration, not a grant.
 */
export function isPaidSession(session: Stripe.Checkout.Session): boolean {
  if (session.payment_status !== 'paid') return false;
  if (session.mode === 'subscription' && session.status !== 'complete') return false;
  if (session.status === 'expired') return false;
  return true;
}
