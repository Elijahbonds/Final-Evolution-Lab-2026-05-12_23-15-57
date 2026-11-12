// BannerQueue — one HUD banner at a time, ticked on the mode's own clock (IMPROVE 2026-10-06, skate item 17).
//
// The board modes flashed a banner with `setHud({ banner })` and cleared it with a `setTimeout`. Every flash owned its own
// timer, so a trick's 500 ms clear wiped a "GOAL:" banner that went up 100 ms later, and every timer kept running after
// the mode was disposed. Here a banner has a priority and a life; a higher (or equal) one replaces what is up, a lower
// one waits its turn behind it (briefly — a stale banner is worse than none) or, at the lowest priority, is simply
// dropped; and the clock is whatever the mode ticks it with, so nothing outlives the mode. Pure: no Babylon, no DOM.

import { minReadMs, readableMs } from '../../readable/rules';

/** How loud a banner is: the incidental is chatter; a trick, a bank or a bail is a beat; a goal is the run's news. */
export const BANNER_PRIO = { chatter: 1, beat: 2, news: 3 } as const;
/** A banner that has waited this long PAST the read time of the one in front of it is dropped instead of shown late (ms).
 *  READABLE (2026-11-02): the one in front now leaves as soon as it has been readable when something is waiting, so a
 *  waiting beat is shown sooner rather than dropped; this limit only clears a pile-up of several. */
export const BANNER_MAX_WAIT_MS = 1500;

interface Waiting { text: string; ms: number; prio: number; waited: number; seq: number }
interface Current { text: string; left: number; prio: number; shown: number; read: number }

export class BannerQueue {
  private cur: Current | null = null;
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
      // READABLE (2026-11-02): up for max(its life, its read time — words × 0.3 s + 1 s)
      this.cur = { text, left: readableMs(text, ms), prio, shown: 0, read: minReadMs(text) };
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
    this.waiting = this.waiting.filter((w) => w.waited < BANNER_MAX_WAIT_MS + (this.cur?.read ?? 0));
    if (this.cur) {
      this.cur.left -= dtMs;
      this.cur.shown += dtMs;
      // something is waiting: what is up leaves as soon as it has been readable, so the next one is shown sooner
      // instead of waiting out a long life and being dropped as stale
      if (this.waiting.length) this.cur.left = Math.min(this.cur.left, this.cur.read - this.cur.shown);
      if (this.cur.left <= 0) this.cur = null;
    }
    if (!this.cur && this.waiting.length) {
      // the loudest waiting banner, oldest first among equals
      this.waiting.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
      const next = this.waiting.shift()!;
      this.cur = { text: next.text, left: readableMs(next.text, next.ms), prio: next.prio, shown: 0, read: minReadMs(next.text) };
    }
    return this.text !== before;
  }

  /** Nothing up, nothing waiting. */
  clear(): void { this.cur = null; this.waiting = []; }
}
