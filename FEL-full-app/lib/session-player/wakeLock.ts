// lib/session-player/wakeLock.ts — PLAT-P01 (2026-10-27): keep the screen on while the session plays.
//
// The phone is propped two metres away; a screen that sleeps in a 60-second rest ends the session. So while the player
// plays it holds a screen wake lock (navigator.wakeLock, where the browser has one — no dependency, nothing to install),
// and lets it go on pause, on the finish and when the player closes. The browser drops a wake lock by itself when the
// page is hidden; it is asked for again when the page comes back, if the player still wants it.
//
// Every call fails soft: no Wake Lock API, a refused request (low battery, a policy) — the session plays on.
//
// Client-safe (the navigator is handed in, so tests/session-player/wakeLock.test.ts runs it with a stub).

export interface SentinelLike { release(): Promise<void>; released?: boolean; addEventListener?(t: 'release', f: () => void): void }
export interface WakeLockNav { wakeLock?: { request(type: 'screen'): Promise<SentinelLike> } }
export interface DocLike { visibilityState?: string; addEventListener?(t: 'visibilitychange', f: () => void): void; removeEventListener?(t: 'visibilitychange', f: () => void): void }

export interface ScreenLock {
  /** Hold the screen on (or keep holding it). */
  hold(): void;
  /** Let it sleep again. */
  release(): void;
  /** Stop listening (the player closed): releases too. */
  dispose(): void;
  /** Is a lock held right now? */
  readonly held: boolean;
}

export function screenLock(nav: WakeLockNav | null | undefined, doc: DocLike | null | undefined): ScreenLock {
  let want = false;
  let sentinel: SentinelLike | null = null;
  let pending = false;

  const acquire = () => {
    if (!want || sentinel || pending || !nav?.wakeLock) return;
    if (doc?.visibilityState && doc.visibilityState !== 'visible') return;
    pending = true;
    nav.wakeLock.request('screen').then((s) => {
      pending = false;
      if (!want) { void s.release().catch(() => {}); return; }
      sentinel = s;
      s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
    }, () => { pending = false; });
  };

  const drop = () => {
    const s = sentinel;
    sentinel = null;
    if (s) void s.release().catch(() => {});
  };

  const onVisible = () => { if (doc?.visibilityState === 'visible') acquire(); };
  doc?.addEventListener?.('visibilitychange', onVisible);

  return {
    hold() { want = true; acquire(); },
    release() { want = false; drop(); },
    dispose() { want = false; drop(); doc?.removeEventListener?.('visibilitychange', onVisible); },
    get held() { return !!sentinel; },
  };
}
