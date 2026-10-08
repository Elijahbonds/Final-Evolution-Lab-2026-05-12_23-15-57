'use client';

/**
 * components/stripe/verify-checkout-session.tsx — SEC-F4 NO-WEBHOOK follow-up.
 *
 * Every Stripe Checkout success_url carries `session_id={CHECKOUT_SESSION_ID}`.
 * The page it lands on mounts this so the SERVER checks with Stripe — retrieves
 * the session, requires payment_status 'paid' and the signed-in buyer — and
 * fulfils through the same code as the webhook. Without a configured webhook
 * this is the ONLY fulfilment; with one it is a no-op race the schema's unique
 * keys settle (one payment, one grant). Safe on reload: verify is idempotent.
 *
 * Renders nothing; reports through the optional callback. A non-ok answer
 * (signed out, not your session, unknown session) is retried by a reload, and
 * the webhook remains the fallback — so it is logged, not thrown.
 */

import { useEffect } from 'react';

export type VerifyCheckoutState =
  | { state: 'idle' | 'verifying' }
  | { state: 'fulfilled'; product: string }
  | { state: 'pending'; product: string | null }
  | { state: 'refund_due'; product: string | null }
  | { state: 'error'; error: string };

export async function postVerifyCheckoutSession(sessionId: string): Promise<VerifyCheckoutState> {
  try {
    const res = await fetch('/api/stripe/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { state: 'error', error: typeof json?.error === 'string' ? json.error : `http_${res.status}` };
    if (json?.status === 'pending') return { state: 'pending', product: typeof json?.product === 'string' ? json.product : null };
    if (json?.status === 'refund_due') return { state: 'refund_due', product: typeof json?.product === 'string' ? json.product : null };
    return { state: 'fulfilled', product: typeof json?.product === 'string' ? json.product : '' };
  } catch {
    return { state: 'error', error: 'network' };
  }
}

export function VerifyCheckoutSession({
  sessionId,
  onResult,
}: {
  sessionId: string | null | undefined;
  onResult?: (r: VerifyCheckoutState) => void;
}) {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    onResult?.({ state: 'verifying' });
    void postVerifyCheckoutSession(sessionId).then((r) => {
      if (cancelled) return;
      if (r.state === 'error') console.warn('[verify-checkout-session] server verify failed:', r.error);
      onResult?.(r);
    });
    return () => {
      cancelled = true;
    };
    // The session id IS the purchase; onResult identity is not a reason to re-verify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  return null;
}
