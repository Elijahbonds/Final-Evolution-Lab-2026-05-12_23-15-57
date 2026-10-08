// BannerQueue — one HUD banner at a time, ticked on the mode's own clock (IMPROVE 2026-10-06, skate item 17).
//
// The board modes flashed a banner with `setHud({ banner })` and cleared it with a `setTimeout`. Every flash owned its own
// timer, so a trick's 500 ms clear wiped a "GOAL:" banner that went up 100 ms later, and every timer kept running after
// the mode was disposed. Here a banner has a priority and a life; a higher (or equal) one replaces what is up, a lower
// one waits its turn behind it (briefly — a stale banner is worse than none) or, at the lowest priority, is simply
// dropped; and the clock is whatever the mode ticks it with, so nothing outlives the mode. Pure: no Babylon, no DOM.

/** How loud a banner is: the incidental is chatter; a trick, a bank or a bail is a beat; a goal is the run's news. */
export const BANNER_PRIO = { chatter: 1, beat: 2, news: 3 } as const;
/** A banner that has waited this long behind a louder one is dropped instead of shown late (ms). */
export const BANNER_MAX_WAIT_MS = 1500;

interface Waiting { text: string; ms: number; prio: number; waited: number; seq: number }

export class BannerQueue {
  private cur: { text: string; left: number; prio: number } | null = null;
  private waiting: Waiting[] = [];
  private seq = 0;

  /** The text the HUD should show now ('' when nothing is up). */
  get text(): string { return this.cur?.text ?? ''; }

  /** Put a banner up for `ms`. Returns true when the visible text changed (the caller publishes it). */
  show(text: string, ms: number, prio: number = BANNER_PRIO.chatter): boolean {
    if (!text || !(ms > 0)) return false;
    const before = this.text;
    if (!this.cur || prio >= this.cur.prio) {
      // what was up is replaced, not resumed later: a trick name shown a second after the trick is noise
      this.cur = { text, left: ms, prio };
    } else if (prio > BANNER_PRIO.chatter) {
      this.waiting.push({ text, ms, prio, waited: 0, seq: this.seq++ });
    }
    return this.text !== before;
  }

  /** Advance `dtMs`. Returns true when the visible text changed. */
  tick(dtMs: number): boolean {
    if (!(dtMs > 0)) return false;
    const before = this.text;
    for (const w of this.waiting) w.waited += dtMs;
    this.waiting = this.waiting.filter((w) => w.waited < BANNER_MAX_WAIT_MS);
    if (this.cur) {
      this.cur.left -= dtMs;
      if (this.cur.left <= 0) this.cur = null;
    }
    if (!this.cur && this.waiting.length) {
      // the loudest waiting banner, oldest first among equals
      this.waiting.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
      const next = this.waiting.shift()!;
      this.cur = { text: next.text, left: next.ms, prio: next.prio };
    }
    return this.text !== before;
  }

  /** Nothing up, nothing waiting. */
  clear(): void { this.cur = null; this.waiting = []; }
}
