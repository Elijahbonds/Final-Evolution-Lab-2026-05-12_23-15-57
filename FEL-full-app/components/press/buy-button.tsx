'use client';

import { useState } from 'react';
import { loginPath } from '@/lib/auth/safeNext';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

type Notice =
  | { kind: 'sign_in'; href: string }
  | { kind: 'adults_only'; href: string }
  | { kind: 'text'; text: string };

const TERMS_TICK = 'Please tick the box to agree to the store terms.';
const TERMS_UPDATED = 'The store terms were updated. Reload the page and tick the box again.';

/**
 * Buy one book offer. The same rules as the coach store (owner, 2026-10-13): sign in, a verified adult (18+), and
 * the store terms ticked. There is no guest checkout. The server checks all three again; this only explains them.
 */
export function BuyButton({
  offerId,
  label,
  prominent = false,
}: {
  offerId: string;
  label: string;
  prominent?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function buy() {
    if (busy || !termsAgreed) return;
    setBusy(true);
    setNotice(null);
    const here = typeof window !== 'undefined' ? window.location.pathname : '/press';
    try {
      const res = await fetch('/api/books/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offerId,
          idempotencyKey: crypto.randomUUID(),
          termsAccepted: true,
          termsVersion: STORE_TERMS_VERSION,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body?.url === 'string') {
        window.location.href = body.url;
        return;
      }
      if (res.status === 401 || body?.error === 'unauthorized') {
        setNotice({ kind: 'sign_in', href: loginPath(here) });
      } else if (res.status === 403 && body?.error === 'adults_only') {
        setNotice({ kind: 'adults_only', href: `/age?next=${encodeURIComponent(here)}` });
      } else if (res.status === 409 && body?.error === 'terms_required') {
        setNotice({ kind: 'text', text: body?.version === STORE_TERMS_VERSION ? TERMS_TICK : TERMS_UPDATED });
      } else {
        // A closed store answers 409 { error: 'store_closed', message } (STORE-READY B2); show its friendly message,
        // never the 'store_closed' code.
        const text = body?.error === 'store_closed' && typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string' ? body.error : 'Checkout is not available yet.';
        setNotice({ kind: 'text', text });
      }
      setBusy(false);
    } catch {
      setNotice({ kind: 'text', text: 'Checkout is not available yet.' });
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="mb-2 flex max-w-xs items-start gap-2 text-[11px] leading-snug text-white/60">
        <input
          type="checkbox"
          checked={termsAgreed}
          onChange={(e) => setTermsAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I agree to the{' '}
          <a className="font-semibold text-[#F5C518] underline" href="/store-terms" target="_blank" rel="noopener noreferrer">Store Terms of Service and Refund &amp; Cancellation Policy</a>.
        </span>
      </label>
      <button
        type="button"
        onClick={buy}
        disabled={busy || !termsAgreed}
        aria-busy={busy}
        className={
          prominent
            ? 'rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ffd84a] disabled:opacity-60'
            : 'rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#F5C518]/60 disabled:opacity-60'
        }
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      {notice?.kind === 'sign_in' ? (
        <p className="mt-2 max-w-xs text-xs text-white/70" role="alert">
          <a className="font-semibold text-[#F5C518] underline" href={notice.href}>Sign in to buy</a>
          {' '}— we&apos;ll bring you right back here.
        </p>
      ) : notice?.kind === 'adults_only' ? (
        <p className="mt-2 max-w-xs text-xs text-white/70" role="alert">
          Buying books is for verified adults (18+). If you&apos;re 18 or older,{' '}
          <a className="font-semibold text-[#F5C518] underline" href={notice.href}>confirm your birth year</a>, then come back.
        </p>
      ) : notice?.kind === 'text' ? (
        <p className="mt-2 max-w-xs text-xs text-white/70" role="status">{notice.text}</p>
      ) : null}
    </div>
  );
}
