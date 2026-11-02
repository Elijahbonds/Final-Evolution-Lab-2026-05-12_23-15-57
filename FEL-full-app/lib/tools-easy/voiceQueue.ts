// voiceQueue — one voice, every line heard in full (TOOLS-EASY, 2026-10-28; docs/CUE-STYLE.md §7).
//
// The app's voice (speakNatural) cancels whatever it is saying when it is handed a new line. SCREEN-EASY measured what
// that does to a live flow: 9.3 lines cut off a run. The tools this lane gives a voice (the readiness check, the combine
// jump station, bar speed, form review) say short lines, but two can land close together — "Your hands left your hips…"
// and the next jump's "One." — so they go through this queue: a line starts only when the one before has ended (its
// own end event, or its estimated length from lib/cue-style/speech.ts if no end ever comes). Nothing is cut off.
//
// A queue that falls behind says stale things, so at most MAX_WAITING lines wait; an older waiting line is dropped
// (never the one being said). A line already being said or waiting is not queued again.
//
// Pure: the speaker and the clock are passed in.
import { speechMs } from '@/lib/cue-style/speech';

/** (new) Lines that may wait behind the one being said. */
export const MAX_WAITING = 2;

export interface Speaker { speak(text: string, onend: () => void): void; cancel(): void }
export interface Timers { set(fn: () => void, ms: number): unknown; clear(h: unknown): void }

export class VoiceQueue {
  private speaking: string | null = null;
  private waiting: string[] = [];
  private guard: unknown = null;
  /** Every line actually started, in order (the tests and the rig read it). */
  readonly said: string[] = [];

  constructor(private readonly out: Speaker, private readonly timers: Timers) {}

  say(text: string): void {
    const t = text.trim();
    if (!t || t === this.speaking || this.waiting.includes(t)) return;
    if (!this.speaking) { this.start(t); return; }
    this.waiting.push(t);
    while (this.waiting.length > MAX_WAITING) this.waiting.shift();
  }

  /** Stop now (the set ended, the page closed): nothing more is said. */
  stop(): void {
    this.waiting = [];
    this.speaking = null;
    if (this.guard !== null) this.timers.clear(this.guard);
    this.guard = null;
    this.out.cancel();
  }

  /** The take is over: the line being said ends in full, nothing waiting is said after it (CUE-STYLE §7). */
  hush(): void { this.waiting = []; }

  get busy(): boolean { return this.speaking !== null; }

  private start(t: string): void {
    this.speaking = t;
    this.said.push(t);
    let ended = false;
    const end = () => {
      if (ended || this.speaking !== t) return;
      ended = true;
      if (this.guard !== null) this.timers.clear(this.guard);
      this.guard = null;
      this.speaking = null;
      const next = this.waiting.shift();
      if (next) this.start(next);
    };
    // the end event can be lost (a voice that never fires onend): the line's own length, twice over, then move on
    this.guard = this.timers.set(end, speechMs(t) * 2);
    this.out.speak(t, end);
  }
}
