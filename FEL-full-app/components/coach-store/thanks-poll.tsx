'use client';

import { useEffect, useState } from 'react';
import { VerifyCheckoutSession } from '@/components/stripe/verify-checkout-session';

export function ThanksPoll({ rowId, sessionId }: { rowId: string; sessionId?: string | null }) {
  const [status, setStatus] = useState('waiting');
  const [code, setCode] = useState<string | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  useEffect(() => {
    setCode(sessionStorage.getItem(`fel-unlock-${rowId}`));
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/coach-store/rows/${rowId}/status`);
      if (!res.ok) return;
      const json = await res.json();
      if (stop) return;
      setStatus(json.status ?? 'waiting');
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
      <VerifyCheckoutSession sessionId={sessionId} />
      <h1 className="text-2xl font-black">Thanks</h1>
      <p className="mt-2 text-sm">Payment status: {status}. The receipt is the source of truth once this says paid.</p>
      {code ? <p className="mt-4 text-sm">Teen code (shown once here): {code}. Progress stays on the phone that redeems it.</p> : null}
      <a className="mt-4 inline-block text-sm underline" href={`/api/coach-store/receipt/${rowId}`}>Download receipt</a>
      {ics ? <button type="button" className="mt-3 block text-sm underline" onClick={downloadIcs}>Add to calendar</button> : null}
    </div>
  );
}
