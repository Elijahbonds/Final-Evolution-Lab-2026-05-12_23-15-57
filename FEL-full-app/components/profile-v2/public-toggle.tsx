'use client';

// An adult's one privacy choice: public or friends-only (owner 2026-10-24). Stored where it already lives — the card's
// published flag (POST /api/v1/card/publish, which refuses an under-18 or unknown age with 403 adults_only). Off is the
// default. Shown only to a verified adult; the server decides again on every request.
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

export function PublicToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const change = async (next: boolean) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/v1/card/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published: next }) });
      if (res.ok) setOn(next);
      else setErr(res.status === 403 ? 'Only adult accounts can be public.' : 'That didn’t save. Try again.');
    } catch { setErr('That didn’t save. Try again.'); }
    setBusy(false);
  };
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] font-bold text-white">{on ? 'Public' : 'Friends only'}</p>
        <p className="text-[11.5px] text-fel-dim">{on ? 'Anyone with your link can see your profile and card.' : 'Only you and your coaches can see it.'}</p>
        {err && <p role="alert" className="mt-1 text-[11.5px] text-fel-ember">{err}</p>}
      </div>
      <Switch checked={on} disabled={busy} onCheckedChange={change} aria-label="Make my profile public" />
    </div>
  );
}
