'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

export function JoinButton({ token, coachName, already }: { token: string; coachName: string; already: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done'>(already ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setState('working'); setError(null);
    try {
      const r = await fetch(`/api/coach/invite/${encodeURIComponent(token)}`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setError(body?.message ?? 'That did not work — ask your coach for a new link.'); setState('idle'); return; }
      setState('done');
      setTimeout(() => router.push('/training'), 1200);
    } catch {
      setError('No connection. Try again in a moment.');
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-5 py-3 font-bold text-[#00FF9D]">
        <Check className="h-4 w-4" /> You are on {coachName}&apos;s roster
      </p>
    );
  }

  return (
    <>
      <button
        onClick={join}
        disabled={state === 'working'}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Join {coachName}
      </button>
      {error && <p className="mt-3 max-w-xs text-xs text-[#FF3366]">{error}</p>}
    </>
  );
}
