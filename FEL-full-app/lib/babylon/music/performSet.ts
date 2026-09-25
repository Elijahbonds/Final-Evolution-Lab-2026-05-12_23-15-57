// lib/babylon/music/performSet.ts — the Groove Academy's PERFORM set: its notes, its judge and its length. PURE (no
// audio, no React), so the Arena's score check on the server reads the same rules the room plays by.
//
// HOTFIX (2026-09-24): a PERFORM set had no end — it ran until the player pressed END SET — and each hit pays
// 100 × (1 + floor(combo / 5)), which grows with the square of an unbroken run. No score was too big to be honest, so the
// Arena could not bound a staked set (its old limit, 500,000, fell to about 72 s of perfect play). A set is now
// PERFORM_SET_BARS bars of the sequencer: every step of those bars is one note, and after the last note's window closes
// the set ends on its own. The judge is the one StudioMode used, moved here unchanged.

/** Sequencer steps in a bar (StudioMode's STEPS: 16ths). */
export const PERFORM_STEPS_PER_BAR = 16;
/** How long a set lasts, in bars. TUNE(elijah): 32 bars is 83 s at the default 92 BPM, 48 s at 160, 128 s at 60. */
export const PERFORM_SET_BARS = 32;
/** Every step of the set is a note to hit. */
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

/** The most a set can score: every note of it hit PERFECT in one unbroken combo. */
export function performSetMax(notes: number = PERFORM_SET_NOTES): number {
  let total = 0;
  for (let i = 0; i < notes; i++) total += performHitPoints(true, i);
  return total;
}

export type PerformJudgement = 'PERFECT' | 'GOOD' | 'EARLY';

/** One PERFORM set on the audio clock (seconds). StudioMode owns the engine and the screen; this owns the score. */
export class PerformSet {
  score = 0;
  combo = 0;
  /** Notes offered so far (at most PERFORM_SET_NOTES). */
  notes = 0;
  private expected: { step: number; time: number }[] = [];
  private lastNoteAt = -Infinity;

  /**
   * A sequencer step became audible at `time`, seen at `now`. It is a note while the set has notes left; past the set's
   * length the music plays on and scores nothing. Returns how many notes expired unhit (each is a MISS: the combo breaks).
   */
  note(step: number, time: number, now: number): { offered: boolean; missed: number } {
    let offered = false;
    if (this.notes < PERFORM_SET_NOTES) {
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

  /** The bar the set is in (1-based, held at the last bar once every note has been offered). */
  get bar(): number { return Math.min(PERFORM_SET_BARS, Math.floor(this.notes / PERFORM_STEPS_PER_BAR) + 1); }

  /** Every note has been offered and the last one's window has closed: the set is over. */
  over(now: number): boolean {
    return this.notes >= PERFORM_SET_NOTES && now - this.lastNoteAt > PERFORM_EXPIRE_S;
  }
}
