'use client';
// DunkPoster — the made dunk's poster, kept and shared (DUNK MOTION phase 12, 2026-09-24).
//
// Owner decision: the made dunk ends on a POSTER FREEZE-FRAME you can share. The mode freezes the contact frame from the poster's own
// camera (low and wide, under him), captures it (DunkMode.capturePoster) and pushes it here; this dresses it — the dunk's name, who
// it belongs to, the card — and offers it: SAVE downloads the composed image, SHARE hands it to the device's share sheet where the
// browser can share files (and falls back to the download where it cannot). Nothing leaves the device unless the player shares it.
import { useCallback, useEffect, useState } from 'react';
import type { HudPoster } from '@/lib/babylon/core/ModeHarness';

const W = 1080, H = 1350;

/** The poster as an image: the frame cover-cropped to 4:5, the name and the credit over a dark foot. */
async function compose(p: HudPoster): Promise<Blob | null> {
  const img = new Image();
  img.src = p.src;
  await img.decode().catch(() => undefined);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); if (!g) return null;
  const s = Math.max(W / (img.width || W), H / (img.height || H));
  const dw = (img.width || W) * s, dh = (img.height || H) * s;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const grad = g.createLinearGradient(0, H * 0.55, 0, H); grad.addColorStop(0, 'rgba(5,6,10,0)'); grad.addColorStop(1, 'rgba(5,6,10,0.92)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffd75e'; g.font = '700 34px system-ui, sans-serif'; g.fillText(`FLIGHT NIGHT · NIGHT ${p.night}`, 64, H - 250);
  g.fillStyle = '#ffffff'; g.font = '900 86px system-ui, sans-serif';
  const words = p.title.toUpperCase().split(' '); let line = '', y = H - 160; const lines: string[] = [];
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > W - 128 && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.slice(-2).forEach((l, i, a) => g.fillText(l, 64, y - (a.length - 1 - i) * 92));
  y += 70;
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 34px system-ui, sans-serif';
  g.fillText(`${p.by ? `${p.by.toUpperCase()} · ` : ''}THE JUDGES: ${p.total}`, 64, y);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.9));
}

export function DunkPoster({ poster, onClose }: { poster: HudPoster; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void compose(poster).then((b) => { if (live) setBlob(b); }); return () => { live = false; }; }, [poster]);
  const fileName = `fel-${poster.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dunk'}.jpg`;
  const save = useCallback(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [blob, fileName]);
  const share = useCallback(async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      setBusy(true);
      try { await nav.share({ files: [file], title: poster.title, text: `${poster.title} — ${poster.total} at Flight Night` }); } catch { /* the sheet was dismissed */ }
      setBusy(false);
    } else save();
  }, [blob, fileName, poster, save]);
  return (
    <div className="pointer-events-auto absolute right-3 top-[14%] w-[min(42vw,220px)]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="fel-panel overflow-hidden rounded-xl">
        <div className="relative aspect-[4/5] w-full bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL captured from the canvas; next/image cannot optimise it */}
          <img src={poster.src} alt={`Poster: ${poster.title}`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2.5 pb-2 pt-8">
            <p className="fel-heading text-[13px] font-black uppercase leading-tight text-white">{poster.title}</p>
            <p className="font-mono text-[9px] uppercase tracking-wide text-[var(--fel-cyan)]/80">{poster.by ? `${poster.by} · ` : ''}judges {poster.total}</p>
          </div>
          <button type="button" aria-label="Close the poster" onClick={onClose} className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 text-[11px] leading-5 text-white/80">✕</button>
        </div>
        <div className="flex gap-1.5 p-1.5">
          <button type="button" disabled={!blob} onClick={save} className="flex-1 rounded-md bg-white/10 py-1 font-mono text-[10px] uppercase tracking-wide text-white disabled:opacity-40">Save</button>
          <button type="button" disabled={!blob || busy} onClick={() => void share()} className="flex-1 rounded-md bg-[var(--fel-cyan)]/20 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--fel-cyan)] disabled:opacity-40">Share</button>
        </div>
      </div>
    </div>
  );
}
