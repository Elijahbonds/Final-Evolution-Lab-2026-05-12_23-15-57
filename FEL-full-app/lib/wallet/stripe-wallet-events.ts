/**
 * lib/wallet/stripe-wallet-events.ts — the coin pack, shard pack and season pass PRO half of a Stripe webhook, moved
 * out of app/api/v1/wallet/stripe-webhook/route.ts unchanged (LAUNCH-SALES, 2026-10-20) so the SHARED webhook
 * (app/api/stripe/webhook) runs the same code.
 *
 * Why: one Stripe webhook endpoint has one signing secret, and both routes verify against STRIPE_WEBHOOK_SECRET, so
 * only one of the two endpoints can be subscribed in a real account. The coach-store runbook subscribes the shared
 * one. Before this, a season pass PRO checkout reaching the shared endpoint fell into fulfilCheckoutSession, which
 * read `metadata.userId` (the season checkout writes `playerId`) and granted nothing, and a refund of it revoked
 * nothing. Now either endpoint fulfils and refunds every wallet product, under the same keys:
 *
 *   - a grant is keyed on the CHECKOUT SESSION (`stripe-session:<id>`), shared with POST /api/stripe/verify-session,
 *     so webhook + verify + a redelivery grant once;
 *   - a refund is keyed on the Stripe event id, so the same event delivered to both endpoints debits once.
 */
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { grantCoinPurchase, refundCoins, grantShardPurchase, refundShards } from '@/lib/wallet/wallet-service';
import { coinPackForPrice } from '@/lib/wallet/catalog';
import { unlockProLane, revokeProLane } from '@/lib/season/season-service';
import { verifyIdempotencyKey } from '@/lib/stripe/verify-checkout';

/** The wallet products a Checkout Session can carry in metadata.product. */
export const WALLET_PRODUCTS = ['COIN_PACK', 'SHARD_PACK', 'SEASON_PASS_PRO'] as const;

export type WalletEventResult = Record<string, unknown> & { received: true };

function metaOf(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

/** Is this Checkout Session one of the wallet's (explicit metadata product)? The legacy price-id path is not. */
export function isWalletSession(session: Stripe.Checkout.Session): boolean {
  return (WALLET_PRODUCTS as readonly string[]).includes(String(metaOf(session.metadata).product ?? ''));
}

/** Is this refund metadata one of the wallet's? (season PRO, shard pack, or a coin pack's `coins`.) */
export function isWalletRefundMeta(md: Record<string, any>): boolean {
  if (typeof md.playerId !== 'string' || !md.playerId) return false;
  return md.product === 'SEASON_PASS_PRO' || md.product === 'SHARD_PACK' || Number(md.coins || 0) > 0;
}

/**
 * The refunded charge's metadata. The checkout routes copy theirs onto the payment intent (payment_intent_data), and
 * Stripe copies a payment intent's metadata onto the charge it creates. assumption: that copy holds for every charge;
 * when a charge arrives without it, the payment intent's own metadata is read instead.
 */
export async function refundMetadata(stripe: Stripe, charge: Stripe.Charge): Promise<Record<string, any>> {
  const md = metaOf(charge.metadata);
  if (Object.keys(md).length > 0) return md;
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return md;
  try {
    const intent = await stripe.paymentIntents.retrieve(pi);
    return metaOf(intent.metadata);
  } catch (err) {
    console.warn('[wallet-events] payment intent metadata read failed', (err as Error)?.message ?? 'unknown');
    return md;
  }
}

/** checkout.session.completed for a wallet product (or the legacy coin-pack price path). Exactly the old route's. */
export async function walletCheckoutCompleted(stripe: Stripe, cs: Stripe.Checkout.Session): Promise<WalletEventResult> {
  const playerId = (cs.client_reference_id || metaOf(cs.metadata).playerId) as string | undefined;
  if (!playerId) {
    console.warn('[v1/wallet/stripe-webhook] checkout.session without playerId; ignoring');
    return { received: true, ignored: 'no_player' };
  }
  // ONE PAYMENT, ONE GRANT: the grant key is the session, not the event — the same key
  // POST /api/stripe/verify-session fulfils under, so whichever of webhook/verify runs
  // first (or both, or a redelivery) the buyer is credited exactly once.
  const grantKey = verifyIdempotencyKey(cs.id);
  // PRIMARY path: inline coin-store pack — coins travel in session metadata
  // (product COIN_PACK) so no pre-registered Stripe price id is required.
  const meta = metaOf(cs.metadata);
  if (meta.product === 'COIN_PACK') {
    const coins = Number(meta.coins || 0);
    if (!Number.isFinite(coins) || coins <= 0) {
      console.warn('[v1/wallet/stripe-webhook] COIN_PACK with non-positive coins; refusing');
      return { received: true, ignored: 'bad_coin_amount' };
    }
    const res = await grantCoinPurchase(prisma, {
      playerId,
      coins,
      idempotencyKey: grantKey, // Checkout Session id = idempotency key (shared with verify-session).
      metadata: { packId: meta.packId ?? null, stripeSessionId: cs.id, via: 'metadata' },
    });
    return { received: true, granted_coins: coins, entry_id: res.entry_id };
  }

  // M25: real-money SHARD pack — shard amount travels in session metadata.
  if (meta.product === 'SHARD_PACK') {
    const shards = Number(meta.shards || 0);
    if (!Number.isFinite(shards) || shards <= 0) {
      console.warn('[v1/wallet/stripe-webhook] SHARD_PACK with non-positive shards; refusing');
      return { received: true, ignored: 'bad_shard_amount' };
    }
    const res = await grantShardPurchase(prisma, {
      playerId,
      shards,
      idempotencyKey: grantKey, // Checkout Session id = idempotency key (shared with verify-session).
      metadata: { packId: meta.packId ?? null, stripeSessionId: cs.id, via: 'metadata' },
    });
    return { received: true, granted_shards: shards, entry_id: res.entry_id };
  }

  // M13: season pass PRO lane — opens the cosmetic-only paid lane for the
  // season the checkout was started in (seasonId travels in metadata so a
  // late-landing payment can't unlock the wrong season). Back-fill of
  // already-earned PRO tiers is idempotent on the same PassGrant dedupeKeys,
  // so a redelivered event grants nothing twice.
  if (meta.product === 'SEASON_PASS_PRO') {
    const res = await unlockProLane({
      userId: playerId,
      seasonId: typeof meta.seasonId === 'string' ? meta.seasonId : undefined,
      stripeEventId: grantKey,
    });
    if (!res) {
      console.warn('[v1/wallet/stripe-webhook] SEASON_PASS_PRO for unknown season; ignoring');
      return { received: true, ignored: 'no_season' };
    }
    return { received: true, pro_unlocked: res.seasonKey, backfilled: res.backfilled };
  }

  // LEGACY path: resolve a mapped coin pack from the purchased price id.
  const line = await stripe.checkout.sessions.listLineItems(cs.id, { limit: 1 });
  const priceId = line.data[0]?.price?.id ?? null;
  const pack = coinPackForPrice(priceId);
  if (!pack) {
    // No mapped coin pack — e.g. a shard SKU would land here and is refused.
    console.warn(`[v1/wallet/stripe-webhook] no coin pack for price ${priceId}; refusing to mint`);
    return { received: true, ignored: 'no_coin_pack' };
  }
  const res = await grantCoinPurchase(prisma, {
    playerId,
    coins: pack.coins,
    idempotencyKey: grantKey, // Checkout Session id = idempotency key (shared with verify-session).
    metadata: { priceId, packLabel: pack.label, stripeSessionId: cs.id },
  });
  return { received: true, granted_coins: pack.coins, entry_id: res.entry_id };
}

/**
 * charge.refunded for a wallet product, given the charge's metadata (refundMetadata). The old route's logic; the one
 * difference is upstream, in refundMetadata: a charge with no metadata of its own is read through its payment intent.
 */
export async function walletChargeRefunded(event: Stripe.Event, md: Record<string, any>): Promise<WalletEventResult> {
  const charge = event.data.object as Stripe.Charge;
  const playerId = md.playerId as string | undefined;

  // M13: season pass PRO refund — close the lane so no further PRO rewards
  // are booked. revokeProLane also withdraws the wearables the PRO lane
  // delivered this season (the grant log itself stays append-only); nothing
  // about balance is bought back.
  if (playerId && md.product === 'SEASON_PASS_PRO') {
    const revoked = await revokeProLane({
      userId: playerId,
      seasonId: typeof md.seasonId === 'string' ? md.seasonId : undefined,
      stripeEventId: event.id,
    });
    return { received: true, pro_revoked: revoked };
  }

  // M25: shard-pack refund — debit unspent shards (clamped at 0 so a player
  // who already spent some can never go negative).
  if (playerId && md.product === 'SHARD_PACK') {
    const shards = Number(md.shards || 0);
    if (shards > 0) {
      const res = await refundShards(prisma, {
        playerId,
        shards,
        idempotencyKey: event.id,
        metadata: { chargeId: charge.id },
      });
      return { received: true, refunded_shards: shards, entry_id: res.entry_id };
    }
    return { received: true, ignored: 'no_refund_target' };
  }

  const coins = Number(md.coins || 0);
  if (playerId && coins > 0) {
    const res = await refundCoins(prisma, {
      playerId,
      coins,
      idempotencyKey: event.id,
      metadata: { chargeId: charge.id },
    });
    return { received: true, refunded_coins: coins, entry_id: res.entry_id };
  }
  return { received: true, ignored: 'no_refund_target' };
}
