'use client';

// "Install FEL": the one-time offer to put FEL on the home screen. When it may show is lib/pwa/installPrompt.ts (hub
// pages only, never in a game or on a TV, once per device). Mounted in the root layout so Chrome's
// beforeinstallprompt is caught wherever it fires, even mid-game, and offered later on a hub page.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Share, X } from 'lucide-react';
import { INSTALL_PROMPT_KEY, installRoute, type InstallRoute } from '@/lib/pwa/installPrompt';

/** Chrome's event; not in TypeScript's DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const readSeen = (): boolean => {
  try { return window.localStorage.getItem(INSTALL_PROMPT_KEY) !== null; } catch { return true; } // no storage: never nag
};
const writeSeen = (v: 'shown' | 'dismissed' | 'installed') => {
  try { window.localStorage.setItem(INSTALL_PROMPT_KEY, v); } catch { /* fine */ }
};
const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches === true
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallPrompt() {
  const pathname = usePathname() || '/';
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);
  const firstPath = useRef<string | null>(null);
  const [hasPromptEvent, setHasPromptEvent] = useState(false);
  const [engaged, setEngaged] = useState(false);
  // 'idle' until shown; 'done' once shown and closed, used, or left for a page it may not show on: once, then never.
  const [phase, setPhase] = useState<'idle' | 'visible' | 'done'>('idle');
  const [route, setRoute] = useState<InstallRoute | null>(null);

  useEffect(() => {
    const keep = (e: Event) => { e.preventDefault(); promptEvent.current = e as BeforeInstallPromptEvent; setHasPromptEvent(true); };
    const installed = () => { writeSeen('installed'); setPhase('done'); };
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', keep); window.removeEventListener('appinstalled', installed); };
  }, []);

  useEffect(() => {
    if (firstPath.current === null) firstPath.current = pathname;
    else if (pathname !== firstPath.current) setEngaged(true);
  }, [pathname]);

  useEffect(() => {
    if (phase === 'done') return;
    const r = installRoute({
      pathname,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      standalone: isStandalone(),
      seen: phase === 'idle' && readSeen(),
      hasPromptEvent,
      engaged,
    });
    if (phase === 'visible' && !r) { setPhase('done'); return; }   // left for a game or a TV surface: gone for good
    if (phase === 'idle' && r) { writeSeen('shown'); setRoute(r); setPhase('visible'); }
  }, [pathname, hasPromptEvent, engaged, phase]);

  if (phase !== 'visible' || !route) return null;

  const close = () => { writeSeen('dismissed'); setPhase('done'); };
  const install = async () => {
    const e = promptEvent.current;
    if (!e) return close();
    promptEvent.current = null;
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      writeSeen(outcome === 'accepted' ? 'installed' : 'dismissed');
    } catch { writeSeen('dismissed'); }
    setPhase('done');
  };

  return (
    <div
      role="dialog"
      aria-label="Install FEL"
      data-install-prompt={route}
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[20px] border border-white/10 bg-[#0c0c11]/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl md:bottom-6"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 40px PNG from public/, no optimiser in this app */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold uppercase tracking-wide text-white">Install FEL</p>
          {route === 'prompt' ? (
            <p className="mt-0.5 text-sm text-white/70">Put FEL on your home screen. It opens full screen, like an app.</p>
          ) : (
            <p className="mt-0.5 text-sm text-white/70">
              Tap <Share aria-label="Share" className="inline h-4 w-4 -translate-y-px text-[#00E5FF]" /> Share, then
              <span className="font-semibold text-white"> Add to Home Screen</span>. FEL opens full screen, like an app.
            </p>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Not now" className="-m-1 rounded-full p-1.5 text-white/60 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      {route === 'prompt' && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={install} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#00E5FF] px-4 py-2.5 text-sm font-bold text-[#050505]">
            <Download className="h-4 w-4" /> Install
          </button>
          <button type="button" onClick={close} className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80">
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
