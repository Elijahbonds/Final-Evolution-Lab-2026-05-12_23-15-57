export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import {
  BookCheckoutError,
  bookCheckoutGate,
  bookSharesPlatformStripeAccount,
  buildBookCheckoutParams,
  getBookStripe,
  stripeTaxEnabled,
} from '@/lib/books/bookCheckout';
import { storeClosed } from '@/lib/coach-store/gate';

/**
 * POST /api/books/checkout
 * Body: { offerId: string, idempotencyKey?: string }
 * Guest checkout is allowed. A signed-in buyer is attached by email.
 * Test mode only — assertStripeTestKey refuses sk_live_ before Stripe is called.
 *
 * MERGE (2026-10-09), ported to the release's store rules: every "cannot sell" answer is a 409 store_closed
 * (STORE-READY B2, was 503 test_mode_only); the B10 live-key fence VIRTUAL_PURCHASES_ENABLED (default OFF, "no
 * real-money product outside the coach store") closes book checkout too; Stripe's success/cancel URLs come from
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

  const body = await req.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId.slice(0, 120) : '';
  const idempotencyKey = typeof body?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(body.idempotencyKey)
    ? `book:${offerId}:${body.idempotencyKey}`
    : undefined;

  let customerId: string | null = null;
  let customerEmail: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    customerEmail = session?.user?.email ?? null;
    const userId = (session?.user as { id?: string } | undefined)?.id;
    // A saved StripeCustomer belongs to the platform account (STRIPE_SECRET_KEY). Reusing it on a separate book
    // account (STRIPE_BOOKS_SECRET_KEY) would name a customer that account does not have and the session would fail.
    if (userId && bookSharesPlatformStripeAccount()) {
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
