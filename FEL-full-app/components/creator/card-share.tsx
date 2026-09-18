'use client';

// CardShare — the link-in-bio / sticker-flyer surface for a published card.
// The QR encodes ONLY the public card URL (nothing else leaves the device);
// the copy button puts the same URL on the clipboard. Ground traffic: scan
// the sticker, land on the card, "Build your own card" is the CTA beneath it.

import { useEffect, useState } from 'react';
import { QrCode, Link2, Check } from 'lucide-react';

export function CardShare({ slug, accent }: { slug: string; accent: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/card/${slug}`);

  useEffect(() => {
    const absolute = `${window.location.origin}/card/${slug}`;
    setUrl(absolute);
    let live = true;
    import('qrcode').then((QR) =>
      QR.toDataURL(absolute, { margin: 1, width: 220, color: { dark: '#050505', light: '#FFFFFF' } }),
    ).then((dataUrl) => { if (live) setQr(dataUrl); }).catch(() => {});
    return () => { live = false; };
  }, [slug]);

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
    </div>
  );
}
