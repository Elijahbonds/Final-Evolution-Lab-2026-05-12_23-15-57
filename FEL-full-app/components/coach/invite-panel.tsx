'use client';

// INVITE — the coach's own share surface: one link, one QR, handed to an athlete.
//
// The audit's first finding was that there was no way to add a client at all. This is the fix a coach touches: make
// a link, show the QR across the gym floor, or copy it into a DM. A one-shot link for one athlete, a reusable one
// for a flyer or a team.
//
// The QR encodes exactly the URL the copy button copies — one builder (lib/coach/invite.inviteUrl), so the phone
// pointed at the screen and the link pasted into a message can never be different things.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Loader2, QrCode, Users, X } from 'lucide-react';
import { inviteUrl } from '@/lib/coach/invite';

interface Invite { token: string; use: 'once' | 'many'; expiresAt: string; joined: number }

export function InvitePanel() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ token: string; data: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/coach/invite');
      const b = await r.json().catch(() => ({}));
      setInvites(Array.isArray(b?.invites) ? b.invites : []);
    } catch { setInvites([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const make = async (use: 'once' | 'many') => {
    setBusy(true);
    try {
      const r = await fetch('/api/coach/invite', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ use }),
      });
      if (!r.ok) { toast.error('Could not make a link just now.'); return; }
      await load();
      toast.success(use === 'once' ? 'Link ready — good for one athlete.' : 'Link ready — reusable.');
    } finally { setBusy(false); }
  };

  const copy = async (token: string) => {
    const url = inviteUrl(window.location.origin, token);
    try { await navigator.clipboard.writeText(url); setCopied(token); setTimeout(() => setCopied(null), 1800); }
    catch { toast.error('Clipboard blocked — the link is on screen to copy by hand.'); }
  };

  const showQr = async (token: string) => {
    if (qr?.token === token) { setQr(null); return; }
    const url = inviteUrl(window.location.origin, token);
    const QR = await import('qrcode');
    const data = await QR.toDataURL(url, { margin: 1, width: 320, color: { dark: '#050505', light: '#FFFFFF' } });
    setQr({ token, data });
  };

  const revoke = async (token: string) => {
    await fetch(`/api/coach/invite/${encodeURIComponent(token)}`, { method: 'DELETE' });
    if (qr?.token === token) setQr(null);
    await load();
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <header className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[#00E5FF]" />
        <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">Add an athlete</h2>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        Send a link or show the QR. They sign up, land on your roster, and you can program for them straight away.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => make('once')} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2 text-xs font-bold text-[#050505] disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Link for one athlete
        </button>
        <button onClick={() => make('many')} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-white/80 disabled:opacity-60">
          <QrCode className="h-3.5 w-3.5" /> Reusable link for a team
        </button>
      </div>

      {invites === null && <p className="mt-4 text-xs text-white/35">Loading…</p>}
      {invites?.length === 0 && <p className="mt-4 text-xs text-white/35">No open invites.</p>}

      <ul className="mt-4 space-y-2">
        {invites?.map((i) => (
          <li key={i.token} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                {i.use === 'once' ? 'One athlete' : 'Reusable'} · {i.joined} joined
              </span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => copy(i.token)} title="Copy the link"
                  className="rounded-md border border-white/15 p-1.5 text-white/70 hover:text-white">
                  {copied === i.token ? <Check className="h-3.5 w-3.5 text-[#00FF9D]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => showQr(i.token)} title="Show the QR"
                  className="rounded-md border border-white/15 p-1.5 text-white/70 hover:text-white">
                  <QrCode className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => revoke(i.token)} title="Revoke"
                  className="rounded-md border border-white/15 p-1.5 text-white/40 hover:text-[#FF3366]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            {qr?.token === i.token && (
              <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.data} alt="Invite QR code" className="h-44 w-44" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
