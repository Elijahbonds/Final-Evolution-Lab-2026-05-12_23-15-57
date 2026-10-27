'use client';

// The one offline banner (offline-push, round 8, OFF-01: "clear offline messages"), and the sync that sends offline runs
// when the signal comes back. Mounted once, by components/pwa/sw-register.tsx, only while offline play is on.
//
//   offline           "You're offline. Games and lessons you've opened before still work here." — then, after a few
//                     seconds, a small OFFLINE chip, so a game's own HUD is not covered. On a ranked, staked or Arena
//                     play it says those need a connection instead.
//   a run queued      "Results are saved on this phone and added to your history when you are back online."
//   back online       the queued runs of the SIGNED-IN account (asked of /api/profile, never assumed) go to
//                     /api/offline/results (lib/offline-cache.ts), and the banner says how many landed.
//
// It never takes a tap (pointer-events: none), sits at the top centre clear of the touch controls, and is a polite
// live region so a screen reader hears each change once.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { getSessionResultQueue } from '@/lib/offline-cache';
import { OFFLINE_COPY, needsServer } from '@/lib/pwa/offlinePlay';
import { OFFLINE_QUEUED_EVENT } from '@/lib/pwa/offlineShell';

/** (new) How long the full offline line shows before it shrinks to the chip, and how long "back online" stays. */
const FULL_LINE_MS = 6000;
const BACK_LINE_MS = 5000;

type View = { kind: 'hidden' } | { kind: 'offline'; full: boolean; refused: boolean; queued: boolean } | { kind: 'back'; text: string };

async function signedInUser(): Promise<string | null> {
  try {
    const r = await fetch('/api/profile', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.profile?.userId === 'string' ? j.profile.userId : null;
  } catch { return null; }
}

/** Send this account's queued offline runs. The number delivered, or 0. */
async function syncOfflineRuns(): Promise<number> {
  const q = getSessionResultQueue();
  if (q.pendingCount === 0) return 0;
  const userId = await signedInUser();
  if (!userId || q.pendingFor(userId) === 0) return 0;
  return (await q.flush(userId)).delivered;
}

export function OfflineBanner() {
  const pathname = usePathname() || '/';
  const [view, setView] = useState<View>({ kind: 'hidden' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const later = (ms: number, fn: () => void) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
    const refused = () => needsServer(window.location.search);
    const goOffline = () => {
      setView({ kind: 'offline', full: true, refused: refused(), queued: false });
      later(FULL_LINE_MS, () => setView((v) => (v.kind === 'offline' ? { ...v, full: false } : v)));
    };
    const goOnline = () => {
      setView({ kind: 'back', text: OFFLINE_COPY.back });
      later(BACK_LINE_MS, () => setView({ kind: 'hidden' }));
      void syncOfflineRuns().then((n) => {
        if (n <= 0) return;
        setView({ kind: 'back', text: OFFLINE_COPY.synced(n) });
        later(BACK_LINE_MS, () => setView({ kind: 'hidden' }));
      });
    };
    const queued = () => {
      setView({ kind: 'offline', full: true, refused: refused(), queued: true });
      later(FULL_LINE_MS, () => setView((v) => (v.kind === 'offline' ? { ...v, full: false } : v)));
    };
    const visible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void syncOfflineRuns(); };

    if (navigator.onLine === false) goOffline();
    else void syncOfflineRuns();   // runs queued on an earlier visit
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener(OFFLINE_QUEUED_EVENT, queued);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener(OFFLINE_QUEUED_EVENT, queued);
      document.removeEventListener('visibilitychange', visible);
      const t = timer.current;
      if (t) clearTimeout(t);
    };
  }, []);

  // a new page while offline: say it again in full (it may be a ranked play)
  useEffect(() => {
    setView((v) => (v.kind === 'offline' ? { ...v, full: true, refused: needsServer(window.location.search) } : v));
  }, [pathname]);

  const text = view.kind === 'back' ? view.text
    : view.kind === 'offline' ? (view.refused ? `${OFFLINE_COPY.offline} ${OFFLINE_COPY.refused}` : view.queued ? OFFLINE_COPY.offlineResults : OFFLINE_COPY.offline)
    : '';
  const chip = view.kind === 'offline' && !view.full;

  return (
    <div
      role="status"
      aria-live="polite"
      data-fel-offline={view.kind}
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ top: 'max(env(safe-area-inset-top), 8px)' }}
    >
      {view.kind !== 'hidden' && (
        <div
          className={`flex max-w-[420px] items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[12px] leading-snug shadow-lg backdrop-blur-md ${
            view.kind === 'back' ? 'border-[#00FF9D]/40 bg-[#050505]/85 text-[#00FF9D]' : 'border-white/15 bg-[#050505]/85 text-white/85'}`}
        >
          {view.kind === 'offline' && <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {chip ? <span>OFFLINE</span> : <span>{text}</span>}
        </div>
      )}
    </div>
  );
}
