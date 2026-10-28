'use client';
// COACH-BUSINESS: a client approves (or withdraws) a result their coach would like to show. Nothing about them is shown
// with it — not their name — and an under-18 account cannot approve one.
import { useEffect, useState } from 'react';

type H = { id: string; text: string; state: 'waiting' | 'approved' | 'withdrawn' };

export function HighlightConsent({ id, api = '/api/coach/business/highlights' }: { id: string; api?: string }) {
  const [h, setH] = useState<H | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${api}/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j ? setH(j) : setMsg('This link is not for this account.'))).catch(() => setMsg('This did not load.'));
  }, [api, id]);
  const act = async (action: 'approve' | 'withdraw') => {
    const r = await fetch(`${api}/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && h) setH({ ...h, state: j.state });
    else setMsg(typeof j.message === 'string' ? j.message : 'That did not save.');
  };
  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-white" data-highlight-consent>
      <h1 className="text-2xl font-black">Share a result?</h1>
      <p className="mt-2 text-sm text-white/70">Your coach would like to show this on their public page. Only these words show, never your name. You can withdraw it any time.</p>
      {h ? (
        <>
          <blockquote className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-base">“{h.text}”</blockquote>
          <p className="mt-2 text-sm text-white/60">{h.state === 'approved' ? 'Shared on your coach’s page.' : h.state === 'withdrawn' ? 'Not shared.' : 'Not shared yet.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {h.state !== 'approved' ? <button type="button" onClick={() => act('approve')} className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-bold text-black">Share it</button> : null}
            {h.state === 'approved' ? <button type="button" onClick={() => act('withdraw')} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-bold">Withdraw it</button> : null}
          </div>
        </>
      ) : null}
      {msg ? <p role="alert" className="mt-4 text-sm text-amber-200">{msg}</p> : null}
    </main>
  );
}
