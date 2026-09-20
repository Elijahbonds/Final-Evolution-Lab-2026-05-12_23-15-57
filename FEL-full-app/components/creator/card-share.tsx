'use client';

// CardShare — the link-in-bio / sticker-flyer surface for a published card.
// The QR encodes ONLY the public card URL plus the owner's referral code
// (nothing else leaves the device); the copy button puts the same URL on the
// clipboard. Ground traffic: scan the sticker, land on the card, "Build your
// own card" is the CTA beneath it.
//
// THE CODE IS THE POINT (owner, 2026-09-19). Until now the QR encoded a bare
// /card/<slug>: a scan that became an account paid its owner nothing, because
// the ?ref= the signup flow is waiting for was never in the link. It is now,
// so the scan carries the attribution and the conversion pays out.

import { useEffect, useState } from 'react';
import { QrCode, Link2, Check } from 'lucide-react';
import { cardSharePath, cardShareUrl } from '@/lib/creator/share-link';

export function CardShare({ slug, accent, refCode = null, refShards = 0 }: {
  slug: string; accent: string; refCode?: string | null; refShards?: number;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const path = cardSharePath(slug, refCode);
  const [url, setUrl] = useState(path);

  useEffect(() => {
    const absolute = cardShareUrl(window.location.origin, slug, refCode);
    setUrl(absolute);
    let live = true;
    import('qrcode').then((QR) =>
      QR.toDataURL(absolute, { margin: 1, width: 220, color: { dark: '#050505', light: '#FFFFFF' } }),
    ).then((dataUrl) => { if (live) setQr(dataUrl); }).catch(() => {});
    return () => { live = false; };
  }, [slug, refCode, path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard denied — the URL is visible to copy by hand */ }
  };

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {qr && (
        <div className="rounded-2xl border border-white/10 bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code for ${url}`} className="h-40 w-40" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-bold transition-colors"
          style={{ borderColor: `${accent}55`, color: accent }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? 'LINK COPIED' : 'COPY THE LINK'}
        </button>
      </div>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-white/35">
        <QrCode className="h-3 w-3" /> Bio link · sticker · flyer — one scan is the card
      </p>
      {refCode && refShards > 0 && (
        <div
          className="mt-1 flex max-w-[22rem] flex-col items-center gap-1 rounded-xl border px-4 py-3 text-center"
          style={{ borderColor: `${accent}33`, background: `${accent}0d` }}
        >
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            {refShards} shards a signup
          </span>
          <span className="text-[11px] leading-snug text-white/55">
            Someone scans this card, makes an account, and the shards land in your wallet. Your code is{' '}
            <span className="font-mono font-bold text-white/80">{refCode}</span> — it travels in the link.
          </span>
        </div>
      )}
    </div>
  );
}
