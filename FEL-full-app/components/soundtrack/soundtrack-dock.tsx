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
import { useSession } from 'next-auth/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { chromeHiddenFor } from '@/components/shell/tab-bar';
import { isQuickScreenPath } from '@/lib/screen/routes';
import { AGE_BLOCK_COOKIE, AGE_BLOCK_STORAGE_KEY, AGE_BLOCK_VALUE } from '@/lib/privacy/ageScreen';
import { reducedMotion } from '@/lib/a11y/reducedMotion';
import { fetchSoundtrackTracks, getSoundtrackPlayer, preloadSoundKit, saveDataOn, unlockSoundtrackFromGesture } from '@/lib/soundtrack/client';
import { isGamePath, linkPath } from '@/lib/soundtrack/policy';
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
    // FIRST-DUNK-BUDGET: the page's one catalogue read (the Dunk walk-out reads the same answer); a failed read leaves the menus quiet
    void fetchSoundtrackTracks().then((tracks) => { if (live && tracks) p.setCatalogue(tracks); });

    const gesture = (e: Event) => {
      unlockSoundtrackFromGesture(tappedLinkPath(e.target));   // FDB-2: a tap on the way into /try starts nothing on the way out
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

  if (quick || chipHiddenOn(pathname)) return null;
  return <DockChip pathname={pathname} />;
}

/**
 * FDB-2: the same-site path the first tap is navigating to, when it is on a link that opens here (not a new tab or a
 * download); null for anything else. The player holds /try's soundtrack from this tap (policy.holdsForFirstDunk).
 */
export function tappedLinkPath(target: EventTarget | null, base: string = window.location.href): string | null {
  const a = (target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null | undefined;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  return linkPath(a.getAttribute('href'), base);
}

/**
 * Screens a game owns, where the chip shows nothing: every /play/<mode>, the shell's other running-mode screens
 * (chromeHiddenFor), and /try — the flyer's guest dunk, a game that is not under /play (PHONE-FIRST-SCREEN, 2026-10-17:
 * measured floating on its LOOK stick at 393x852). Only the chip: the player still gets every path.
 */
export function chipHiddenOn(pathname: string): boolean {
  return isGamePath(pathname) || chromeHiddenFor(pathname) || pathname === '/try';
}

/** md: from here up the tabs live in the rail and there is no bottom bar to carry the strip. */
const WIDE = '(min-width: 768px)';
const subscribeWide = (cb: () => void): (() => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/**
 * Where the chip goes (PHONE-FIRST-SCREEN, owner's picks 2026-10-17). Floated above the bottom of a phone it sat on the
 * page (measured at 393x852: on /play's Prove It card, 5,496 px²; a control on 11 of 27 signed-in pages; /signup's
 * "Sign in" and /login's footer links signed out). On a phone it is now a STRIP of chrome the page scrolls under: in the
 * tab bar's own glass, above the tabs, while the bar is up ('strip'), or a bar of its own with the same glass when there
 * is none, signed out ('alone'). md+ (the tabs are in the rail): it floats bottom right, as it always did.
 */
export function dockMode(tabBarStrip: boolean, wide: boolean): 'strip' | 'alone' | 'float' {
  return wide ? 'float' : tabBarStrip ? 'strip' : 'alone';
}

function DockChip({ pathname }: { pathname: string }) {
  const snap = useSoundtrack();
  const [open, setOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  // The tab bar renders the strip's slot only while it is up (signed in, off the paths where the shell hides), so the
  // slot's presence is the bar's own rule. Looked up again whenever either could have changed.
  const { status } = useSession();
  const [strip, setStrip] = useState<HTMLElement | null>(null);
  useEffect(() => { setStrip(document.querySelector<HTMLElement>('[data-tabbar-strip]')); }, [pathname, status]);
  if (!snap) return null;
  const hiddenFor = snap.silent === 'own-music' || snap.silent === 'age-locked' || snap.silent === 'data-saver' || snap.silent === 'waiting-for-tap' || snap.silent === 'no-tracks' || snap.silent === 'first-dunk';
  if (hiddenFor || snap.trackCount === 0) return null;
  const p = getSoundtrackPlayer();
  const pulse = snap.playing && !reducedMotion();

  const panel = open && snap.enabled && (
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
  );
  const chip = (
    <button type="button" aria-expanded={open} aria-label={snap.enabled ? 'Soundtrack: now playing' : 'Turn the soundtrack on'}
      onClick={() => (snap.enabled ? setOpen((o) => !o) : p?.setEnabled(true))}
      className="flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-[#0b0d12]/90 px-3 py-1.5 text-xs text-white/80 shadow-lg backdrop-blur hover:bg-[#11141b]">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${snap.enabled ? 'bg-[#00E5FF]' : 'bg-white/30'} ${pulse ? 'animate-pulse' : ''}`} />
      {snap.enabled && snap.track
        ? <span className="truncate"><span className="font-semibold text-white">{snap.track.title}</span> · {snap.track.creator.name}</span>
        : <span>{snap.enabled ? 'Soundtrack' : 'Soundtrack off'}</span>}
    </button>
  );

  const mode = dockMode(Boolean(strip?.isConnected), wide);
  // right-aligned in the strip; the panel opens upward over the page, from the strip's top edge
  const stripRow = (pad: string) => (
    <div className={`relative flex justify-end px-3 ${pad}`}>
      {panel && <div className="absolute bottom-full right-3 mb-2 w-[300px] max-w-[calc(100vw-24px)]">{panel}</div>}
      {chip}
    </div>
  );
  if (mode === 'strip' && strip) return createPortal(stripRow('pb-0.5 pt-1.5'), strip);
  if (mode === 'alone') {
    return (
      <>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050505]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          {stripRow('py-1.5')}
        </div>
        {/* the strip's own room at the end of the page, so the page's last line can still scroll clear of it */}
        {createPortal(<div aria-hidden data-soundtrack-room className="h-[calc(2.75rem+env(safe-area-inset-bottom))]" />, document.body)}
      </>
    );
  }
  return (
    <div className="fixed bottom-4 right-3 z-40 flex max-w-[min(320px,calc(100vw-24px))] flex-col items-end gap-2">
      {panel}
      {chip}
    </div>
  );
}
