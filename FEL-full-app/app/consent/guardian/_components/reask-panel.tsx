'use client';

// SAFETY lane (SAF-02, 2026-10-25): "ask your guardian again", shown on /consent/guardian to a teen whose guardian said
// yes under older words than a feature now needs (owner 2026-10-23, "ask guardians again"). The page decides whether to
// show it (lib/consent/wording.ts reaskState); this only sends POST /api/consent/reask and hands back the link to share,
// as the first ask does — FEL sends it nowhere (owner decision #21). The teen types nothing: the guardian on file is
// asked again. Plain product lines; the words the guardian reads are the owner's (lib/consent/wording.ts).
import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import type { ReaskScope } from '@/lib/consent/wording';

export const REASK_LABEL: Record<ReaskScope, string> = {
  coach_training: 'training with a coach',
  squads: 'squads',
};

export function reaskErrorCopy(code: unknown): string {
  switch (code) {
    case 'pending': return 'A request is already waiting for your guardian. Send them that link.';
    case 'covered': return "You're already covered. Nothing to do.";
    case 'not_live': return "This isn't open yet.";
    default: return "That didn't work. Try again in a moment.";
  }
}

export function ReaskPanel({ scopes }: { scopes: readonly ReaskScope[] }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!scopes.length) return null;
  const label = scopes.map((s) => REASK_LABEL[s]).join(' and ');

  const ask = async () => {
    setState('working');
    setError(null);
    try {
      // one request covers every live scope: the new row is asked under the live wording, which names them all
      const res = await fetch('/api/consent/reask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: scopes[0] }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.href !== 'string') { setError(reaskErrorCopy(body?.error)); setState('error'); return; }
      setLink(`${window.location.origin}${body.href}`);
      setState('done');
    } catch {
      setError('No connection. Try again in a moment.');
      setState('error');
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/[0.06] p-4 text-left" data-testid="reask-panel">
      <p className="text-[13.5px] font-bold text-white">Ask your guardian again</p>
      <p className="mt-1 text-[12.5px] leading-snug text-white/65">
        Your parent or guardian said OK before {label} needed their OK too. Send them a new link so they can look at it.
      </p>
      {state === 'done' && link ? (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-[11px] text-white/80">{link}</p>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2 text-[13px] font-bold text-black"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy the link'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={state === 'working'}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFD700] px-4 py-2 text-[13px] font-bold text-black disabled:opacity-60"
        >
          {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Make a new link
        </button>
      )}
      {error && <p className="mt-2 text-[12px] text-[#FF3366]">{error}</p>}
    </div>
  );
}
