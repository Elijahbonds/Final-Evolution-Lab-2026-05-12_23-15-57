'use client';

import { useState } from 'react';

function endLabel(accessUntil: string | null): string {
  if (!accessUntil) return 'Cancelled.';
  const d = new Date(accessUntil);
  if (Number.isNaN(d.getTime())) return 'Cancelled.';
  return `Cancelled. Access ends ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
}

export function CancelMembership({ accessId }: { accessId: string }) {
  // STORE-READY B9: after a successful cancel the button is replaced by the "Cancelled. Access ends <date>"
  // line (the server returns accessUntil = the subscription's period end). A failure keeps the button so the
  // member can retry — a cancel that only half-happened must never look done.
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (done) return <p className="mt-2 text-sm">{done}</p>;

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        className="rounded-lg border px-3 py-1 disabled:opacity-50"
        onClick={() => {
          void (async () => {
            setBusy(true);
            setFailed(false);
            try {
              const res = await fetch(`/api/coach-store/access/${accessId}/cancel`, { method: 'POST' });
              const json = (await res.json().catch(() => ({}))) as { ok?: boolean; accessUntil?: string | null };
              if (res.ok && json.ok) setDone(endLabel(json.accessUntil ?? null));
              else setFailed(true);
            } catch {
              setFailed(true);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? 'Cancelling…' : 'Cancel membership'}
      </button>
      {failed ? <p className="mt-1 text-xs text-red-400">That did not go through. Nothing changed — try again.</p> : null}
    </div>
  );
}

