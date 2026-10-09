export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { bookCheckoutGate } from '@/lib/books/bookCheckout';
import { storeClosed } from '@/lib/coach-store/gate';
import { CreatorCheckoutError, startServiceCheckout } from '@/lib/creator/creatorCheckout';
import { creatorStoreFromEnv } from '@/lib/creator/creatorStore.firestore';

/**
 * POST /api/creator/checkout
 * Body: { serviceId: string, slotStart: string (ISO), email?: string }
 * Guest checkout is allowed. Test mode only: bookCheckoutGate refuses anything but sk_test_ (and a closed B10
 * fence, and an unset NEXTAUTH_URL) as a 409 store_closed before a hold is taken or Stripe is called. The slot is re-validated here and held in a Firestore transaction.
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

  // MERGE (2026-10-09): the release's store rules (B2 409 store_closed, B3 server origin, B10 fence) through the
  // book shop's gate, before a hold is taken or Stripe is called. startServiceCheckout asks the same gate again.
  const gate = bookCheckoutGate();
  if (!gate.ok) return storeClosed(gate.reason);

  const body = await req.json().catch(() => ({}));
  try {
    const result = await startServiceCheckout(
      { serviceId: body?.serviceId, slotStart: body?.slotStart, email: body?.email },
      { store: creatorStoreFromEnv() },
    );
    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof CreatorCheckoutError) {
      if (err.code === 'store_closed' && err.reason) return storeClosed(err.reason);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error('[creator-checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
