// The service worker's switch (app-feel, round 7, 2026-10-25). public/sw.js has the caching rules; this decides
// whether it runs at all.
//
// NEXT_PUBLIC_SW_ENABLED is OFF by default and ships off: the owner turns it on after a device check. It is a
// NEXT_PUBLIC_ variable, so Next inlines it at BUILD time — flipping it is a rebuild and deploy, not a code change.
// It is also the KILL SWITCH: with the flag off, every page load unregisters FEL's worker and deletes its caches, so
// turning it back off removes the worker from every phone on that phone's next page load. Pages are never cached
// (public/sw.js), so that next load is always the new deploy's.
//
// Pure, apart from killServiceWorker.

export const SW_URL = '/sw.js';
/** Every cache public/sw.js opens starts with this. */
export const FEL_CACHE_PREFIX = 'fel-';

export type SwDecision = 'register' | 'unregister';

/** Register only in a production build with the flag on ("1" or "true"); otherwise remove any worker we left. */
export function swDecision(nodeEnv: string | undefined, flag: string | undefined): SwDecision {
  const on = flag === '1' || flag?.toLowerCase() === 'true';
  return nodeEnv === 'production' && on ? 'register' : 'unregister';
}

/** Is this registration ours (our /sw.js on this origin), not some other worker on the same host? */
export function isFelWorker(scriptURL: string | undefined, origin: string): boolean {
  if (!scriptURL) return false;
  try {
    const u = new URL(scriptURL);
    return u.origin === origin && u.pathname === SW_URL;
  } catch { return false; }
}

/** The kill switch: unregister FEL's worker and delete FEL's caches. Quiet when there is nothing to remove. */
export async function killServiceWorker(): Promise<number> {
  let removed = 0;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL;
      if (isFelWorker(url, location.origin) && await r.unregister()) removed += 1;
    }
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) if (name.startsWith(FEL_CACHE_PREFIX)) await caches.delete(name);
    }
  } catch { /* no service worker support, or storage blocked: nothing to remove */ }
  return removed;
}
