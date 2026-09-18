export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe, STRIPE_PRODUCTS, COSMETIC_SKUS } from '@/lib/stripe';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { isStudioCreatorEnabled } from '@/lib/flags';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';   // Cash App / BNPL / PayPal where each is actually supported
import { previewPurchase } from '@/lib/store/coachListing';
import { loadSharedProfile } from '@/lib/profile/profileServer';
import { PLATFORM_PROTOCOLS } from '@/lib/profile/protocol';
import type { CoachProgram } from '@/lib/profile/assignment';

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

  try {
    return await handleCheckout();
  } catch (e) {
    console.error('stripe checkout error', e);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }

  async function handleCheckout(): Promise<NextResponse> {

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
  if (product === 'FEL_PRO' || product === 'FEL_PRO_MONTHLY' || product === 'STUDIO_CREATOR'
    || product === 'FEL_COACH' || product === 'FEL_FACILITY') {
    const cfg = STRIPE_PRODUCTS[product as keyof typeof STRIPE_PRODUCTS];
    // FEL Pro sells at two cadences (weekly / monthly) that grant the SAME entitlement, so the
    // row written to Subscription — and every check that reads it — uses cfg.product, not the
    // checkout key. A monthly subscriber must never look un-subscribed to the attribute gate.
    const entitlementProduct = cfg.product;
    // Check for existing active sub — on the ENTITLEMENT, so buying weekly while already on
    // monthly is caught as a duplicate rather than quietly billing twice for the same thing.
    const existing = await prisma.subscription.findFirst({
      where: { userId, product: entitlementProduct, status: 'ACTIVE' },
    });
    if (existing) return NextResponse.json({ error: 'Already subscribed' }, { status: 409 });

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'subscription',
      payment_method_types: paymentMethodsFor('subscription') as never,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: cfg.name, description: cfg.description },
          unit_amount: cfg.priceUsd,
          recurring: { interval: cfg.interval },
        },
        quantity: 1,
      }],
      // `plan` keeps the cadence for reporting; `product` stays the entitlement the webhook writes
      metadata: { userId, product: entitlementProduct, plan: String(product) },
      success_url: `${origin}/account?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account?stripe=cancel`,
    });
    return NextResponse.json({ url: checkoutSession.url });
  }

  // --- A coach's training block (lib/store/) ---
  //
  // THE CLIENT'S PREVIEW IS NOT EVIDENCE. The buyer's page already ran `previewPurchase` and showed them
  // "5 of 12 open to you today" — and that computation happened on their machine, against data they could
  // edit, with a `sellable` boolean they could flip. So it is recomputed here, from the buyer's real
  // profile, and THIS answer is the one that decides whether money moves.
  //
  // Two things beyond the refusal that this branch exists to prevent:
  //   · THE PRICE COMES FROM THE LISTING, never the request body. A client-supplied amount is free money.
  //   · A COACH CANNOT BUY THEIR OWN BLOCK, which would otherwise be a clean way to launder a payment
  //     through the referral tree and back out as a commission.
  if (product === 'COACH_PROGRAM') {
    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing || !listing.active || listing.listingType !== 'COACH_PROGRAM') {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    if (listing.creatorId === userId) {
      return NextResponse.json({ error: 'You cannot buy your own block.' }, { status: 400 });
    }

    const already = await prisma.marketplacePurchase.findUnique({
      where: { buyerId_listingId: { buyerId: userId, listingId: listing.id } },
      select: { id: true },
    });
    if (already) return NextResponse.json({ error: 'You already own this.' }, { status: 409 });

    let program: CoachProgram;
    try {
      program = JSON.parse(listing.manifest) as CoachProgram;
    } catch {
      console.error('coach program listing has an unreadable manifest', listing.id);
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // the authoritative recompute
    const buyer = await loadSharedProfile(prisma, userId);
    const preview = previewPurchase(program, PLATFORM_PROTOCOLS, buyer);
    if (!preview.sellable) {
      // 409, not 400: the request is fine, the STATE says this sale should not happen. `advice` is the
      // sentence the buyer should read, and it already says what to do about it.
      return NextResponse.json(
        { error: 'not_sellable', detail: preview.advice, actionable: true, preview },
        { status: 409 },
      );
    }

    // price from the listing, in cents, never from the caller
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'payment',
      payment_method_types: paymentMethodsFor('payment') as never,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: listing.title,
            description: (listing.description ?? program.outcome ?? '').slice(0, 300) || undefined,
          },
          unit_amount: listing.priceUsd,
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        product: 'COACH_PROGRAM',
        listingId: listing.id,
        coachId: listing.creatorId,
        // what the buyer was told at the till, so a dispute can be answered with what they actually saw
        openAtPurchase: `${preview.openNow}/${preview.total}`,
      },
      success_url: `${origin}/coach/programs?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/coach/programs?stripe=cancel`,
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
      payment_method_types: paymentMethodsFor('payment') as never,
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
      payment_method_types: paymentMethodsFor('payment') as never,
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
      payment_method_types: paymentMethodsFor('payment') as never,
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
}
