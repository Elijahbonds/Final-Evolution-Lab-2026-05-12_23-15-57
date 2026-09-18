// PRESENCE — keeping the screen on, full, and the right way up (2026-09-13).
//
// Mission Phase C: "Add fullscreen + Screen Wake Lock + orientation lock on the HOST."
//
// All three are the same shape of problem: a browser API that needs a user gesture, is missing on some
// platforms, and throws in ways that must never take the game down. Safari has no Screen Wake Lock on the
// desktop and no orientation lock outside a PWA; a TV browser may have neither and does not need either.
// So every call here is best-effort, every failure is swallowed, and the caller gets a report of what
// actually happened rather than a promise that it did.
//
// WHY THIS MATTERS MORE FOR A HOST THAN A NORMAL PAGE: a host is being watched, not touched. Nobody taps it
// for twenty minutes while four people play with controllers, so the phone or laptop acting as the host
// dims and then sleeps mid-game — which is exactly the failure the wake lock exists to prevent and exactly
// the case a page that expects to be touched never hits.

export interface PresenceReport {
  fullscreen: boolean;
  wakeLock: boolean;
  orientation: boolean;
  /** What did not work, in plain words, for a caller that wants to say so. */
  notes: string[];
}

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener(t: string, f: () => void): void };

/**
 * Hold the screen awake, full and landscape.
 *
 * MUST be called from a user gesture — fullscreen and orientation lock both require one, and a page that
 * asks without one gets a rejected promise and, in some browsers, a console warning that looks like a bug.
 */
export class HostPresence {
  private sentinel: WakeLockSentinelLike | null = null;
  private visHandler: (() => void) | null = null;
  private el: Element | null = null;

  /** Enter. `el` is the element to fill — normally the game canvas's container. */
  async enter(el?: Element | null): Promise<PresenceReport> {
    const notes: string[] = [];
    this.el = el ?? (typeof document !== 'undefined' ? document.documentElement : null);

    const fullscreen = await this.goFullscreen(notes);
    const wakeLock = await this.holdWakeLock(notes);
    const orientation = await this.lockLandscape(notes);
    return { fullscreen, wakeLock, orientation, notes };
  }

  private async goFullscreen(notes: string[]): Promise<boolean> {
    const el = this.el as (Element & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    if (!el) return false;
    try {
      if (typeof el.requestFullscreen === 'function') { await el.requestFullscreen(); return true; }
      if (typeof el.webkitRequestFullscreen === 'function') { await el.webkitRequestFullscreen(); return true; }
      notes.push('Fullscreen is not available in this browser.');
    } catch {
      // the usual cause is being called outside a gesture, and the usual fix is the player pressing again
      notes.push('Fullscreen was refused — try the button again.');
    }
    return false;
  }

  private async holdWakeLock(notes: string[]): Promise<boolean> {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }) : null;
    if (!nav?.wakeLock) { notes.push('This browser cannot keep the screen awake — turn off auto-lock to be safe.'); return false; }
    try {
      this.sentinel = await nav.wakeLock.request('screen');
      // THE RE-ACQUIRE. A wake lock is released automatically whenever the tab is hidden — switching apps to
      // check something, or a phone call — and is NOT restored on return. Without this the screen sleeps a
      // few minutes after the first time anyone glances away, which looks exactly like a random failure.
      this.visHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !this.sentinel) {
          void nav.wakeLock!.request('screen').then((s) => { this.sentinel = s; }).catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', this.visHandler);
      this.sentinel.addEventListener('release', () => { this.sentinel = null; });
      return true;
    } catch {
      notes.push('Could not keep the screen awake.');
      return false;
    }
  }

  private async lockLandscape(notes: string[]): Promise<boolean> {
    const so = typeof screen !== 'undefined' ? (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> } | undefined) : undefined;
    if (!so?.lock) return false;                       // no note: a laptop and a TV do not rotate, and saying so is noise
    try { await so.lock('landscape'); return true; }
    catch { notes.push('Could not lock the orientation — rotate the device to landscape.'); return false; }
  }

  /** Let it all go. Safe to call twice, and safe to call when nothing was ever acquired. */
  async exit(): Promise<void> {
    if (this.visHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visHandler);
      this.visHandler = null;
    }
    try { await this.sentinel?.release(); } catch { /* already gone */ }
    this.sentinel = null;
    try { (screen.orientation as ScreenOrientation & { unlock?: () => void } | undefined)?.unlock?.(); } catch { /* nothing to unlock */ }
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* already out */ }
  }

  get holdingWakeLock(): boolean { return this.sentinel !== null; }
}

/** One line for the host UI summarising what it managed to do. */
export function presenceSummary(r: PresenceReport): string {
  const got = [r.fullscreen && 'fullscreen', r.wakeLock && 'screen awake', r.orientation && 'landscape'].filter(Boolean);
  return got.length ? `Host ready — ${got.join(' · ')}` : 'Host ready';
}
