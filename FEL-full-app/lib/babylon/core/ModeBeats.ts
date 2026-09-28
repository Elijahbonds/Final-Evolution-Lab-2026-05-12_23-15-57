/**
 * ModeBeats — a mode's game beats on the mode's OWN clock (QA P0-04, 2026-09-27).
 *
 * The harness calls update() only while 'playing', and a mode's rounds used to move between beats on setTimeout: the
 * derby's next pitch (0.8 s) and its end (1 s), the shootout's keeper round (1.2 s) and the result of their kick (1.3 s).
 * A wall-clock timer does not know the phase. It fires in 'paused' (a shootout could end while paused), and it outlives
 * dispose: the modes are singletons, so a beat still pending when a mount is torn down fires into the NEXT mount's state
 * (a pitch counted, a kick advanced) before that player has touched anything.
 *
 * A beat here waits for the mode's update(dt): it never advances in 'loading', 'ready' or 'paused', and clear() on load
 * and dispose drops whatever the last mount left pending. Cosmetic timers (a banner clearing, a keeper getting up) can
 * stay on setTimeout; a beat that moves the game cannot.
 */
export class ModeBeats {
  private queue: { left: number; fn: () => void }[] = [];

  /** Run `fn` after `sec` seconds of the mode's update clock. */
  after(sec: number, fn: () => void): void {
    this.queue.push({ left: Math.max(0, sec), fn });
  }

  /** Advance by the frame's dt and run every beat that came due, in the order they were scheduled. */
  update(dt: number): void {
    if (this.queue.length === 0) return;
    const due: (() => void)[] = [];
    this.queue = this.queue.filter((b) => {
      b.left -= dt;
      if (b.left > 0) return true;
      due.push(b.fn);
      return false;
    });
    for (const fn of due) fn();
  }

  /** Drop every pending beat (a new mount, a dispose). */
  clear(): void {
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }
}
