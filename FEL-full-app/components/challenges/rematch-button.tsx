'use client';

// CHALLENGES-2: the one-tap rematch. One tap mints the challenge back (POST /api/challenge/<code>/rematch, from this
// player's verified result) and hands the link to the share sheet, or copies it. Nothing is posted anywhere by the app:
// the player picks who gets it (no free-text chat; owner, 2026-10-22: reactions and challenges only).

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

type State = { s: 'idle' } | { s: 'busy' } | { s: 'sent'; url: string; copied: boolean } | { s: 'error'; line: string };

const ERRORS: Record<string, string> = {
  no_result: 'Play it first: the rematch is sent from your result.',
  not_found: 'That challenge is gone.',
};

export function RematchButton({ code, receipt, canShowName }: { code: string; receipt: string | null; canShowName: boolean }) {
  const [state, setState] = useState<State>({ s: 'idle' });
  const [showName, setShowName] = useState(false);

  const tap = async () => {
    if (state.s === 'busy' || state.s === 'sent') return;
    setState({ s: 'busy' });
    try {
      const res = await fetch(`/api/challenge/${encodeURIComponent(code)}/rematch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(receipt ? { receipt } : {}), showName }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 401 && typeof j?.href === 'string') { window.location.assign(j.href); return; }
      if (!res.ok || typeof j?.path !== 'string') { setState({ s: 'error', line: ERRORS[j?.error] ?? 'Could not send the rematch. Try again.' }); return; }
      const url = `${window.location.origin}${j.path}`;
      let copied = false;
      try {
        if (navigator.share) await navigator.share({ title: 'Rematch on FEL', url });
        else { await navigator.clipboard.writeText(url); copied = true; }
      } catch {
        try { await navigator.clipboard.writeText(url); copied = true; } catch { /* the link is on the card */ }
      }
      setState({ s: 'sent', url, copied });
    } catch {
      setState({ s: 'error', line: 'Could not send the rematch. Try again.' });
    }
  };

  if (state.s === 'sent') {
    return (
      <div className="rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-4 py-3 text-left" data-rematch="sent">
        <div className="flex items-center gap-2 font-mono text-xs text-[#00FF9D]"><Check className="h-4 w-4" aria-hidden /> Rematch sent{state.copied ? ' — link copied' : ''}</div>
        <div className="mt-1 break-all font-mono text-[11px] text-white/60">{state.url}</div>
        <div className="mt-1 text-[11px] text-white/40">Open for 48 hours.</div>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={tap}
        disabled={state.s === 'busy'}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-5 py-3.5 fel-heading text-lg font-bold text-black disabled:opacity-60"
        data-action="rematch"
      >
        <Share2 className="h-5 w-5" aria-hidden /> {state.s === 'busy' ? 'SENDING…' : 'REMATCH'}
      </button>
      {canShowName && (
        <label className="mt-2 flex items-center justify-center gap-2 text-xs text-white/55">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} data-rematch-name="choice" />
          Put my first name on it
        </label>
      )}
      {state.s === 'error' && <p className="mt-2 text-xs text-[#FF3366]" role="alert">{state.line}</p>}
    </div>
  );
}
