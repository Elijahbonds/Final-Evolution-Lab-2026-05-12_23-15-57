export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { assertStripeTestKey, bookStripeSecret } from '@/lib/books/bookCheckout';
import { CreatorCheckoutError, startServiceCheckout } from '@/lib/creator/creatorCheckout';
import { creatorStoreFromEnv } from '@/lib/creator/creatorStore.firestore';

/**
 * POST /api/creator/checkout
 * Body: { serviceId: string, slotStart: string (ISO), email?: string }
 * Guest checkout is allowed. Test mode only: assertStripeTestKey refuses anything but sk_test_ before a
 * hold is taken or Stripe is called. The slot is re-validated here and held in a Firestore transaction.
 */
export async function POST(req: NextRequest) {
  const ip = clientKeyFromHeaders(req.headers);
  const limited = rateLimit(`creator-checkout:${ip}`, 10, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }

  try {
    assertStripeTestKey(bookStripeSecret());
  } catch {
    return NextResponse.json(
      { error: 'Booking checkout is test-mode only and is not configured.', code: 'test_mode_only' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const origin = (req.headers.get('origin') || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  try {
    const result = await startServiceCheckout(
      { serviceId: body?.serviceId, slotStart: body?.slotStart, email: body?.email, origin },
      { store: creatorStoreFromEnv() },
    );
    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof CreatorCheckoutError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error('[creator-checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
