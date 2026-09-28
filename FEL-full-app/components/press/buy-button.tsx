'use client';

import { useState } from 'react';

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
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/books/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerId, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.url !== 'string') {
        setError(typeof body?.error === 'string' ? body.error : 'Checkout is not available yet.');
        setBusy(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError('Checkout is not available yet.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        aria-busy={busy}
        className={
          prominent
            ? 'rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ffd84a] disabled:opacity-60'
            : 'rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#F5C518]/60 disabled:opacity-60'
        }
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      {error ? <p className="mt-2 max-w-xs text-xs text-[#ff8b8b]">{error}</p> : null}
    </div>
  );
}
