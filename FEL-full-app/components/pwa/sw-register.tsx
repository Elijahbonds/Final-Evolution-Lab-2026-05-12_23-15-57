'use client';

// Registers public/sw.js, or removes it: lib/pwa/sw.ts swDecision. Mounted once, in the root layout.
// It registers after the page's own load event, so the worker never competes with a first visit for bandwidth.
//
// OFFLINE PLAY (offline-push, round 8): with NEXT_PUBLIC_OFFLINE_PLAY_ENABLED on as well, the worker is registered as
// /sw.js?offline=1 (lib/pwa/offlinePlay.ts) and this component also
//   · asks the worker to keep the page just opened and the files it loaded before the worker took control ('fel-warm':
//     a client-side navigation never reaches the worker as a page load, and the first visit loads before it exists);
//   · on a sign-in, sign-up or sign-out page, drops the page copies and the kept profile (they were someone's own);
//   · renders the one offline banner (components/offline/offline-banner.tsx), which also sends offline runs when the
//     signal is back.
// With offline play off it renders nothing and does nothing beyond app-feel's register / kill switch.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SW_URL, killServiceWorker, swDecision } from '@/lib/pwa/sw';
import { isSignInPath, offlinePlayOn, swScriptUrl, warmMessage } from '@/lib/pwa/offlinePlay';
import { forgetOfflineProfile } from '@/lib/pwa/offlineShell';
import { OfflineBanner } from '@/components/offline/offline-banner';

/** (new) A second warm after the first, for the files a game loads after it starts (models, audio). */
const LATE_WARM_MS = 15_000;

export function ServiceWorkerRegistrar() {
  // All read literally so Next inlines them into the client bundle at build time.
  const decision = swDecision(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SW_ENABLED);
  const offline = decision === 'register' && offlinePlayOn(process.env.NEXT_PUBLIC_OFFLINE_PLAY_ENABLED);
  const pathname = usePathname() || '/';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (decision === 'unregister') {
      void killServiceWorker();
      return;
    }
    // updateViaCache 'none': the browser checks /sw.js itself against the network on every update check, never its
    // HTTP cache, so a new worker (or the kill switch's next deploy) is picked up on the next page load. A change of the
    // offline-play flag changes the URL, which is a new worker too.
    const register = () => {
      navigator.serviceWorker.register(swScriptUrl(SW_URL, offline), { scope: '/', updateViaCache: 'none' }).catch(() => { /* stays a website */ });
    };
    if (document.readyState === 'complete') { register(); return; }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, [decision, offline]);

  useEffect(() => {
    if (!offline || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (isSignInPath(pathname)) {
      forgetOfflineProfile();
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'fel-clear-pages' })).catch(() => {});
      return;
    }
    let live = true;
    const warm = () => {
      if (!live) return;
      const urls = (performance.getEntriesByType?.('resource') ?? []).map((e) => e.name);
      void navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage(warmMessage(window.location.href, urls, window.location.origin)))
        .catch(() => {});
    };
    warm();
    const late = setTimeout(warm, LATE_WARM_MS);
    return () => { live = false; clearTimeout(late); };
  }, [offline, pathname]);

  return offline ? <OfflineBanner /> : null;
}
