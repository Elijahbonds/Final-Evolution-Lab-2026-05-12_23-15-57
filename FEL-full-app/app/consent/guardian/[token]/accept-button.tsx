'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

// MIRROR-COACH P5 (2026-09-29): the accept action is a CLICK, calling GET /api/v1/camp/consent?token=… from JS —
// deliberately not a plain link straight to that URL. A link-preview crawler (iMessage, WhatsApp, Slack unfurling a
// shared text) fetches whatever URL was actually shared; sharing THIS page's URL means a crawler only ever loads a
// page that reads and displays the request (app/consent/guardian/[token]/page.tsx does no write on render), and the
// write happens only if a human taps this button, which no crawler does.
export function AcceptButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setState('working');
    setError(null);
    try {
      const res = await fetch(`/api/v1/camp/consent?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // MIRROR-COACH P5 FIX (2026-09-29, code review): the one error this button treats differently — everything
        // else reads as an expired/invalid link, but this one means "you're signed in as the athlete this consent is
        // for" (app/api/v1/camp/consent's own GET), and the generic copy would send someone straight back to asking
        // for a new link instead of the one thing that actually fixes it: a DIFFERENT person, on their own account.
        setError(
          body?.error === 'self_accept_blocked'
            ? "This has to be confirmed by your parent or guardian, not you — you're currently signed in as the athlete this is for. Sign out first, or have them open this link on their own phone or account."
            : 'That link is no longer valid — ask them to send you a new one.',
        );
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('No connection. Try again in a moment.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-5 py-3 font-bold text-[#00FF9D]">
        <Check className="h-4 w-4" /> Confirmed
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={accept}
        disabled={state === 'working'}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Yes, I&apos;m their parent or guardian
      </button>
      {error && <p className="mt-3 max-w-xs text-xs text-[#FF3366]">{error}</p>}
    </>
  );
}
