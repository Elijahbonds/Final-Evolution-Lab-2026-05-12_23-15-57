'use client';
// COACH-BUSINESS: the Stripe success page for a coach's package. Asks the server to confirm the payment with Stripe
// itself (the no-webhook rule), then says what happens next.
import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CheckoutThanks({ sessionId, api = '/api/coach/business/checkout/verify' }: { sessionId: string; api?: string }) {
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'error'>('checking');
  useEffect(() => {
    if (!sessionId) { setState('error'); return; }
    fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setState(ok && j.status === 'paid' ? 'paid' : ok ? 'pending' : 'error'))
      .catch(() => setState('error'));
  }, [api, sessionId]);
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-white" data-thanks={state}>
      <h1 className="text-2xl font-black">{state === 'paid' ? 'You’re booked' : state === 'checking' ? 'Confirming your payment…' : state === 'pending' ? 'Payment processing' : 'We could not confirm that payment'}</h1>
      <p className="mt-3 text-sm text-white/70">
        {state === 'paid' ? 'Your coach has your booking and will be in touch. Your receipt is on its way from Stripe.'
          : state === 'pending' ? 'Stripe is still processing it. Your coach is told the moment it clears.'
          : state === 'error' ? 'If you were charged, your receipt from Stripe is your record, and your coach is told when it clears.' : ''}
      </p>
      <Link href="/coach" className="mt-6 inline-block rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black">Go to Coach</Link>
    </main>
  );
}
