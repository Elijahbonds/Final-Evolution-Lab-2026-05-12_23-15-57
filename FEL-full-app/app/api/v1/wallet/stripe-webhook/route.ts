export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { grantCoinPurchase, refundCoins, grantShardPurchase, refundShards } from '@/lib/wallet/wallet-service';
import { coinPackForPrice } from '@/lib/wallet/catalog';

/**
 * POST /api/v1/wallet/stripe-webhook
 *
 * The ONLY path that mints wallet currency from a real-money purchase:
 *   - COIN_PACK sessions mint coins; SHARD_PACK sessions mint shards (M25).
 *     The amount is server-owned (travels in session metadata) so no
 *     pre-registered Stripe price id is required.
 *   - Idempotent on the Stripe event id — a re-delivered webhook never
 *     double-credits.
 *   - Signature-verified against STRIPE_WEBHOOK_SECRET before any mutation.
 *   - charge.refunded debits back the same currency, clamped at 0.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[v1/wallet/stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[v1/wallet/stripe-webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const cs = event.data.object as Stripe.Checkout.Session;
      const playerId = (cs.client_reference_id || (cs.metadata as any)?.playerId) as string | undefined;
      if (!playerId) {
        console.warn('[v1/wallet/stripe-webhook] checkout.session without playerId; ignoring');
        return NextResponse.json({ received: true, ignored: 'no_player' });
      }
      // PRIMARY path: inline coin-store pack — coins travel in session metadata
      // (product COIN_PACK) so no pre-registered Stripe price id is required.
      const meta = (cs.metadata as any) || {};
      if (meta.product === 'COIN_PACK') {
        const coins = Number(meta.coins || 0);
        if (!Number.isFinite(coins) || coins <= 0) {
          console.warn('[v1/wallet/stripe-webhook] COIN_PACK with non-positive coins; refusing');
          return NextResponse.json({ received: true, ignored: 'bad_coin_amount' });
        }
        const res = await grantCoinPurchase(prisma, {
          playerId,
          coins,
          idempotencyKey: event.id, // Stripe event id = idempotency key.
          metadata: { packId: meta.packId ?? null, stripeSessionId: cs.id, via: 'metadata' },
        });
        return NextResponse.json({ received: true, granted_coins: coins, entry_id: res.entry_id });
      }

      // M25: real-money SHARD pack — shard amount travels in session metadata.
      if (meta.product === 'SHARD_PACK') {
        const shards = Number(meta.shards || 0);
        if (!Number.isFinite(shards) || shards <= 0) {
          console.warn('[v1/wallet/stripe-webhook] SHARD_PACK with non-positive shards; refusing');
          return NextResponse.json({ received: true, ignored: 'bad_shard_amount' });
        }
        const res = await grantShardPurchase(prisma, {
          playerId,
          shards,
          idempotencyKey: event.id, // Stripe event id = idempotency key.
          metadata: { packId: meta.packId ?? null, stripeSessionId: cs.id, via: 'metadata' },
        });
        return NextResponse.json({ received: true, granted_shards: shards, entry_id: res.entry_id });
      }

      // LEGACY path: resolve a mapped coin pack from the purchased price id.
      const line = await stripe.checkout.sessions.listLineItems(cs.id, { limit: 1 });
      const priceId = line.data[0]?.price?.id ?? null;
      const pack = coinPackForPrice(priceId);
      if (!pack) {
        // No mapped coin pack — e.g. a shard SKU would land here and is refused.
        console.warn(`[v1/wallet/stripe-webhook] no coin pack for price ${priceId}; refusing to mint`);
        return NextResponse.json({ received: true, ignored: 'no_coin_pack' });
      }
      const res = await grantCoinPurchase(prisma, {
        playerId,
        coins: pack.coins,
        idempotencyKey: event.id, // Stripe event id = idempotency key.
        metadata: { priceId, packLabel: pack.label, stripeSessionId: cs.id },
      });
      return NextResponse.json({ received: true, granted_coins: pack.coins, entry_id: res.entry_id });
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const md = (charge.metadata as any) || {};
      const playerId = md.playerId as string | undefined;

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
          return NextResponse.json({ received: true, refunded_shards: shards, entry_id: res.entry_id });
        }
        return NextResponse.json({ received: true, ignored: 'no_refund_target' });
      }

      const coins = Number(md.coins || 0);
      if (playerId && coins > 0) {
        const res = await refundCoins(prisma, {
          playerId,
          coins,
          idempotencyKey: event.id,
          metadata: { chargeId: charge.id },
        });
        return NextResponse.json({ received: true, refunded_coins: coins, entry_id: res.entry_id });
      }
      return NextResponse.json({ received: true, ignored: 'no_refund_target' });
    }

    return NextResponse.json({ received: true, ignored: event.type });
  } catch (e) {
    console.error('[v1/wallet/stripe-webhook] handler error', e);
    return NextResponse.json({ error: 'handler_error' }, { status: 500 });
  }
}
