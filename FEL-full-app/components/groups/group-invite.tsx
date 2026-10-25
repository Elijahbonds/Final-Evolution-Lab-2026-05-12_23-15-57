'use client';

// TEAMS-SQUADS: the group's invite for its owner and coaches — the typed code (the coach invite's shape,
// lib/coach/inviteCode.ts), the link, and the QR of exactly that link (the same `qrcode` the coach invite uses).

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, QrCode, RefreshCw } from 'lucide-react';

export function GroupInvite({ groupId, invite, canEdit, onChanged }: { groupId: string; invite: { code: string; path: string; open: boolean }; canEdit: boolean; onChanged: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${invite.path}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error('Clipboard blocked — read the code out instead.'); }
  };
  const showQr = async () => {
    if (qr) { setQr(null); return; }
    const QR = await import('qrcode');
    setQr(await QR.toDataURL(url(), { margin: 1, width: 320, color: { dark: '#050505', light: '#FFFFFF' } }));
  };
  const patch = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) toast.error('Could not save.'); else { setQr(null); onChanged(); }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5" data-group-invite>
      <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Invite</h2>
      {invite.open ? (
        <>
          <p className="mt-1 text-[12.5px] text-white/55">Read out the code, send the link, or show the QR. They type the code on the Squads page.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[22px] font-bold tracking-[0.18em] text-[#00E5FF]" data-group-code>{invite.code}</span>
            <span className="ml-auto flex gap-1.5">
              <button onClick={copy} title="Copy the link" aria-label="Copy the link" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15 text-white/75">
                {copied ? <Check className="h-4 w-4 text-[#00FF9D]" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={showQr} title="Show the QR" aria-label="Show the QR" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15 text-white/75"><QrCode className="h-4 w-4" /></button>
            </span>
          </div>
          {qr && <img src={qr} alt="QR code for the invite link" className="mx-auto mt-3 w-full max-w-[240px] rounded-lg bg-white p-2" />}
        </>
      ) : <p className="mt-1 text-[12.5px] text-white/55">The invite is closed. Nobody new can join.</p>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => patch({ inviteOpen: !invite.open })} className="min-h-[44px] rounded-lg border border-white/15 px-3 text-[12.5px] font-bold text-white/80">{invite.open ? 'Close the invite' : 'Open the invite'}</button>
          <button onClick={() => patch({ rotateInvite: true })} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[12.5px] font-bold text-white/80"><RefreshCw className="h-3.5 w-3.5" /> New code</button>
        </div>
      )}
    </section>
  );
}
