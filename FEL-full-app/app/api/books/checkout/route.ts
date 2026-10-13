export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import {
  assertOfferSellable,
  BookCheckoutError,
  bookCheckoutGate,
  buildBookCheckoutParams,
  getBookStripe,
  stripeTaxEnabled,
} from '@/lib/books/bookCheckout';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { storeClosed } from '@/lib/coach-store/gate';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

/**
 * POST /api/books/checkout
 * Body: { offerId: string, termsAccepted: true, termsVersion: STORE_TERMS_VERSION, idempotencyKey?: string }
 *
 * Owner answers 2026-10-13, the coach store's rules, in the coach store's order (lib/coach-store/checkout.ts):
 *   1. closed store      -> 409 store_closed (BOOK_STORE_ENABLED off by default, no sk_test_ key, the B10 fence, no
 *                           NEXTAUTH_URL). Books charge the PLATFORM Stripe account, test keys only.
 *   2. not signed in     -> 401 unauthorized. There is no guest checkout.
 *   3. no terms tick, or not the current STORE_TERMS_VERSION -> 409 terms_required { version }, before any Stripe call.
 *   4. not a verified adult (isVerifiedAdult, unknown age counts as not adult) -> 403 adults_only.
 *   5. an offer whose format the store terms do not cover (ebook, bundle: lib/books/bookTerms.ts) -> 409
 *      format_not_offered, fail closed, before any Stripe customer exists. Audiobooks only until EBOOK-1.
 * Only then is a customer attached and a Checkout Session created. Stripe's success/cancel URLs come from
 * siteOrigin() (B3), never the request's Origin header. See bookCheckoutGate.
 */
export async function POST(req: NextRequest) {
  const ip = clientKeyFromHeaders(req.headers);
  const limited = rateLimit(`books-checkout:${ip}`, 12, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }

  const gate = bookCheckoutGate();
  if (!gate.ok) return storeClosed(gate.reason);
  const origin = gate.origin;

  let userId: string | undefined;
  let customerEmail: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    userId = (session?.user as { id?: string } | undefined)?.id || undefined;
    customerEmail = session?.user?.email ?? null;
  } catch (err) {
    console.error('[books-checkout] session lookup failed', err);
  }
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // The server is the terms gate (same check as the coach store): a missing tick OR a version that is not the
  // current one is a 409 terms_required BEFORE any Stripe call. The 409 body names the current version.
  if (body?.termsAccepted !== true || body?.termsVersion !== STORE_TERMS_VERSION) {
    return NextResponse.json({ error: 'terms_required', version: STORE_TERMS_VERSION }, { status: 409 });
  }
  if (!(await isVerifiedAdult(prisma, userId))) {
    return NextResponse.json({ error: 'adults_only' }, { status: 403 });
  }

  const offerId = typeof body?.offerId === 'string' ? body.offerId.slice(0, 120) : '';
  const idempotencyKey = typeof body?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(body.idempotencyKey)
    ? `book:${offerId}:${body.idempotencyKey}`
    : undefined;

  // The terms rule (lib/books/bookTerms.ts): refuse an ebook or a bundle BEFORE any Stripe customer is created.
  try {
    assertOfferSellable(offerId);
  } catch (err) {
    if (err instanceof BookCheckoutError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }

  let customerId: string | null = null;
  try {
    // The platform StripeCustomer (the coach store's) is the same Stripe account the books charge.
    const existing = await prisma.stripeCustomer.findUnique({ where: { userId } });
    customerId = existing?.stripeCustomerId ?? null;
    if (!customerId && customerEmail) {
      const cust = await getBookStripe().customers.create({ email: customerEmail, metadata: { userId } });
      try {
        const created = await prisma.stripeCustomer.create({ data: { userId, stripeCustomerId: cust.id } });
        customerId = created.stripeCustomerId;
      } catch {
        const again = await prisma.stripeCustomer.findUnique({ where: { userId } });
        customerId = again?.stripeCustomerId ?? cust.id;
      }
    }
  } catch (err) {
    console.error('[books-checkout] customer lookup skipped', err);
  }

  try {
    const params = buildBookCheckoutParams({
      offerId,
      origin,
      customerId,
      customerEmail,
      taxEnabled: stripeTaxEnabled(),
    });
    const checkout = await getBookStripe().checkout.sessions.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (!checkout.url) return NextResponse.json({ error: 'Checkout did not return a URL.' }, { status: 502 });
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    if (err instanceof BookCheckoutError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error('[books-checkout]', err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
