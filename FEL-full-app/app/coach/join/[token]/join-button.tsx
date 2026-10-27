'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

export function JoinButton({ token, coachName, already }: { token: string; coachName: string; already: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done'>(already ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  // COACH-LOOP P1 (2026-10-20): the teen gate's refusal carries where to go next (a birth year, a guardian's yes)
  const [next, setNext] = useState<string | null>(null);

  const join = async () => {
    setState('working'); setError(null);
    try {
      const r = await fetch(`/api/coach/invite/${encodeURIComponent(token)}`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body?.message ?? 'That did not work — ask your coach for a new link.');
        setNext(typeof body?.href === 'string' && body.href.startsWith('/') ? body.href : null);
        setState('idle'); return;
      }
      setState('done');
      setTimeout(() => router.push('/training'), 1200);
    } catch {
      setError('No connection. Try again in a moment.');
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-7 inline-flex items-center gap-2 rounded-xl border border-fel-emerald/40 bg-fel-emerald/10 px-5 py-3 font-bold text-fel-emerald">
        <Check className="h-4 w-4" /> You are on {coachName}&apos;s roster
      </p>
    );
  }

  return (
    <>
      <button
        onClick={join}
        disabled={state === 'working'}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-fel-cyan px-6 py-3 font-bold text-fel-bg transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Join {coachName}
      </button>
      {error && <p className="mt-3 max-w-xs text-xs text-fel-crimson">{error}</p>}
      {next && (
        <a href={next.startsWith('/age') ? `/age?next=${encodeURIComponent(`/coach/join/${token}`)}` : next} className="mt-2 inline-block text-xs font-bold text-fel-cyan underline" data-teen-gate-next>
          {next.startsWith('/age') ? 'Add your birth year' : 'Ask your guardian to approve coach training'}
        </a>
      )}
    </>
  );
}
