'use client';
// ShareGroup — GROUP-BOOKING: a group's link and QR, for the coach to hand out at the gym (the QR encodes exactly the link
// the copy button copies; the qrcode package is already a dependency — components/coach/invite-panel.tsx uses it).
import { useState } from 'react';
import { SHOP_LOOK as L } from '@/components/shop/look';

export function ShareGroup({ path }: { path: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = () => `${window.location.origin}${path}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url()); setNote('Link copied.'); } catch { setNote(url()); }
  };
  const showQr = async () => {
    if (qr) { setQr(null); return; }
    const QR = await import('qrcode');
    setQr(await QR.toDataURL(url(), { margin: 1, width: 320, color: { dark: '#050505', light: '#FFFFFF' } }));
  };
  return (
    <div className={L.section} data-share-group>
      <p className={L.sectionTitle}>Share this group</p>
      <div className="flex gap-2">
        <button type="button" className={L.buy} onClick={() => { void copy(); }}>Copy link</button>
        <button type="button" className={L.buy} onClick={() => { void showQr(); }}>{qr ? 'Hide QR' : 'Show QR'}</button>
      </div>
      {qr ? <img src={qr} alt="QR code for this group's page" width={240} height={240} className="mt-4 rounded-xl" /> : null}
      {note ? <p className={`${L.cardLine} mt-2 break-all`} role="status">{note}</p> : null}
    </div>
  );
}
