'use client';

// SAFETY lane (SAF-01, 2026-10-25): the withdraw is a CLICK that POSTs /api/consent/withdraw with a JSON body — never a
// plain link to a URL that writes — so only a person tapping this button withdraws (accept-button.tsx's reasoning).
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export function WithdrawButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const withdraw = async () => {
    setState('working');
    try {
      const res = await fetch('/api/consent/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-5 py-3 font-bold text-[#00FF9D]" data-testid="withdrawn">
        <Check className="h-4 w-4" /> Withdrawn
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={withdraw}
        disabled={state === 'working'}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF3366] px-6 py-3 font-bold text-white disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Yes, withdraw it
      </button>
      {state === 'error' && <p className="mt-3 max-w-xs text-xs text-[#FF3366]">That didn&apos;t work. Try again in a moment.</p>}
    </>
  );
}
