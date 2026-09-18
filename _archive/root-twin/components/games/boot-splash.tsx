// BootSplash — the console ritual (Shell 03 §1.2): cartridge insert → venue art
// boot with progress → READY gate → 3-2-1 → GO. Doubles as the loading cover
// (no raw spinner anywhere) and renders the error/retry state from the harness.

import React, { useEffect, useState } from 'react';
import type { ModePhase } from '@/lib/babylon';
import { venueThumb } from '@/lib/babylon/ui/venueThumbs';

// M37 E12 FIX: venue slugs resolve to PROCEDURAL canvas thumbnails (venueThumbs)
// instead of /img/venues/*.jpg files that 404 on every mode route.
const VENUE_ART: Record<string, { venue: string; sub: string; tint: string }> = {
  dunk: { venue: 'venice-court', sub: 'VENICE BEACH COURT', tint: '#ffb36b' },
  karate: { venue: 'shimogamo-dojo', sub: 'SHIMOGAMO DOJO', tint: '#ff9d5c' },
  football: { venue: 'gridiron', sub: 'THE GRIDIRON', tint: '#9fb7ff' },
  skateboard: { venue: 'skatepark', sub: 'VENICE SKATEPARK', tint: '#ffd75e' },
  snowboard_slalom: { venue: 'mountain-slope', sub: 'MOUNTAIN SLOPE', tint: '#cfe8ff' },
  snowboard: { venue: 'mountain-slope', sub: 'MOUNTAIN SLOPE', tint: '#cfe8ff' },
  surf: { venue: 'surf-break', sub: 'SURF BREAK', tint: '#37b6d9' },
  tennis: { venue: 'tennis-court', sub: 'CENTRE COURT', tint: '#7bd88f' },
  golf: { venue: 'coastal-links', sub: 'COASTAL LINKS', tint: '#8fe0a0' },
  baseball: { venue: 'ballpark', sub: 'THE BALLPARK', tint: '#ffd08a' },
  soccer: { venue: 'fc-stadium', sub: 'FC STADIUM', tint: '#7be0a8' },
  default: { venue: 'default', sub: 'FINAL EVOLUTION', tint: '#22d3ee' },
};

export function BootSplash(props: {
  modeId: string;
  title: string;
  phase: ModePhase;
  detail?: number | string;         // countdown number or error message
  onStart: () => void;              // READY tap
  onRetry: () => void;              // error retry
}) {
  const v = VENUE_ART[props.modeId] ?? VENUE_ART.default;
  const [inserted, setInserted] = useState(false);
  // Procedural venue art generated client-side (no network request, no 404).
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setInserted(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    try { setArt(venueThumb(v.venue, 960, 540)); } catch { setArt(null); }
  }, [v.venue]);
  const artOk = !!art;

  if (props.phase === 'playing' || props.phase === 'paused' || props.phase === 'ended') return null;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden"
      style={{ background: '#05060a', fontFamily: 'var(--fel-font-display, ui-monospace)' }}>
      {/* cartridge-insert wipe */}
      <div className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{
          transform: inserted ? 'translateY(0)' : 'translateY(-100%)',
          backgroundImage: artOk
            ? `linear-gradient(180deg, rgba(5,6,10,.25), rgba(5,6,10,.92)), url(${art})`
            : `radial-gradient(120% 90% at 50% 0%, ${v.tint}22, rgba(5,6,10,.96) 70%)`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[11px] font-black tracking-[0.4em]" style={{ color: v.tint }}>{v.sub}</p>
        <h1 className="text-4xl font-black tracking-wide text-white drop-shadow-lg">{props.title}</h1>

        {props.phase === 'loading' && (
          <div className="w-56">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="fel-boot-bar h-full rounded-full" style={{ background: v.tint }} />
            </div>
            <p className="mt-2 text-[11px] tracking-widest text-white/60">LOADING ARENA…</p>
          </div>
        )}

        {props.phase === 'ready' && (
          <button onClick={props.onStart}
            className="fel-cta mt-2 rounded-2xl px-10 py-4 text-lg font-black text-black"
            style={{ background: v.tint, boxShadow: `0 0 34px ${v.tint}66` }}>
            TAP TO START
          </button>
        )}

        {props.phase === 'countdown' && (
          <div key={String(props.detail)} className="fel-count text-8xl font-black text-white">
            {props.detail === 0 || props.detail === undefined ? 'GO!' : props.detail}
          </div>
        )}

        {props.phase === 'error' && (
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-rose-300">
              {typeof props.detail === 'string' ? props.detail : 'The arena failed to load.'}
            </p>
            <button onClick={props.onRetry}
              className="rounded-2xl bg-white px-8 py-3 font-black text-black">RETRY</button>
          </div>
        )}
      </div>

      <style>{`
        .fel-boot-bar { width: 30%; animation: felboot 1.1s ease-in-out infinite alternate; }
        @keyframes felboot { from { margin-left: 0; width: 30%; } to { margin-left: 70%; width: 30%; } }
        .fel-cta { transition: transform .12s ease; }
        .fel-cta:active { transform: scale(.95); }
        .fel-count { animation: felcount .8s cubic-bezier(.2,1.4,.4,1); }
        @keyframes felcount { from { transform: scale(1.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

/** Eject wipe on quit-to-hub: call, await, then navigate. */
export function ejectTransition(mount: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;background:#05060a;z-index:60;transform:translateY(100%);' +
      'transition:transform .35s cubic-bezier(.4,0,.2,1);';
    mount.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; });
    setTimeout(() => { resolve(); setTimeout(() => el.remove(), 400); }, 360);
  });
}
