'use client';

/**
 * components/stripe/verify-checkout-params.tsx — SEC-F4 NO-WEBHOOK follow-up.
 *
 * The season-pass PRO success_url lands on `/` (`?season=pro-unlocked&session_id=…`).
 * app/page.tsx normally redirects a signed-in visitor straight to /play — which would
 * unmount any verify before it fired — so a checkout landing (`session_id` present)
 * skips that redirect and this component posts the session id to
 * /api/stripe/verify-session first: the server checks with Stripe that the session is
 * paid and this buyer's, and opens the lane through the same code as the webhook.
 * Idempotent: a reload of the same URL re-verifies and grants nothing twice. A
 * signed-in visitor is then sent on to /play.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { postVerifyCheckoutSession } from './verify-checkout-session';

export function VerifyCheckoutParams({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const sessionId = useSearchParams().get('session_id');

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const go = () => {
      if (!cancelled && signedIn) router.replace('/play?season=pro-unlocked');
    };
    postVerifyCheckoutSession(sessionId)
      .then((r) => {
        if (r.state === 'error') console.warn('[verify-checkout-params] server verify failed:', r.error);
      })
      .finally(go);
    return () => {
      cancelled = true;
    };
    // The session id IS the purchase; router/signedIn identity is not a reason to re-verify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return null;
}
