// spaceVoice — when the Coach says the space check's lines out loud (movement play, phase 4, 2026-09-25).
//
// The player sets up 3.5–4.5 m from the screen, where a sentence on it is hard to read, so the check's instructions
// that the Coach has a pre-rendered line for (coach.space.*: 21 takes in public/audio/voice/v1/coach) are spoken as well
// as shown. Spoken badly they are worse than silence — a voice that repeats "step back" at every twitch of the fill, or
// talks over itself — so this decides WHEN, and the words stay on screen either way:
//   an instruction is spoken only once it has held SAY_STABLE_MS (a verdict that flickers is never said);
//   never two lines closer than SAY_GAP_MS;
//   the same line again only if the instruction changed and came back, and SAY_REPEAT_MS after it was last said;
//   the opening line once per run; "all set" once each time the check gets there;
//   the rendered takes of a line take turns (coach.space.back.01, .02, .03 …);
//   a line with no take in the bank (not loaded, or not voiced) is silence.
// Pure: the bank (the clip ids that loaded) is handed in.
import type { SpaceState } from './spaceCheck';

/** An instruction must hold this long (ms) before it is spoken. */
export const SAY_STABLE_MS = 600;
/** Never two lines closer than this (ms). */
export const SAY_GAP_MS = 2500;
/** The same line again only after this (ms), and only once the instruction changed and came back. */
export const SAY_REPEAT_MS = 8000;
/** The Coach's cast: clip ids are '<cast>/<line id>' (VoiceKit). */
export const COACH_CAST = 'coach';

export class SpaceVoice {
  private cur: string | null = null;
  private since = 0;
  private lastSaidAt = -Infinity;
  private readonly lastSaid = new Map<string, number>();
  /** Lines said and then left (the instruction moved on): they may be said again once they come back. */
  private readonly left = new Set<string>();
  private introDone = false;
  private readyDone = false;
  private readonly turn = new Map<string, number>();

  /** The clip to play now ('coach/coach.space.back.02'), or null. Call it on every state of the check. */
  next(s: Pick<SpaceState, 't' | 'instruction' | 'stage'>, bank: ReadonlySet<string>): string | null {
    const id = s.instruction.id;
    if (id !== this.cur) {
      if (this.cur) this.left.add(this.cur);
      this.cur = id;
      this.since = s.t;
    }
    if (s.stage !== 'ready') this.readyDone = false;
    if (!s.instruction.voiced) return null;
    if (s.t - this.since < SAY_STABLE_MS || s.t - this.lastSaidAt < SAY_GAP_MS) return null;
    if (s.instruction.rule === 'intro' && this.introDone) return null;
    if (s.stage === 'ready') {
      if (this.readyDone) return null;
    } else {
      const last = this.lastSaid.get(id);
      if (last !== undefined && (!this.left.has(id) || s.t - last < SAY_REPEAT_MS)) return null;
    }
    const clip = this.take(id, bank);
    if (!clip) return null;
    this.lastSaidAt = s.t;
    this.lastSaid.set(id, s.t);
    this.left.delete(id);
    if (s.instruction.rule === 'intro') this.introDone = true;
    if (s.stage === 'ready') this.readyDone = true;
    return clip;
  }

  /** A new run: everything may be said again. */
  reset(): void {
    this.cur = null; this.since = 0; this.lastSaidAt = -Infinity; this.lastSaid.clear(); this.left.clear();
    this.introDone = false; this.readyDone = false; this.turn.clear();
  }

  /** The next rendered take of a line that the bank holds, in turn. */
  private take(id: string, bank: ReadonlySet<string>): string | null {
    const prefix = `${COACH_CAST}/${id}.`;
    const takes = [...bank].filter((c) => c.startsWith(prefix)).sort();
    if (!takes.length) return null;
    const n = this.turn.get(id) ?? 0;
    this.turn.set(id, n + 1);
    return takes[n % takes.length];
  }
}
