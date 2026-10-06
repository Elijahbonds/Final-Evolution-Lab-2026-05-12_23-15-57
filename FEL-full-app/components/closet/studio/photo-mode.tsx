'use client';

// PHOTO MODE (CREATOR-PLAN phase 4d, 2026-10-06): pose the character, pick a backdrop and a frame, take the shot, and get
// an image card with the look's share code printed on it — offered as a normal browser download. Nothing is uploaded or
// published from here, for anyone: a teen's card stays on their device like the rest of their look (owner decision
// 2026-10-06, teens device-only). The shot is rendered by the stage (avatar-preview's `capture`, which stamps the scene's
// felPresentation context 'photo' for the shot), the card composed by lib/creator/look/studio/photoCard.ts.

import { useEffect, useRef, useState } from 'react';
import { Camera, Copy, Download, Loader2, X } from 'lucide-react';
import { CARD_BACKDROPS, CARD_FRAMES, cardLayout, drawCard, photoFileName, type CardFrame } from '@/lib/creator/look/studio/photoCard';
import { STUDIO_POSES } from '@/lib/creator/look/studio/poses';

export interface PhotoShot { url: string; width: number; height: number }

export interface PhotoModeProps {
  label: string;
  accent: string;
  /** the look's share code (numbers = include the face sculpt numbers; adults who chose to only) */
  makeCode: (numbers: boolean) => Promise<string>;
  /** adults may choose to print the sculpt numbers; under-18 / unknown age never */
  adult: boolean;
  /** render the posed shot (the stage poses the body, settles it for a second, renders it on a transparent background) */
  capture: (o: { pose: string; venue: string }) => Promise<PhotoShot | null>;
  onClose: () => void;
  onShot?: () => void;
}

const BACKDROP_LABELS: Record<string, string> = { studio: 'Studio', goldenHour: 'Golden hour', daylight: 'Daylight', dojoWarm: 'Dojo', nightGame: 'Night game', alpine: 'Alpine', overcast: 'Overcast' };
const FRAME_LABELS: Record<CardFrame, string> = { neon: 'Neon', clean: 'Clean', none: 'No frame' };

export function PhotoMode({ label, accent, makeCode, adult, capture, onClose, onShot }: PhotoModeProps) {
  const [pose, setPose] = useState('victory');
  const [backdrop, setBackdrop] = useState<string>('studio');
  const [frame, setFrame] = useState<CardFrame>('neon');
  const [numbers, setNumbers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{ href: string; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hrefRef = useRef<string | null>(null);
  useEffect(() => () => { if (hrefRef.current) URL.revokeObjectURL(hrefRef.current); }, []);

  const take = async () => {
    setBusy(true); setErr(null);
    try {
      const [shot, code] = await Promise.all([capture({ pose, venue: backdrop }), makeCode(adult && numbers)]);
      if (!shot) throw new Error('The stage is not ready yet.');
      const img = await loadImage(shot.url);
      const L = cardLayout({ label, code, backdrop, frame, accent });
      const canvas = document.createElement('canvas');
      canvas.width = L.w; canvas.height = L.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot draw the card.');
      await document.fonts?.ready?.catch(() => undefined);
      drawCard(ctx as unknown as Parameters<typeof drawCard>[0], L, img, { w: shot.width, h: shot.height });
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('This browser cannot save the card.');
      if (hrefRef.current) URL.revokeObjectURL(hrefRef.current);
      hrefRef.current = URL.createObjectURL(blob);
      setCard({ href: hrefRef.current, code });
      onShot?.();
    } catch (e) { setErr(e instanceof Error ? e.message : 'The photo failed.'); }
    finally { setBusy(false); }
  };

  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 font-display text-[10px] uppercase tracking-wide transition ${on ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25'}`;

  return (
    <div role="dialog" aria-label="Photo mode" className="pointer-events-auto absolute inset-x-2 bottom-2 z-30 max-h-[85%] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0c11]/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur md:inset-x-auto md:right-3 md:w-[380px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-white"><Camera className="h-4 w-4 text-cyan-300" /> Photo mode</h2>
        <button type="button" onClick={onClose} aria-label="Close photo mode" className="rounded p-1 text-white/50 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <Row title="Pose">{STUDIO_POSES.map((p) => <button key={p.id} type="button" className={chip(pose === p.id)} onClick={() => { setPose(p.id); if (p.mood) setBackdrop(p.mood); }}>{p.label}</button>)}</Row>
      <Row title="Backdrop">{Object.keys(CARD_BACKDROPS).map((b) => <button key={b} type="button" className={chip(backdrop === b)} onClick={() => setBackdrop(b)}>{BACKDROP_LABELS[b] ?? b}</button>)}</Row>
      <Row title="Frame">{CARD_FRAMES.map((f) => <button key={f} type="button" className={chip(frame === f)} onClick={() => setFrame(f)}>{FRAME_LABELS[f]}</button>)}</Row>
      {adult && (
        <label className="mb-3 flex items-center gap-2 text-[11px] text-white/55" title="The face sculpt numbers (a face scan writes these). Off unless you choose.">
          <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} className="accent-cyan-400" /> Print my face sculpt numbers in the code
        </label>
      )}
      <button type="button" onClick={take} disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-black transition hover:bg-cyan-300 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {busy ? 'Posing…' : card ? 'Take another' : 'Take the photo'}
      </button>
      {err && <p className="mt-2 text-[11px] text-[#FF3366]">{err}</p>}
      {card && (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.href} alt={`Photo card of ${label}`} className="w-full rounded-lg border border-white/10" />
          <div className="flex gap-2">
            <a href={card.href} download={photoFileName(label)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 font-display text-xs font-semibold uppercase text-white hover:bg-white/15">
              <Download className="h-3.5 w-3.5" /> Download card
            </a>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(card.code).catch(() => undefined); }} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10">
              <Copy className="h-3.5 w-3.5" /> Code
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-white/40">Saved to this device only — nothing is uploaded. The code on the card loads this look in anyone&apos;s Studio (Paste a code).</p>
        </div>
      )}
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.2em] text-white/40">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The shot could not be read.')); i.src = src; });
}
