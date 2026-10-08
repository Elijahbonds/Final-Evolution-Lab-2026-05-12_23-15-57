/**
 * The dialogue player (ADVENTURE PLAN, "The dialogue and cutscene player", Phase B). Pure: no Babylon, no DOM, no
 * clock (the caller hands `update()` real seconds), so a headless test drives it like a film.
 *
 *   A LINE QUEUE. `play(lines)` queues a scene's lines; one shows at a time with its speaker. The text REVEALS at
 *   REVEAL_CPS, and the line AUTO-ADVANCES after `lineSec(text)`: about 2.8 words a second, never under 1.2 s (the
 *   plan's reading pace), and never before the reveal has finished and been on screen a beat.
 *   TAP to finish a line: a tap while the text is still revealing shows it whole; a tap on a whole line moves on.
 *   HOLD to skip the scene: a press held SKIP_HOLD_SEC clears every line left (a choice takes its default).
 *   CHOICES for the rare branch: a line with choices waits (no auto-advance) until `choose(i)`; the up/down presses
 *   move the highlight and a tap takes it.
 *
 * Each line that starts is reported through `onLine` (the voice queue and the critical caption hang off it); a scene
 * that runs out through `onEnd` (with the choice taken, if any). Allocation: `view()` refreshes one object.
 */

import type { StoryChoice, StoryLine } from './format';

/** The plan's reading pace. [TUNE] */
export const WORDS_PER_SEC = 2.8;
/** The shortest a line stays up. [TUNE] */
export const MIN_LINE_SEC = 1.2;
/** The typewriter's speed, characters a second (much faster than reading: it is a reveal, not a pace). [TUNE] */
export const REVEAL_CPS = 48;
/** A revealed line stays at least this long before it auto-advances. [TUNE] */
export const READ_TAIL_SEC = 0.6;
/** A press held this long skips the scene. [TUNE] */
export const SKIP_HOLD_SEC = 0.8;

export const wordCount = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** How long a line is up before it moves on by itself (the plan's 2.8 words a second, at least 1.2 s). */
export function lineSec(text: string): number {
  const read = wordCount(text) / WORDS_PER_SEC;
  const reveal = text.length / REVEAL_CPS + READ_TAIL_SEC;
  return Math.max(MIN_LINE_SEC, read, reveal);
}

/** A line as the player shows it: the speaker resolved to a display name, and the placeholder tag. */
export interface DialogueLine extends StoryLine {
  speakerName: string;
  placeholder: boolean;
  choices?: StoryChoice[];
  defaultChoice?: string;
}

export interface DialogueView {
  active: boolean;
  lineId: string | null;
  speaker: string;
  /** The whole line. */
  text: string;
  /** How many characters are revealed. */
  shown: number;
  placeholder: boolean;
  choices: readonly StoryChoice[] | null;
  /** The highlighted choice. */
  choiceIndex: number;
  /** 0..1 of the current line's time (a skip-hold ring could show it). */
  hold01: number;
  /** Lines left after this one. */
  queued: number;
}

export interface DialogueEnd { sceneId: string; skipped: boolean; choice: StoryChoice | null }

export interface DialogueHooks {
  onLine?: (l: DialogueLine) => void;
  onEnd?: (e: DialogueEnd) => void;
}

export class DialoguePlayer {
  private queue: DialogueLine[] = [];
  private cur: DialogueLine | null = null;
  private t = 0;
  private revealed = 0;
  private sceneId = '';
  private choiceIndex = 0;
  private pressSec = -1;
  private choice: StoryChoice | null = null;
  private readonly out: DialogueView = {
    active: false, lineId: null, speaker: '', text: '', shown: 0, placeholder: false, choices: null, choiceIndex: 0, hold01: 0, queued: 0,
  };

  constructor(private readonly hooks: DialogueHooks = {}) {}

  get active(): boolean { return this.cur !== null; }
  get scene(): string { return this.sceneId; }
  /** The line on screen. */
  get line(): Readonly<DialogueLine> | null { return this.cur; }
  /** Seconds the current line has been up. */
  get lineT(): number { return this.t; }
  /** True while the current line waits for a choice. */
  get choosing(): boolean { return !!this.cur?.choices?.length; }

  /** Start a scene (any scene playing is replaced; its end is not reported). */
  play(sceneId: string, lines: readonly DialogueLine[]): void {
    this.sceneId = sceneId;
    this.queue = lines.slice();
    this.cur = null;
    this.choice = null;
    this.pressSec = -1;
    this.next();
  }

  /** Real seconds pass. */
  update(dt: number): void {
    if (!this.cur) return;
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    if (this.pressSec >= 0) {
      this.pressSec += d;
      if (this.pressSec >= SKIP_HOLD_SEC) { this.pressSec = -1; this.skip(); return; }
    }
    this.t += d;
    this.revealed = Math.min(this.cur.text.length, this.revealed + d * REVEAL_CPS);
    if (!this.choosing && this.t >= lineSec(this.cur.text)) this.next();
  }

  /** The confirm button went down (a tap, or the start of a hold). */
  press(): void { if (this.cur && this.pressSec < 0) this.pressSec = 0; }

  /** The confirm button came up: a short press is a tap. */
  release(): void {
    if (!this.cur || this.pressSec < 0) return;
    const held = this.pressSec;
    this.pressSec = -1;
    if (held < SKIP_HOLD_SEC) this.tap();
  }

  /** Finish the line: reveal it whole, or (already whole) move on; on a choice, take the highlighted one. */
  tap(): void {
    const c = this.cur;
    if (!c) return;
    if (this.revealed < c.text.length) { this.revealed = c.text.length; return; }
    if (this.choosing) { this.choose(this.choiceIndex); return; }
    this.next();
  }

  /** Move the choice highlight (−1 up, +1 down). */
  move(dir: -1 | 1): void {
    const n = this.cur?.choices?.length ?? 0;
    if (n > 0) this.choiceIndex = (this.choiceIndex + dir + n) % n;
  }

  choose(i: number): void {
    const cs = this.cur?.choices;
    if (!cs?.length) return;
    const k = Math.max(0, Math.min(cs.length - 1, Math.floor(i)));
    this.choice = cs[k];
    this.next();
  }

  /** Skip the rest of the scene (a hold): a waiting choice takes its default. */
  skip(): void {
    if (!this.cur) return;
    const pending = [this.cur, ...this.queue].find((l) => l.choices?.length);
    if (pending && !this.choice) this.choice = pending.choices!.find((x) => x.id === pending.defaultChoice) ?? pending.choices![0];
    this.queue = [];
    this.cur = null;
    this.hooks.onEnd?.({ sceneId: this.sceneId, skipped: true, choice: this.choice });
  }

  /** Stop without reporting an end (a scene torn down). */
  clear(): void { this.queue = []; this.cur = null; this.pressSec = -1; }

  view(): Readonly<DialogueView> {
    const o = this.out, c = this.cur;
    o.active = !!c;
    o.lineId = c?.id ?? null;
    o.speaker = c?.speakerName ?? '';
    o.text = c?.text ?? '';
    o.shown = c ? Math.floor(this.revealed) : 0;
    o.placeholder = !!c?.placeholder;
    o.choices = c?.choices?.length ? c.choices : null;
    o.choiceIndex = this.choiceIndex;
    o.hold01 = this.pressSec >= 0 ? Math.min(1, this.pressSec / SKIP_HOLD_SEC) : 0;
    o.queued = this.queue.length;
    return o;
  }

  private next(): void {
    const n = this.queue.shift() ?? null;
    this.cur = n;
    this.t = 0;
    this.revealed = 0;
    this.choiceIndex = 0;
    if (n) { this.hooks.onLine?.(n); return; }
    this.hooks.onEnd?.({ sceneId: this.sceneId, skipped: false, choice: this.choice });
  }
}
