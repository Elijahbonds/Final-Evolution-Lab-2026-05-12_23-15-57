// Offline play (offline-push, round 8, 2026-10-26): which pages the service worker keeps a copy of, and the switch.
//
// app-feel's worker (public/sw.js) never caches a page, so with no signal every page load is the offline page. The owner
// approved "graceful offline: single-player and downloaded lessons offline via PWA, sync later, clear offline messages"
// (QUALITY, 2026-10-20). This is that, and ONLY that:
//   · NEXT_PUBLIC_OFFLINE_PLAY_ENABLED (off by default; build-time, like NEXT_PUBLIC_SW_ENABLED, and needs that one on)
//     registers the worker as /sw.js?offline=1. Without it the worker behaves exactly as app-feel shipped it.
//   · With it, the pages below are NETWORK FIRST: online, the page always comes from the network (so a deploy is never
//     pinned behind an old copy); the copy is kept and answers ONLY when the network fails. Everything else still
//     gets /offline.html.
//   · A page opened with a ranked, staked or Arena parameter is never answered from a copy: those plays need the server
//     (OFFLINE_REFUSED_PARAMS).
//
// public/sw.js cannot import this file, so it carries the same list; tests/pwa/sw-offline.test.ts fails when they drift
// (a new mode in lib/game-data.ts MODE_INFO is a red test until the worker learns it).
import { listedModeEntries } from '@/lib/game-data';

/** `?offline=1` on the worker's URL turns offline play on inside it. A different URL is a new worker, so flipping the
 *  flag either way replaces the worker on the next page load, and its activate step drops the page copies. */
export const OFFLINE_SW_QUERY = 'offline=1';

/** Read literally at build time by the caller (Next inlines NEXT_PUBLIC_ values): "1" or "true" is on. */
export function offlinePlayOn(flag: string | undefined): boolean {
  return flag === '1' || flag?.toLowerCase() === 'true';
}

/** The worker's URL: app-feel's, plus the offline-play switch when it is on. */
export function swScriptUrl(base: string, offline: boolean): string {
  return offline ? `${base}?${OFFLINE_SW_QUERY}` : base;
}

/** Ranked, staked, Arena, async-challenge and duel-link plays: refused offline (the server decides them). */
export const OFFLINE_REFUSED_PARAMS = ['arena', 'mp', 'c', 'tier', 'stake', 'ranked'] as const;

/** Does this page URL carry a play that needs the server? */
export function needsServer(search: string): boolean {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return false; }
  return OFFLINE_REFUSED_PARAMS.some((p) => q.has(p));
}

/** Pages beyond the mode catalogue: the shell, the Mirror's screen, the drills, the combine (OFF-02) and the lessons. */
export const OFFLINE_EXTRA_PAGES: readonly string[] = [
  '/',
  '/play',
  '/train',
  '/train/today-drill',
  '/play/drills',
  '/play/mirror/assess',
  '/coach/combine',
  '/learn',
  '/education/playbook',
];

/** A Playbook chapter, /education/playbook/<n>: a downloaded lesson. */
export const OFFLINE_LESSON_PATTERN = /^\/education\/playbook\/\d{1,3}$/;

/** Every single-player mode page in the listed catalogue (the /play/<slug> routes), then the extras; no duplicates. */
export function offlinePagePaths(): string[] {
  const modes = listedModeEntries().map(([, info]) => info.href.split(/[?#]/)[0]).filter((h) => h.startsWith('/play/'));
  return [...new Set([...modes, ...OFFLINE_EXTRA_PAGES])].sort();
}

/** Is this path one the worker keeps for offline? */
export function isOfflinePage(pathname: string): boolean {
  return offlinePagePaths().includes(pathname) || OFFLINE_LESSON_PATTERN.test(pathname);
}

/** The words the offline banner and the end card use. One place, plain language. */
export const OFFLINE_COPY = {
  offline: "You're offline. Games and lessons you've opened before still work here.",
  offlineResults: 'Results are saved on this phone and added to your history when you are back online.',
  refused: 'Ranked, staked and Arena play need a connection.',
  back: 'Back online.',
  synced: (n: number) => `Back online. ${n} offline result${n === 1 ? '' : 's'} added to your history.`,
} as const;

/** Sign-in, sign-up and sign-out pages: arriving on one drops this device's page copies and kept profile. */
export function isSignInPath(pathname: string): boolean {
  return /^\/(login|signup|logout|auth)(\/|$)/.test(pathname);
}

/** The most resource URLs one warm message carries (the worker takes at most 400 too). */
export const WARM_MAX_ASSETS = 400;

/**
 * The 'fel-warm' message a page posts its worker: this page, and the same-origin files it has loaded so far. The worker
 * keeps only what its own rules would keep (FEL_SW.strategyFor) and only what it does not have yet.
 */
export function warmMessage(pageHref: string, resourceUrls: readonly string[], origin: string): { type: 'fel-warm'; page: string; assets: string[] } {
  const same = new Set<string>();
  for (const raw of resourceUrls) {
    let u: URL;
    try { u = new URL(raw, origin); } catch { continue; }
    if (u.origin !== origin || u.pathname.startsWith('/api/')) continue;
    same.add(u.href);
    if (same.size >= WARM_MAX_ASSETS) break;
  }
  return { type: 'fel-warm', page: pageHref, assets: [...same] };
}
