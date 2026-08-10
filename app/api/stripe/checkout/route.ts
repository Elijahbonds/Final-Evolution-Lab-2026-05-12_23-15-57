export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe, STRIPE_PRODUCTS, COSMETIC_SKUS } from '@/lib/stripe';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { isStudioCreatorEnabled } from '@/lib/flags';

/**
 * POST /api/stripe/checkout
 * Body: { product: 'FEL_PRO' | 'STUDIO_CREATOR' | 'COSMETIC', itemKey?: string, listingId?: string }
 * Returns: { url: string } — redirect to Stripe Checkout.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const { product, itemKey, listingId } = body as { product?: string; itemKey?: string; listingId?: string };

  if (!product) return NextResponse.json({ error: 'product required' }, { status: 400 });

  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  const stripe = getStripe();

  // Ensure Stripe customer exists
  let stripeCustomer = await prisma.stripeCustomer.findUnique({ where: { userId } });
  if (!stripeCustomer) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const cust = await stripe.customers.create({ email: user?.email ?? undefined, metadata: { userId } });
    stripeCustomer = await prisma.stripeCustomer.create({
      data: { userId, stripeCustomerId: cust.id },
    });
  }

  // --- Subscription product ---
  if (product === 'FEL_PRO' || product === 'STUDIO_CREATOR') {
    const cfg = STRIPE_PRODUCTS[product];
    // Check for existing active sub
    const existing = await prisma.subscription.findFirst({
      where: { userId, product, status: 'ACTIVE' },
    });
    if (existing) return NextResponse.json({ error: 'Already subscribed' }, { status: 409 });

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: cfg.name, description: cfg.description },
          unit_amount: cfg.priceUsd,
          recurring: { interval: cfg.interval },
        },
        quantity: 1,
      }],
      metadata: { userId, product },
      success_url: `${origin}/account?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account?stripe=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  }

  // --- Cosmetic one-time ---
  if (product === 'COSMETIC') {
    if (!itemKey || !COSMETIC_SKUS[itemKey]) {
      return NextResponse.json({ error: 'Invalid cosmetic itemKey' }, { status: 400 });
    }
    const sku = COSMETIC_SKUS[itemKey];
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: sku.name, description: sku.description },
          unit_amount: sku.priceUsd,
        },
        quantity: 1,
      }],
      metadata: { userId, product: 'COSMETIC', itemKey },
      success_url: `${origin}/shop?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?stripe=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  }

  // --- Studio build credit pack (M3 Track C) ---
  if (product === 'STUDIO_CREDITS') {
    if (!isStudioCreatorEnabled()) {
      return NextResponse.json({ error: 'feature_disabled' }, { status: 403 });
    }
    if (!itemKey || !STUDIO_CREDIT_PACKS[itemKey]) {
      return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
    }
    const pack = STUDIO_CREDIT_PACKS[itemKey];
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: pack.label, description: `${pack.credits} NEXUS Studio build credits` },
          unit_amount: pack.priceUsdCents,
        },
        quantity: 1,
      }],
      metadata: { userId, product: 'STUDIO_CREDITS', itemKey, credits: String(pack.credits) },
      success_url: `${origin}/studio?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/studio?credits=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  }

  // --- Marketplace listing ---
  if (product === 'MARKETPLACE') {
    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing || !listing.active) {
      return NextResponse.json({ error: 'Listing not found or inactive' }, { status: 404 });
    }
    // Can't buy your own listing
    if (listing.creatorId === userId) {
      return NextResponse.json({ error: 'Cannot purchase your own listing' }, { status: 400 });
    }
    // Already purchased?
    const alreadyBought = await prisma.marketplacePurchase.findUnique({
      where: { buyerId_listingId: { buyerId: userId, listingId } },
    });
    if (alreadyBought) return NextResponse.json({ error: 'Already purchased' }, { status: 409 });

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: listing.title, description: listing.description || '' },
          unit_amount: listing.priceUsd,
        },
        quantity: 1,
      }],
      metadata: { userId, product: 'MARKETPLACE', listingId, creatorId: listing.creatorId, itemKey: listing.itemKey },
      success_url: `${origin}/marketplace?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/marketplace?stripe=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  }

  return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
}
