'use client';

// CREATOR SOUNDTRACK pieces H and J: "Now playing" — the track, and the creator credited with a link to their card.
// The dock shows it in the menus; the end screen mounts it in its `sideCards` slot (lane/end-screen, one line:
// `sideCards={<NowPlayingCard />}`); lane/create-hub's step 3 can mount it as the preview. It renders nothing when the
// soundtrack is silent, so a slot that mounts it costs nothing on a page without music.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSoundtrackPlayer } from '@/lib/soundtrack/client';
import type { PlayerSnapshot } from '@/lib/soundtrack/player';

export function useSoundtrack(): PlayerSnapshot | null {
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  useEffect(() => {
    const p = getSoundtrackPlayer();
    if (!p) return;
    setSnap(p.snapshot());
    return p.subscribe(() => setSnap(p.snapshot()));
  }, []);
  return snap;
}

export function NowPlayingCard({ className = '', showSkip = true }: { className?: string; showSkip?: boolean }) {
  const snap = useSoundtrack();
  const t = snap?.track;
  if (!snap || !t || !snap.stage) return null;
  return (
    <div data-end-focus="now-playing" data-soundtrack="now-playing"
      className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 ${className}`}>
      <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#00E5FF]/15 text-[#00E5FF]">♪</div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">Now playing</p>
        <p className="truncate text-sm font-semibold text-white" title={t.title}>{t.title}</p>
        <p className="truncate text-xs text-white/60">
          {t.creator.href ? <Link href={t.creator.href} className="underline decoration-white/30 hover:text-white">{t.creator.name}</Link> : t.creator.name}
        </p>
      </div>
      {showSkip && snap.trackCount > 1 && (
        <button type="button" aria-label="Next track" onClick={() => getSoundtrackPlayer()?.skip()}
          className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10">⏭</button>
      )}
    </div>
  );
}
