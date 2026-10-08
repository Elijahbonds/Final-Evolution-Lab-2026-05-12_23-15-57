'use client';

import { useEffect, useState } from 'react';
import { VerifyCheckoutSession } from '@/components/stripe/verify-checkout-session';

export function ThanksPoll({ rowId, sessionId }: { rowId: string; sessionId?: string | null }) {
  const [status, setStatus] = useState('waiting');
  const [programOpen, setProgramOpen] = useState(false);
  const [isAccess, setIsAccess] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  // STORE-READY B6: the verify call says refund_due, or the polled row is REFUND_DUE — either shows the same line.
  const [refundDue, setRefundDue] = useState(false);
  useEffect(() => {
    setCode(sessionStorage.getItem(`fel-unlock-${rowId}`));
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/coach-store/rows/${rowId}/status`);
      if (!res.ok) return;
      const json = await res.json();
      if (stop) return;
      setStatus(json.status ?? 'waiting');
      if (json.status === 'REFUND_DUE') setRefundDue(true);
      // STORE-READY B4: the "Open your program" link shows only for a server-confirmed open access row.
      if (json.kind === 'access') {
        setIsAccess(true);
        setProgramOpen(json.programOpen === true);
      }
      if (typeof json.ics === 'string') setIcs(json.ics);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(id); };
  }, [rowId]);
  const downloadIcs = () => {
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'coaching-call.ics';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="text-white">
      {/* SEC-F4 NO-WEBHOOK: check with Stripe first so the row flips to paid even with no
          webhook configured; the status poll below then picks it up. Idempotent on reload. */}
      <VerifyCheckoutSession sessionId={sessionId} onResult={(r) => { if (r.state === 'refund_due') setRefundDue(true); }} />
      <h1 className="text-2xl font-black">Thanks</h1>
      {refundDue ? (
        <p className="mt-2 rounded-xl border border-white/20 p-3 text-sm text-white/80" role="status">
          Your time was taken while you paid. Elijah will refund you in full or rebook you.
        </p>
      ) : null}
      <p className="mt-2 text-sm">Payment status: {status}. The receipt is the source of truth once this says paid.</p>
      {code ? <p className="mt-4 text-sm">Teen code (shown once here): {code}. Progress stays on the phone that redeems it.</p> : null}
      {/* STORE-READY B4: only an open program access row links to the player; unpaid/expired/refunded rows do not. */}
      {isAccess && programOpen ? <a className="mt-4 block text-sm underline" href={`/program/${rowId}`}>Open your program</a> : null}
      <a className="mt-4 inline-block text-sm underline" href={`/api/coach-store/receipt/${rowId}`}>Download receipt</a>
      {ics ? <button type="button" className="mt-3 block text-sm underline" onClick={downloadIcs}>Add to calendar</button> : null}
    </div>
  );
}
