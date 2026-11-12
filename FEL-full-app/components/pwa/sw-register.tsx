'use client';

// Registers public/sw.js, or removes it: lib/pwa/sw.ts swDecision. Mounted once, in the root layout. Renders nothing.
// It registers after the page's own load event, so the worker never competes with a first visit for bandwidth.
import { useEffect } from 'react';
import { SW_URL, killServiceWorker, swDecision } from '@/lib/pwa/sw';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Both read literally so Next inlines them into the client bundle at build time.
    if (swDecision(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SW_ENABLED) === 'unregister') {
      void killServiceWorker();
      return;
    }
    // updateViaCache 'none': the browser checks /sw.js itself against the network on every update check, never its
    // HTTP cache, so a new worker (or the kill switch's next deploy) is picked up on the next page load.
    const register = () => {
      navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' }).catch(() => { /* stays a website */ });
    };
    if (document.readyState === 'complete') { register(); return; }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
