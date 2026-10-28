'use client';

// TEAMS-SQUADS: /squads/join/[token] — the link or the QR lands here. Signed out: what this is, and sign in to join.
// Signed in: one button. The join gate's refusal is shown as the server words it (never a birth year).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GROUP_COLORS, type GroupColor, type GroupKind } from '@/lib/groups/types';
import { KIND_LABEL } from '@/lib/groups/copy';

export function JoinLanding({ token, kind, name, color, signedIn, loginHref }: { token: string; kind: GroupKind; name: string; color: GroupColor; signedIn: boolean; loginHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; href: string | null } | null>(null);
  const join = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/groups/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.path) { router.push(j.path); return; }
      setRefusal({ message: j.message ?? 'This invite is not open any more.', href: j.href ?? null });
    } catch { setRefusal({ message: 'No connection. Try again in a moment.', href: null }); } finally { setBusy(false); }
  };
  const accent = GROUP_COLORS[color];
  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: `${accent}55`, background: `${accent}0d` }} data-join-landing>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: accent }}>{KIND_LABEL[kind]} invite</p>
      <h2 className="fel-heading mt-1 break-words text-[24px] font-black text-white">{name}</h2>
      <p className="mt-2 text-[13px] text-white/60">
        {kind === 'team' ? 'Joining puts you on this coach’s roster and on the team.' : 'Train together: daily drills, a weekly league and reactions. No messages.'}
      </p>
      {signedIn
        ? <button onClick={join} disabled={busy} className="mt-4 min-h-[48px] rounded-lg bg-white px-5 text-[14px] font-bold text-fel-bg disabled:opacity-50">Join {KIND_LABEL[kind].toLowerCase()}</button>
        : <Link href={loginHref} className="mt-4 inline-flex min-h-[48px] items-center rounded-lg bg-white px-5 text-[14px] font-bold text-fel-bg">Sign in to join</Link>}
      {refusal && (
        <div className="mt-3 text-[13px] text-amber-100/90" data-join-refusal>
          {refusal.message}
          {refusal.href && <> <Link href={refusal.href} className="font-bold text-fel-cyan underline-offset-2 hover:underline">Continue →</Link></>}
        </div>
      )}
    </section>
  );
}
