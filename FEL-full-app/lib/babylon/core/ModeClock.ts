// ModeClock — two small game-clock helpers for a mode. PURE: no Babylon, no DOM.
//
// IMPROVE (2026-10-06), Karate VS:
//   GameTimers — callbacks that wait on the GAME clock (the dt the mode is handed, so a hit-stop, a pause or a scoped
//                slow-mo stretch them) instead of `setTimeout` on the wall clock. Cleared in one call at a round reset or a
//                dispose, so nothing fires on a disposed rig.
//   BannerSlot — ONE banner with an expiry. Every banner used to start its own `setTimeout` that cleared the banner
//                whatever it said by then, so an older timer wiped a newer banner early.

/** Callbacks due after `sec` of whatever clock `tick` is fed. */
export class GameTimers {
  private items: { left: number; fn: () => void }[] = [];
  get size(): number { return this.items.length; }

  after(sec: number, fn: () => void): void { this.items.push({ left: Math.max(0, sec), fn }); }

  /** Advance by `dt`; fires what came due, oldest first. A callback may schedule another (it waits for the next tick). */
  tick(dt: number): void {
    if (!this.items.length) return;
    const due: (() => void)[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.left -= dt;
      if (it.left <= 0) { due.push(it.fn); this.items.splice(i, 1); i--; }
    }
    for (const fn of due) fn();
  }

  clear(): void { this.items.length = 0; }
}

/** One banner at a time, with an expiry on the caller's clock (seconds). */
export class BannerSlot {
  private text = '';
  private until = 0;

  /** Show `text` until `clock + sec` (Infinity = until replaced or cleared). Returns the text to publish. */
  show(text: string, sec: number, clock: number): string {
    this.text = text; this.until = clock + Math.max(0, sec);
    return text;
  }

  /** '' when the banner has just expired (publish it once), null when nothing changed. */
  tick(clock: number): string | null {
    if (!this.text || clock < this.until) return null;
    this.text = ''; this.until = 0;
    return '';
  }

  clear(): void { this.text = ''; this.until = 0; }
  get current(): string { return this.text; }
}
