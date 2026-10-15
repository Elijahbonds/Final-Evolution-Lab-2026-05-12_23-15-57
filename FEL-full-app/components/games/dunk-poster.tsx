'use client';
// DunkPoster — the made dunk's poster, kept and shared (DUNK MOTION phase 12, 2026-09-24).
//
// Owner decision: the made dunk ends on a POSTER FREEZE-FRAME you can share. The mode freezes the contact frame from the poster's own
// camera (low and wide, under him), captures it (DunkMode.capturePoster) and pushes it here; this dresses it — the dunk's name, who
// it belongs to, the card — and offers it: SAVE downloads the composed image, SHARE hands it to the device's share sheet where the
// browser can share files (and falls back to the download where it cannot). Nothing leaves the device unless the player shares it.
import { useCallback, useEffect, useState } from 'react';
import type { HudPoster } from '@/lib/babylon/core/ModeHarness';
import { HUD_PLATE, HudText, hudColor, hudType } from './tv-hud';   // WAVE 3 (lane/w3-present): the card is on the TV HUD system (the share image takes its colours from the one palette)

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
  g.fillStyle = hudColor('ink'); g.fillRect(0, 0, W, H);
  g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const grad = g.createLinearGradient(0, H * 0.55, 0, H); grad.addColorStop(0, hudColor('ink', 0)); grad.addColorStop(1, hudColor('ink', 0.92));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = hudColor('score'); g.font = '700 34px system-ui, sans-serif'; g.fillText(`FLIGHT NIGHT · NIGHT ${p.night}`, 64, H - 250);
  g.fillStyle = hudColor('text'); g.font = '900 86px system-ui, sans-serif';
  const words = p.title.toUpperCase().split(' '); let line = '', y = H - 160; const lines: string[] = [];
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > W - 128 && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.slice(-2).forEach((l, i, a) => g.fillText(l, 64, y - (a.length - 1 - i) * 92));
  y += 70;
  g.fillStyle = hudColor('text', 0.75); g.font = '600 34px system-ui, sans-serif';
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
  const btn = (on: boolean, tone: 'text' | 'you') => ({ ...hudType('label'), color: hudColor(tone, on ? 1 : 0.4), background: hudColor(tone, tone === 'you' ? 0.2 : 0.1), letterSpacing: '0.08em', fontWeight: 800, borderRadius: HUD_PLATE.radius });
  return (
    <div data-dunk-poster className="pointer-events-auto absolute right-3 top-[14%] w-[min(42vw,220px)]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="overflow-hidden" style={{ background: HUD_PLATE.background, border: HUD_PLATE.border, borderRadius: 12, boxShadow: HUD_PLATE.shadow }}>
        <div className="relative aspect-[4/5] w-full" style={{ background: hudColor('ink') }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL captured from the canvas; next/image cannot optimise it */}
          <img src={poster.src} alt={`Poster: ${poster.title}`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-8" style={{ background: `linear-gradient(to top, ${hudColor('ink', 0.9)}, ${hudColor('ink', 0)})` }}>
            <HudText as="div" size="body" className="uppercase" style={{ fontWeight: 800, lineHeight: 1.1 }}>{poster.title}</HudText>
            <HudText as="div" size="caption" tone="you" alpha={0.85} className="uppercase">{poster.by ? `${poster.by} · ` : ''}judges {poster.total}</HudText>
          </div>
          <button type="button" aria-label="Close the poster" onClick={onClose} className="absolute right-1.5 top-1.5 rounded-full px-1.5 leading-5" style={{ ...hudType('label'), background: hudColor('ink', 0.6), color: hudColor('text', 0.8) }}>✕</button>
        </div>
        <div className="flex gap-1.5 p-1.5">
          <button type="button" disabled={!blob} onClick={save} className="flex-1 py-1 uppercase disabled:opacity-40" style={btn(true, 'text')}>Save</button>
          <button type="button" disabled={!blob || busy} onClick={() => void share()} className="flex-1 py-1 uppercase disabled:opacity-40" style={btn(true, 'you')}>Share</button>
        </div>
      </div>
    </div>
  );
}
