'use client';
// Small shared pieces of the party UI (PARTY-CHAT lane, 2026-10-13): a member's avatar, the invite block.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Share2 } from 'lucide-react';
import { partyInviteUrl } from '@/lib/party/social/config';

const COLORS = ['#22d3ee', '#f43f5e', '#facc15', '#4ade80', '#a855f7', '#fb923c'];

/** A stable colour per member handle, so the same friend is the same colour in every party. */
export function memberColor(pub: string): string {
  let h = 0;
  for (const c of pub) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ name, pub, speaking = false, size = 32, dim = false }: { name: string; pub: string; speaking?: boolean; size?: number; dim?: boolean }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?';
  return (
    <span
      aria-hidden
      data-speaking={speaking ? '1' : '0'}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-mono font-black text-black transition-shadow ${dim ? 'opacity-40' : ''}`}
      style={{
        width: size, height: size, fontSize: size * 0.36, background: memberColor(pub),
        boxShadow: speaking ? '0 0 0 2px #050505, 0 0 0 4px #00FF9D' : 'none',
      }}
    >
      {initials}
    </span>
  );
}

/** The code, big; the link (copy / share); the QR a friend's phone scans. */
export function InviteBlock({ code }: { code: string }) {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const link = origin ? partyInviteUrl(origin, code) : '';
  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null));
  }, [link]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the code is on screen */ }
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3" data-testid="party-invite">
      {qr ? <img src={qr} alt={`QR code for the party invite link, code ${code}`} className="h-20 w-20 rounded bg-white p-1" /> : <div className="h-20 w-20 rounded bg-white/10" />}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-[0.25em] text-white/45">PARTY CODE</p>
        <p data-testid="party-code" className="font-mono text-2xl font-black tracking-[0.25em] text-[#00E5FF]" aria-label={`Party code ${code.split('').join(' ')}`}>{code}</p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => { void copy(); }} className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:border-white/50">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          {canShare ? (
            <button type="button" onClick={() => { void navigator.share({ title: 'Join my party', url: link }).catch(() => {}); }} className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:border-white/50">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
