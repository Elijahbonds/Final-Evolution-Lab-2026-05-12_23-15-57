// lib/babylon/music/performSet.ts — the Groove Academy's PERFORM set: its notes, its judge and its length. PURE (no
// audio, no React), so the Arena's score check on the server reads the same rules the room plays by.
//
// HOTFIX (2026-09-24): a PERFORM set had no end — it ran until the player pressed END SET — and each hit pays
// 100 × (1 + floor(combo / 5)), which grows with the square of an unbroken run. No score was too big to be honest, so the
// Arena could not bound a staked set (its old limit, 500,000, fell to about 72 s of perfect play). A set is now
// PERFORM_SET_BARS bars of the sequencer: every step of those bars is one note, and after the last note's window closes
// the set ends on its own. The judge is the one StudioMode used, moved here unchanged.
//
// ARENA SETS ONLY (owner, 2026-09-24: "Cap only Arena sets — staked Arena sets end after 32 bars; free play stays
// endless"). The cap is there so a staked score can be checked; free play stakes nothing, so it has no cap. A set is
// built as one or the other: `new PerformSet({ arena: true })` is the staked set the Arena's ceiling describes, and
// `{ arena: false }` offers a note on every step until END SET.

/** Sequencer steps in a bar (StudioMode's STEPS: 16ths). */
export const PERFORM_STEPS_PER_BAR = 16;
/** How long an Arena set lasts, in bars. TUNE(elijah): 32 bars is 83 s at the default 92 BPM, 48 s at 160, 128 s at 60. */
export const PERFORM_SET_BARS = 32;
/** Every step of an Arena set is a note to hit. */
export const PERFORM_SET_NOTES = PERFORM_SET_BARS * PERFORM_STEPS_PER_BAR;
/** A note not hit this long after it sounds is a miss (and breaks the combo). */
export const PERFORM_EXPIRE_S = 0.25;
/** A hit closer than this to its note is PERFECT; anything else inside the window is GOOD. */
export const PERFORM_PERFECT_S = 0.08;
export const PERFORM_PERFECT_PTS = 100;
export const PERFORM_GOOD_PTS = 50;
/** The multiplier steps up by one every this many hits in a row. */
export const PERFORM_COMBO_STEP = 5;

/** What one hit pays, given the combo it was hit on (the hits in a row before it). */
export function performHitPoints(perfect: boolean, comboBefore: number): number {
  return (perfect ? PERFORM_PERFECT_PTS : PERFORM_GOOD_PTS) * (1 + Math.floor(comboBefore / PERFORM_COMBO_STEP));
}

/** The most an Arena set can score: every note of it hit PERFECT in one unbroken combo. */
export function performSetMax(notes: number = PERFORM_SET_NOTES): number {
  let total = 0;
  for (let i = 0; i < notes; i++) total += performHitPoints(true, i);
  return total;
}

/** What an Arena set tells the player before and while it plays. Free play shows nothing of the kind. */
export const ARENA_SET_NOTE = `Arena set: it ends on its own after ${PERFORM_SET_BARS} bars.`;

/** The line beside TAP. An Arena set counts its bars against its length; free play has no length, so no bar count. */
export function performStatusLine(s: { bars: number | null; bar: number; score: number; combo: number; judgement: string }): string {
  const tally = `score ${s.score} · combo x${s.combo} · ${s.judgement}`;
  return s.bars === null ? tally : `bar ${s.bar}/${s.bars} · ${tally}`;
}

export type PerformJudgement = 'PERFECT' | 'GOOD' | 'EARLY';

/** One PERFORM set on the audio clock (seconds). StudioMode owns the engine and the screen; this owns the score. */
export class PerformSet {
  score = 0;
  combo = 0;
  /** Notes offered so far (at most PERFORM_SET_NOTES in an Arena set). */
  notes = 0;
  /** The set's length in bars: PERFORM_SET_BARS for an Arena set, null in free play (it runs until END SET). */
  readonly bars: number | null;
  private readonly maxNotes: number;
  private expected: { step: number; time: number }[] = [];
  private lastNoteAt = -Infinity;

  /** `arena`: the run was launched from an Arena duel, so this is the staked set with an end. */
  constructor(opts: { arena: boolean }) {
    this.bars = opts.arena ? PERFORM_SET_BARS : null;
    this.maxNotes = opts.arena ? PERFORM_SET_NOTES : Infinity;
  }

  /**
   * A sequencer step became audible at `time`, seen at `now`. It is a note while the set has notes left; past an Arena
   * set's length the music plays on and scores nothing. Returns how many notes expired unhit (each is a MISS: the combo
   * breaks).
   */
  note(step: number, time: number, now: number): { offered: boolean; missed: number } {
    let offered = false;
    if (this.notes < this.maxNotes) {
      this.expected.push({ step, time });
      this.notes++;
      this.lastNoteAt = time;
      offered = true;
    }
    const cutoff = now - PERFORM_EXPIRE_S;
    let missed = 0;
    while (this.expected.length && this.expected[0].time < cutoff) {
      this.expected.shift();
      missed++;
    }
    if (missed) this.combo = 0;
    return { offered, missed };
  }

  /** A tap at `now`: the nearest open note inside the window is hit; a tap with none is EARLY and breaks the combo. */
  tap(now: number): PerformJudgement {
    let best = -1, bestDt = PERFORM_EXPIRE_S;
    for (let i = 0; i < this.expected.length; i++) {
      const dt = Math.abs(now - this.expected[i].time);
      if (dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best < 0) { this.combo = 0; return 'EARLY'; }
    this.expected.splice(best, 1);
    const perfect = bestDt < PERFORM_PERFECT_S;
    this.score += performHitPoints(perfect, this.combo);
    this.combo++;
    return perfect ? 'PERFECT' : 'GOOD';
  }

  /**
   * The bar of the latest note offered (1-based; bar 1 before the first). It counted notes offered, so the last step of
   * a bar already read as the next one. An Arena set offers no note past its length, so it holds at its last bar.
   */
  get bar(): number { return Math.floor(Math.max(0, this.notes - 1) / PERFORM_STEPS_PER_BAR) + 1; }

  /** An Arena set whose every note has been offered and whose last note's window has closed is over. Free play never is. */
  over(now: number): boolean {
    return this.notes >= this.maxNotes && now - this.lastNoteAt > PERFORM_EXPIRE_S;
  }
}
