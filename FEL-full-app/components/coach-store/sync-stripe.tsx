'use client';

import { useState } from 'react';

/**
 * STORE-READY B8: the coach dashboard's "Sync with Stripe" button — POSTs the reconcile route and shows the
 * returned counts. The route runs reconcileCoachStore (paid checkouts nobody came back from, Dashboard refunds
 * and disputes). Counts only ever come back; no per-row or per-person detail is shown here.
 */
export function SyncWithStripe() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/coach-store/reconcile', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(json?.error === 'unauthorized' ? 'Not allowed.' : 'Sync failed. Try again.');
        return;
      }
      if (json?.skipped === 'payments_not_set_up') {
        setResult('Payments are not set up yet — nothing to sync.');
        return;
      }
      setResult(
        `Synced. Checked ${json.checked ?? 0}, fulfilled ${json.fulfilled ?? 0}, refund due ${json.refundDue ?? 0}, ` +
        `expired ${json.expired ?? 0}, refunded ${json.refunded ?? 0}, disputed ${json.disputed ?? 0}, restored ${json.restored ?? 0}, errors ${json.errors ?? 0}.`,
      );
    } catch {
      setResult('Sync failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-white/20 px-3 py-1 text-sm disabled:opacity-50"
      >
        {busy ? 'Syncing…' : 'Sync with Stripe'}
      </button>
      {result ? <span className="text-sm text-white/70" role="status">{result}</span> : null}
    </span>
  );
}
