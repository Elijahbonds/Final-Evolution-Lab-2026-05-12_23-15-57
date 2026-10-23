'use client';

// The typed-code half of the invite (coach-loop P1): a coach writes ABCD-2345 on a whiteboard, the athlete types it
// here and lands on the same page the link and the QR open. Nothing is joined on this page — joining happens there.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { normalizeCode } from '@/lib/coach/inviteCode';

export function CodeForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!c) { setError('A code is 8 letters and numbers, like ABCD-2345.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/coach/invite/code/${encodeURIComponent(c)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j?.path === 'string') { router.push(j.path); return; }
      setError(r.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : 'That code is not open. Check it with your coach.');
    } catch {
      setError('No connection. Try again in a moment.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={go} className="mt-6 w-full max-w-xs">
      <label htmlFor="invite-code" className="block text-xs text-white/50">Invite code</label>
      <input
        id="invite-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters"
        spellCheck={false} inputMode="text" placeholder="ABCD-2345" maxLength={16}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.2em] text-white"
        data-invite-code-input
      />
      <button type="submit" disabled={busy}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Find my coach
      </button>
      {error && <p className="mt-3 text-xs text-[#FF3366]" role="alert">{error}</p>}
    </form>
  );
}
