export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyCheckoutSession } from '@/lib/stripe/verify-checkout';

/**
 * POST /api/stripe/verify-session  { session_id }
 *
 * SEC-F4 NO-WEBHOOK: fulfil a Stripe Checkout WITHOUT the webhook. The success
 * pages post the session_id Stripe put in their redirect URL; the SERVER then
 * retrieves the session from Stripe (same STRIPE_SECRET_KEY the checkout routes
 * use) and grants only what the retrieved session proves — paid, this user's,
 * and the metadata Stripe holds, never the client's query params.
 *
 *   200 { status: 'fulfilled', ... }  — granted (or already granted: this route
 *                                       is idempotent; a reload returns the same)
 *   200 { status: 'pending' }         — Stripe has not collected payment yet
 *                                       (unpaid / open / expired); the page shows
 *                                       "payment pending" and may poll
 *   400 invalid_session               — not a Checkout Session id
 *   401                               — signed out
 *   403 not_your_session              — the session belongs to someone else
 *   404 session_not_found             — Stripe has no such session on this account
 *   503                               — payments not configured
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : '';
  if (!sessionId) return NextResponse.json({ error: 'invalid_session' }, { status: 400 });

  try {
    const result = await verifyCheckoutSession(userId, sessionId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending', product: result.product, message: 'payment pending' });
    }
    return NextResponse.json({ status: 'fulfilled', product: result.product, fulfilment: result.fulfilment });
  } catch (err: any) {
    // Fulfilment is idempotent; a transient error is safe to retry by re-POSTing.
    console.error('[verify-session] fulfilment error:', err?.message ?? 'unknown');
    return NextResponse.json({ error: 'fulfilment_failed' }, { status: 500 });
  }
}
