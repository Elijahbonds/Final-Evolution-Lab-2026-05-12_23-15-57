'use client';

// CREATOR SOUNDTRACK piece H (owner, 2026-10-06, "2K Beats for creators"): the menu and loading dock.
//
// Mounted ONCE in app/layout.tsx. A layout survives navigation, so the music carries on from page to page. It owns the
// page's player: it feeds it the path, the catalogue, the first tap, the hidden tab, data saver and the age lock, and
// shows a small "Now playing" chip (title, creator → their card, skip, on/off, the soundtrack's own level). Under a game
// it shows nothing (the game owns the screen); the end screen mounts <NowPlayingCard/> itself.
//
// On the Quick Screen paths it does nothing at all: no listener, no player, no request (the screen sends nothing before
// its age question).

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isQuickScreenPath } from '@/lib/screen/routes';
import { AGE_BLOCK_COOKIE, AGE_BLOCK_STORAGE_KEY, AGE_BLOCK_VALUE } from '@/lib/privacy/ageScreen';
import { reducedMotion } from '@/lib/a11y/reducedMotion';
import { getSoundtrackPlayer, preloadSoundKit, saveDataOn, unlockSoundtrackFromGesture } from '@/lib/soundtrack/client';
import { isGamePath } from '@/lib/soundtrack/policy';
import type { SoundtrackCatalogue } from '@/lib/soundtrack/types';
import { NowPlayingCard, useSoundtrack } from './now-playing-card';
import { RunTrackPick } from '@/components/pipelines/run-track-pick';

function ageLocked(): boolean {
  try {
    if (document.cookie.split(';').some((c) => c.trim() === `${AGE_BLOCK_COOKIE}=${AGE_BLOCK_VALUE}`)) return true;
    return localStorage.getItem(AGE_BLOCK_STORAGE_KEY) != null;
  } catch { return false; }
}

export function SoundtrackDock() {
  const pathname = usePathname() || '/';
  const quick = isQuickScreenPath(pathname);

  // Path first, every navigation.
  useEffect(() => { if (!quick) getSoundtrackPlayer()?.setPathname(pathname); }, [pathname, quick]);

  // One-time wiring (skipped entirely on the Quick Screen).
  useEffect(() => {
    if (quick) return;
    const p = getSoundtrackPlayer();
    if (!p) return;
    void preloadSoundKit();
    p.setSaveData(saveDataOn());
    p.setAgeLocked(ageLocked());
    p.setHidden(document.visibilityState === 'hidden');

    let live = true;
    fetch('/api/v1/soundtrack').then((r) => (r.ok ? r.json() : null)).then((c: SoundtrackCatalogue | null) => {
      if (live && c?.tracks) p.setCatalogue(c.tracks);
    }).catch(() => { /* the menus stay quiet */ });

    const gesture = () => {
      unlockSoundtrackFromGesture();
      for (const t of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(t, gesture, true);
    };
    for (const t of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(t, gesture, true);
    const vis = () => p.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', vis);
    const conn = (navigator as unknown as { connection?: EventTarget }).connection;
    const onConn = () => p.setSaveData(saveDataOn());
    conn?.addEventListener?.('change', onConn);
    return () => {
      live = false;
      for (const t of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(t, gesture, true);
      document.removeEventListener('visibilitychange', vis);
      conn?.removeEventListener?.('change', onConn);
    };
  }, [quick]);

  if (quick || isGamePath(pathname)) return null;
  return <DockChip />;
}

function DockChip() {
  const snap = useSoundtrack();
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const hiddenFor = snap.silent === 'own-music' || snap.silent === 'age-locked' || snap.silent === 'data-saver' || snap.silent === 'waiting-for-tap' || snap.silent === 'no-tracks';
  if (hiddenFor || snap.trackCount === 0) return null;
  const p = getSoundtrackPlayer();
  const pulse = snap.playing && !reducedMotion();

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-3 z-40 flex max-w-[min(320px,calc(100vw-24px))] flex-col items-end gap-2 md:bottom-4">
      {open && snap.enabled && (
        <div className="w-[300px] max-w-full rounded-2xl border border-white/10 bg-[#0b0d12]/95 p-3 shadow-xl backdrop-blur">
          <NowPlayingCard />
          {snap.track && <RunTrackPick trackId={snap.track.id} title={snap.track.title} />}
          <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
            Level
            <input type="range" min={0} max={1} step={0.05} value={snap.level} aria-label="Soundtrack level"
              onChange={(e) => p?.setLevel(Number(e.target.value))} className="flex-1 accent-[#00E5FF]" />
          </label>
          <button type="button" onClick={() => p?.setEnabled(false)} className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-xs text-white/70 hover:bg-white/10">
            Turn the soundtrack off
          </button>
        </div>
      )}
      <button type="button" aria-expanded={open} aria-label={snap.enabled ? 'Soundtrack: now playing' : 'Turn the soundtrack on'}
        onClick={() => (snap.enabled ? setOpen((o) => !o) : p?.setEnabled(true))}
        className="flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-[#0b0d12]/90 px-3 py-1.5 text-xs text-white/80 shadow-lg backdrop-blur hover:bg-[#11141b]">
        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${snap.enabled ? 'bg-[#00E5FF]' : 'bg-white/30'} ${pulse ? 'animate-pulse' : ''}`} />
        {snap.enabled && snap.track
          ? <span className="truncate"><span className="font-semibold text-white">{snap.track.title}</span> · {snap.track.creator.name}</span>
          : <span>{snap.enabled ? 'Soundtrack' : 'Soundtrack off'}</span>}
      </button>
    </div>
  );
}
