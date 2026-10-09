// voiceQueue: the ONE voice lane of a scene (VOICEOVER, 2026-10-06).
//
// Owner: "they talk over each other, come late, or cut off". The evidence, before this file:
//   - VoiceKit.play stopped the booth before EVERY booth cue (`if (cue.interrupt || cue.channel === 'booth') this.stop('booth', 0.06)`),
//     so the sidekick's answer, queued by MicDirector on the line's estimated length, cut the MC's tail whenever the decode ran late;
//   - the 'player' channel (rival and hooper chatter, the Coach, Professor Okta) was never stopped and never waited: a player line
//     started on top of the MC;
//   - a cue started whenever its clips finished decoding (`await Promise.all(...)`, no deadline), so a slow decode put a "what a
//     dunk" a second or two after the dunk;
//   - an interrupt was a 60 ms fade: a word chopped in half.
//
// This is the pure decision half (VoiceKit is the thin Web Audio half). Every foreground voice (the booth, a player, the coach, a
// room's host) asks this queue, and the queue answers start / wait / drop. The rule, in one place:
//   1. The lane is free: start now.
//   2. A BIGGER moment (higher priority), or a caller that asked to cut in at equal priority (`interrupt`), cuts the line that is
//      playing: a short fade-out, then the new line. Exception: the playing line is in its last NEAR_END seconds: the new one waits
//      for it instead (cutting the last word saves nothing).
//   3. Otherwise the new line waits its turn, but only if it can start inside its window (MAX_DELAY by priority). A line that
//      cannot is dropped now: a late line is worse than none. Filler (priority 0) never waits.
//   4. When the lane frees, the best waiting line (priority, then age) starts, after a breath (GAP). Lines whose window has passed
//      are dropped then, never played late.
//   5. The same moment cannot start again inside its cooldown (by priority): the MC does not call every ordinary bucket.
// Nothing here reads a clock: every call is handed `now` (seconds), so tests drive it like a film.

export interface VoiceRequest {
  /** The caller's handle for this line. */
  id: number;
  /** 0 filler, 1 an ordinary call, 2 a good one, 3 the biggest moment (MicDirector.priorityOf's scale). */
  priority: number;
  /** How long the line plays, in seconds (the decoded clips' real length when known). */
  sec: number;
  /** When the line was asked for (seconds). Its window runs from here, not from when it was decoded. */
  at: number;
  /** Cooldown key: the moment family ('game.make', 'momentum.hot'). No key = no cooldown. */
  moment?: string;
  /** The caller wants to cut in at equal priority (Brain Brawl's host: the newest line is the one that matters). */
  interrupt?: boolean;
  /** Overrides the priority's window (seconds). */
  maxDelay?: number;
}

export type DropReason = 'stale' | 'cooldown' | 'busy' | 'full' | 'cleared';
export type Decision =
  | { kind: 'start'; at: number; cut?: { id: number; fadeSec: number } }
  | { kind: 'queued'; at: number }
  | { kind: 'drop'; reason: DropReason };

export interface VoiceRules {
  /** The longest a line may wait to start, by priority 0..3 (seconds). */
  maxDelay: readonly [number, number, number, number];
  /** Same-moment cooldown by priority 0..3 (seconds). */
  cooldown: readonly [number, number, number, number];
  /** A line this close to its end is let finish rather than cut (seconds). */
  nearEnd: number;
  /** The fade on a cut (seconds). */
  fade: number;
  /** The breath between two lines (seconds). */
  gap: number;
  /** How many lines may wait at once. */
  capacity: number;
}

// TUNED (VOICEOVER 2026-10-06), every number with its reason:
//   maxDelay 0 / 1.2 / 2.0 / 3.0 s: filler is only worth saying into silence; an ordinary call (1.2 s) keeps MicDirector's own
//     QUEUE_WAIT; a good call may wait a little longer; the biggest moment (a 50, a game winner) is still worth hearing 3 s on.
//   cooldown 0 / 5 / 2 / 0 s: filler has its own 7-12 s timer; an ordinary call ("bucket") at most every 5 s is the repetition
//     the owner hears in a run of makes; a good call 2 s; the biggest moment is never held back.
//   nearEnd 0.35 s: about one short word at the rendered pace (~2.6 words a second).
//   fade 0.15 s: long enough to read as a hand-over, not a cut (the old 60 ms clicked mid-word); short enough to keep the moment.
//   gap 0.15 s: MicDirector's own GAP is 0.18 s between two clips of one cue; a hair less between two cues.
//   capacity 2: a third waiting line would only ever be stale by the time it played.
export const VOICE_RULES: VoiceRules = Object.freeze({
  maxDelay: [0, 1.2, 2.0, 3.0] as const,
  cooldown: [0, 5, 2, 0] as const,
  nearEnd: 0.35,
  fade: 0.15,
  gap: 0.15,
  capacity: 2,
});

const tier = (p: number): 0 | 1 | 2 | 3 => (p <= 0 ? 0 : p >= 3 ? 3 : (Math.round(p) as 1 | 2));

interface Playing { req: VoiceRequest; startedAt: number; endsAt: number }

export class VoiceQueue {
  private cur: Playing | null = null;
  private waiting: VoiceRequest[] = [];
  private readonly lastStart = new Map<string, number>();

  constructor(private readonly rules: VoiceRules = VOICE_RULES) {}

  /** The line that is playing, if any. */
  get playing(): Readonly<Playing> | null { return this.cur; }
  /** The lines waiting, best first. */
  get queued(): readonly VoiceRequest[] { return this.waiting; }

  /** The longest `req` may wait before it is stale. */
  windowOf(req: VoiceRequest): number { return req.maxDelay ?? this.rules.maxDelay[tier(req.priority)]; }

  /** A line asks for the lane. */
  request(req: VoiceRequest, now: number): Decision {
    this.settle(now);
    if (now - req.at > this.windowOf(req)) return { kind: 'drop', reason: 'stale' };
    if (this.cooling(req, now)) return { kind: 'drop', reason: 'cooldown' };
    const cur = this.cur;
    const aheadOfIt = this.waiting.length > 0 && this.waiting[0].priority >= req.priority;   // a line already waiting goes first
    if (!cur && !aheadOfIt) { const at = Math.max(now, this.freeAt); this.begin(req, at); return { kind: 'start', at }; }   // after the breath
    const outranks = !!cur && (req.priority > cur.req.priority || (!!req.interrupt && req.priority >= cur.req.priority));
    if (cur && outranks && cur.endsAt - now > this.rules.nearEnd) {
      const cut = { id: cur.req.id, fadeSec: this.rules.fade };
      // what was waiting behind the cut line, and is no bigger than the new one, has lost its moment
      this.waiting = this.waiting.filter((w) => w.priority > req.priority);
      const at = now + this.rules.fade * 0.6;   // the new line comes in under the tail of the fade, not after silence
      this.begin(req, at);
      return { kind: 'start', at, cut };
    }
    // wait: only when the line can still start inside its window
    const startAt = this.whenFree(req);
    if (req.priority <= 0 || startAt - req.at > this.windowOf(req)) return { kind: 'drop', reason: 'busy' };
    this.waiting.push(req);
    this.waiting.sort((a, b) => b.priority - a.priority || a.at - b.at);
    if (this.waiting.length > this.rules.capacity) {
      const out = this.waiting.pop()!;
      if (out.id === req.id) return { kind: 'drop', reason: 'full' };
      this.evicted.push(out);
    }
    return { kind: 'queued', at: startAt };
  }

  /** Lines pushed out of a full queue by a better one (the caller resolves them as dropped). Read once, then cleared. */
  takeEvicted(): VoiceRequest[] { const e = this.evicted; this.evicted = []; return e; }
  private evicted: VoiceRequest[] = [];

  /**
   * Time passes (call on every line end and on a timer at `nextWake`). Returns the line to start now (if the lane is free and a
   * waiting line is still inside its window, after the breath) and the lines dropped as stale.
   */
  next(now: number): { start: VoiceRequest | null; dropped: VoiceRequest[] } {
    this.settle(now);
    const dropped: VoiceRequest[] = [];
    this.waiting = this.waiting.filter((w) => {
      const ok = now - w.at <= this.windowOf(w) && !this.cooling(w, now);
      if (!ok) dropped.push(w);
      return ok;
    });
    if (this.cur || !this.waiting.length) return { start: null, dropped };
    if (now < this.freeAt) return { start: null, dropped };
    const start = this.waiting.shift()!;
    this.begin(start, now);
    return { start, dropped };
  }

  /** The line `id` stopped early (a hush, a failed start): the lane frees now. */
  stopped(id: number, now: number): void {
    if (this.cur?.req.id === id) { this.cur = null; this.freeAt = now; }
    this.waiting = this.waiting.filter((w) => w.id !== id);
  }

  /** When something next changes on its own: the playing line ends (plus the breath), or a waiting line goes stale. */
  nextWake(now: number): number | null {
    const t: number[] = [];
    if (this.cur) t.push(this.cur.endsAt + this.rules.gap);
    else if (this.waiting.length) t.push(Math.max(now, this.freeAt));
    for (const w of this.waiting) t.push(w.at + this.windowOf(w));
    return t.length ? Math.min(...t) : null;
  }

  /** Everything stops (a scene ends, the voice is switched off). Returns what was waiting, to resolve as dropped. */
  clear(now: number): VoiceRequest[] {
    const out = this.waiting; this.waiting = []; this.cur = null; this.freeAt = now;
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private freeAt = -Infinity;
  private begin(req: VoiceRequest, at: number): void {
    this.cur = { req, startedAt: at, endsAt: at + req.sec };
    if (req.moment) this.lastStart.set(req.moment, at);
  }
  /** The playing line has run out: the lane frees after the breath. */
  private settle(now: number): void {
    if (this.cur && now >= this.cur.endsAt) { this.freeAt = this.cur.endsAt + this.rules.gap; this.cur = null; }
  }
  private whenFree(req: VoiceRequest): number {
    const ahead = this.waiting.filter((w) => w.priority >= req.priority).reduce((a, w) => a + w.sec + this.rules.gap, 0);
    return (this.cur ? this.cur.endsAt + this.rules.gap : this.freeAt) + ahead;
  }
  private cooling(req: VoiceRequest, now: number): boolean {
    if (!req.moment) return false;
    const last = this.lastStart.get(req.moment);
    return last !== undefined && now - last < this.rules.cooldown[tier(req.priority)];
  }
}
