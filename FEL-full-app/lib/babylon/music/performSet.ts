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
//
// MUSIC-SUITE P2 (2026-09-25), "On the beat, and honest". Measured in P1 (outbox musicsuite/BASELINE.md 2d) on the real
// engine: a note entered the judge only after it had SOUNDED (AudioEngine drainPlayhead releases a step once its time
// has passed, on a 25 ms timer: 0.4–24.3 ms late), so a tap dead on a lone note found nothing open and scored EARLY in
// 25 of 25 timer phases, and with music running an on-time tap took the PREVIOUS note as a late GOOD. A steady on-time
// player scored 24,850 of 68,000; a button masher beat him. One tap won a set (`won: score > 0`), and the card's "best
// combo" was the combo the set ended on. What changed:
//   * a note is offered when it is SCHEDULED (AudioEngine.onStepScheduled, up to 100 ms before it sounds), so a tap is
//     matched to the NEAREST open note by signed error: before it = EARLY, after it = LATE. A tap on the beat is PERFECT;
//   * the judge runs on the HEARD clock: `latencySec` (performLatencySec — the player's saved calibration, which already
//     holds the device's output delay, else the context's outputLatency/baseLatency) is taken off every tap and window;
//   * a tap that a note not yet scheduled could still be nearer to WAITS for the schedule (a note is scheduled only
//     100 ms ahead, the window reaches 250 ms early), then takes the nearest; with none in reach it is an EXTRA tap (it
//     used to be called EARLY whatever its timing): no points, and the combo breaks, as before;
//   * the set keeps real tallies — PERFECT / GOOD / MISS, EXTRA taps, the best combo — and result() hands the room the
//     shared session contract { bars, notes, hits, perfects, goods, misses, accuracy, grade, maxCombo, arena }. A set is
//     WON only at accuracy ≥ 0.5 over ≥ 8 bars (owner decision #13; performSetWon, which the server mirrors);
//   * every scheduled step still counts toward the set's length, but a step is a note only while the grid has an
//     audible hit (performNoteAt): an empty grid offers zero notes. Notes only where the beat hits is phase 6.
// The points per hit, the windows and the Arena ceiling are unchanged (lib/arena-score-integrity.ts still reads
// performSetMax: an Arena set is still 32 bars of 16 steps, and a perfect one scores exactly the same).
//
// MUSIC-SUITE P2 FIX PASS (2026-09-25): THE WIN WAS MEASURING HOW OFTEN YOU TAP, NOT WHEN. The phase review drove this
// class through performSet.test.ts's drive() (8 bars, notes offered 100 ms ahead) and found decision #13 letting the
// wrong players win:
//   * with a note on EVERY scheduled 16th (performNoteAt was `gridLive`), a player tapping every beat dead on scored
//     25 % (grade D) at 60, 92, 120 and 160 BPM and could never win, while a masher at 4 taps/s scored 65.6 % (C, won),
//     at 6/s 96.5 % (S), at 20–30/s 50.4 % (C) — a held Enter on the focused TAP button was enough (see
//     isRepeatedActivation below);
//   * EXTRA taps cost nothing in the accuracy, so with sparser notes the earliest tap of a mash inside a note's 250 ms
//     early reach took it as a GOOD (half credit) and every other tap was free: an all-GOOD set is exactly C;
//   * every scheduled step counted toward the 8 bars, rests included, so PLAY on the empty grid, 8 silent bars, one
//     cell on and one on-time tap was {bars 8, notes 1, accuracy 1, grade S, won} — P1's "one tap wins" again — and the
//     server's readMusicSet agreed.
// Now: a step is a note only where the beat HITS (performNoteAt: `hits > 0`, decision #11's "notes only where your beat
// hits", one lane until phase 6 splits it into kick/snare/hats/Flip); an EXTRA tap is a MISS in the accuracy, exactly as
// a wild tap is in the Cypher (DanceCore registerMiss counts it in MISS and accuracyOf divides by it), so the shared
// contract's `accuracy = (perfects + 0.5 × goods) / notes` holds with `notes` = every judged event; and `bars` (the
// win's 8) counts only whole bars heard that offered at least one note — a rest bar is music, not a bar played.

/** Sequencer steps in a bar (StudioMode's STEPS: 16ths). */
export const PERFORM_STEPS_PER_BAR = 16;
/** How long an Arena set lasts, in bars. TUNE(elijah): 32 bars is 83 s at the default 92 BPM, 48 s at 160, 128 s at 60. */
export const PERFORM_SET_BARS = 32;
/** An Arena set's length in steps — and so the most notes it can offer (MUSIC-SUITE P2 FIX PASS: a step is a note only where the beat hits). */
export const PERFORM_SET_NOTES = PERFORM_SET_BARS * PERFORM_STEPS_PER_BAR;
/** A note not hit this long after it sounds is a miss (and breaks the combo). MUSIC-SUITE P2: the window is two-sided —
 *  a tap up to this long BEFORE a known note takes it too (a note is known from the moment it is scheduled). */
export const PERFORM_EXPIRE_S = 0.25;
/** A hit closer than this to its note, either side, is PERFECT; anything else inside the window is GOOD. */
export const PERFORM_PERFECT_S = 0.08;
export const PERFORM_PERFECT_PTS = 100;
export const PERFORM_GOOD_PTS = 50;
/** The multiplier steps up by one every this many hits in a row. */
export const PERFORM_COMBO_STEP = 5;
/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): a hit this soon after an EXTRA tap is capped at GOOD — the Cypher's spam lock
 * (DanceCore SPAM_LOCK_SEC, "the grade is for timing, and spam has no timing"), the same 0.25 s. Measured on the real
 * class (drive(), 8 bars, the best of six phases): with the EXTRA taps already counted as misses, a 4 taps/s masher on
 * a kick-and-snare quarter grid at 160 BPM still scored 51 % (C, won) because the first tap of each burst took its note
 * as a PERFECT often enough; with the lock it scores under 50 %.
 */
export const PERFORM_SPAM_LOCK_S = 0.25;

/** What one hit pays, given the combo it was hit on (the hits in a row before it). */
export function performHitPoints(perfect: boolean, comboBefore: number): number {
  return (perfect ? PERFORM_PERFECT_PTS : PERFORM_GOOD_PTS) * (1 + Math.floor(comboBefore / PERFORM_COMBO_STEP));
}

/**
 * The most an Arena set can score: every note of it hit PERFECT in one unbroken combo — Σ performHitPoints(true, i) over
 * i < notes. MUSIC-SUITE P2 FIX PASS (2026-09-25): in closed form (it was that loop), because the server now bounds any
 * music set's score by the hits it claims (lib/session-payout.ts), and a forged `hits` of 10^12 must not spin a loop.
 * With q = ⌊n / COMBO_STEP⌋ and r = n mod COMBO_STEP, Σ ⌊i / step⌋ = step · q(q − 1)/2 + r · q. The test holds it to
 * the loop.
 */
export function performSetMax(notes: number = PERFORM_SET_NOTES): number {
  const n = Math.max(0, Math.floor(Number.isFinite(notes) ? notes : 0));
  const q = Math.floor(n / PERFORM_COMBO_STEP), r = n % PERFORM_COMBO_STEP;
  return PERFORM_PERFECT_PTS * (n + PERFORM_COMBO_STEP * (q * (q - 1)) / 2 + r * q);
}

/** What an Arena set tells the player before and while it plays. Free play shows nothing of the kind. */
export const ARENA_SET_NOTE = `Arena set: it ends on its own after ${PERFORM_SET_BARS} bars.`;

/** The line beside TAP. An Arena set counts its bars against its length; free play has no length, so no bar count. */
export function performStatusLine(s: { bars: number | null; bar: number; score: number; combo: number; judgement: string }): string {
  const tally = `score ${s.score} · combo x${s.combo} · ${s.judgement}`;
  return s.bars === null ? tally : `bar ${s.bar}/${s.bars} · ${tally}`;
}

/** Two times closer than this are the same time (float rounding between the grid and a tap's arithmetic). */
const TIE_S = 1e-9;

/** What one tap was: a hit on a note (PERFECT / GOOD), or an EXTRA tap with no note in reach. */
export type PerformJudgement = 'PERFECT' | 'GOOD' | 'EXTRA';
/** tap()'s answer: its judgement, or WAIT — no note in reach YET, so it waits for the next note to be scheduled. */
export type PerformTapOutcome = PerformJudgement | 'WAIT';
/** Which side of its note a hit landed: before it (EARLY), after it (LATE), or dead on (null). */
export type PerformSide = 'EARLY' | 'LATE' | null;
/** One tap's verdict: the judgement, the signed error against the note's heard time (null for an EXTRA tap) and its side. */
export interface PerformTap { judgement: PerformJudgement; errorSec: number | null; side: PerformSide }

/** The word(s) beside TAP for a tap: PERFECT, GOOD · EARLY 112ms / GOOD · LATE 96ms, or EXTRA TAP. */
export function performTapLabel(tap: PerformTap | null): string {
  if (!tap) return '';
  if (tap.judgement === 'EXTRA') return 'EXTRA TAP';
  if (tap.judgement === 'PERFECT' || tap.side === null || tap.errorSec === null) return tap.judgement;
  return `GOOD · ${tap.side} ${Math.round(Math.abs(tap.errorSec) * 1000)}ms`;
}

// ── the win, shared with the server (MUSIC-SUITE P2; owner decision #13: "grade C or better (≥ 50 % accuracy) over at
// least 8 bars") ──────────────────────────────────────────────────────────────────────────────────────────────────
/** A set is won at this accuracy or better (grade C)… */
export const PERFORM_WIN_MIN_ACCURACY = 0.5;
/** …over at least this many bars. */
export const PERFORM_WIN_MIN_BARS = 8;

export type PerformGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Accuracy over the judged notes: a PERFECT is worth 1, a GOOD 0.5, a MISS 0. No notes = 0. */
export function performAccuracy(perfects: number, goods: number, notes: number): number {
  const p = Math.max(0, perfects || 0), g = Math.max(0, goods || 0), n = Math.max(0, notes || 0);
  return n > 0 ? Math.min(1, (p + 0.5 * g) / n) : 0;
}

/** The letter for an accuracy — the dance room's scale (danceTracks.gradeFor), so C means the same 50 % in both rooms. */
export function performGrade(accuracy: number): PerformGrade {
  if (!(accuracy >= 0.5)) return 'D';
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  return 'C';
}

/** THE rule for a music set's W: accuracy ≥ 0.5 AND bars ≥ 8. The server mirrors this; anything not a number loses. */
export function performSetWon(r: { accuracy: number; bars: number }): boolean {
  return Number.isFinite(r.accuracy) && Number.isFinite(r.bars)
    && r.accuracy >= PERFORM_WIN_MIN_ACCURACY && r.bars >= PERFORM_WIN_MIN_BARS;
}

/** The music room's session result (the shared contract), plus the EXTRA taps. */
export interface PerformResult {
  score: number;
  won: boolean;
  /**
   * Whole bars the player heard that offered at least one note (at most PERFORM_SET_BARS in an Arena set). MUSIC-SUITE
   * P2 FIX PASS: a rest bar (an empty or muted grid) is not counted — it was, and 7.9 silent bars plus one tapped note
   * won an S. The Arena set's own LENGTH is still counted in steps, rests included (over(), `bar`).
   */
  bars: number;
  /**
   * Judged events: perfects + goods + misses (= hits + misses). A note scheduled but not yet heard when the set ended is
   * not one. MUSIC-SUITE P2 FIX PASS: an EXTRA tap is one (a miss), as a wild tap is in the Cypher.
   */
  notes: number;
  hits: number;
  perfects: number;
  goods: number;
  /**
   * Notes heard and never hit (every expired one, plus any still open when the set ended) PLUS the EXTRA taps — each is
   * a judged error, and the accuracy divides by it (MUSIC-SUITE P2 FIX PASS: extras used to be free, so a mash's spare
   * taps never cost anything).
   */
  misses: number;
  /** 0..1 = (perfects + 0.5 × goods) / notes. */
  accuracy: number;
  grade: PerformGrade;
  maxCombo: number;
  arena: boolean;
  /** Taps with no note in reach — a part of `misses` (so of `notes` too), kept apart for the card. They break the combo. */
  extras: number;
}

/** The result as GameResult.stats — the contract's keys (and the EXTRA taps), for the card and the session post. */
export function performResultStats(r: PerformResult): Record<string, number | string | boolean> {
  return {
    bars: r.bars, notes: r.notes, hits: r.hits, perfects: r.perfects, goods: r.goods, misses: r.misses,
    accuracy: r.accuracy, grade: r.grade, maxCombo: r.maxCombo, arena: r.arena, extras: r.extras,
  };
}

// ── latency: the judge listens where the player listens ──────────────────────────────────────────────────────────
/** The longest device output delay the fallback will believe (a Bluetooth headset runs ~0.2–0.3 s). Assumption. */
export const PERFORM_MAX_OUTPUT_LATENCY_S = 0.5;

/**
 * How long after its audio-clock time the player HEARS (and so taps) a note. The saved calibration
 * (lib/feel/rhythm-calibrate.ts loadAudioOffsetMs, `savedOffsetMs`, null when never saved) wins: it was measured as tap
 * minus the click's audio-clock time on this device, so it already holds the output delay — outputLatency is NOT added
 * on top. With no calibration, the context's outputLatency, else its baseLatency, else 0.
 */
export function performLatencySec(src: { savedOffsetMs: number | null; outputLatency?: number | null; baseLatency?: number | null }): number {
  if (src.savedOffsetMs !== null && Number.isFinite(src.savedOffsetMs)) return src.savedOffsetMs / 1000;
  for (const v of [src.outputLatency, src.baseLatency]) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.min(v, PERFORM_MAX_OUTPUT_LATENCY_S);
  }
  return 0;
}

// ── input ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The keyboard's TAP in PERFORM: Space and J (not one of the Flip's pad keys, Flip.ts PAD_KEYS). */
export const PERFORM_TAP_KEYS = [' ', 'j'] as const;

/** Is this key press a PERFORM tap? Space or J with no modifier (Cmd+J and friends belong to the browser). */
export function isPerformTapKey(e: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key === ' ' || e.code === 'Space' || e.key.toLowerCase() === 'j';
}

/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): is this keydown an OS key REPEAT of a key that activates a focused button (Enter,
 * Space)? The TAP button taps on a detail-0 click (Enter on the focused button, or a script's element.click()), and a
 * mouse click on TAP focuses it — so a held Enter fired a click, and so a tap, on every key repeat. Checked in the
 * probes' headless Chromium with StudioMode's two handlers: one mouse click = 1 tap, then Enter down + 20 repeats + up =
 * 21 more; at 20–30 repeats a second that alone scored 50.4 %, grade C, won. The TAP button's onKeyDown cancels these
 * (preventDefault stops the synthetic click); the first press of a key is never a repeat, so Enter still taps once.
 */
export function isRepeatedActivation(e: { key: string; code?: string; repeat?: boolean }): boolean {
  return !!e.repeat && (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter');
}

/**
 * Is this scheduled step a note? MUSIC-SUITE P2 FIX PASS (2026-09-25): only where the beat HITS — a step on which at
 * least one audible track starts a sound (owner decision #11, "notes only where your beat hits"). It was every step
 * while the grid had any hit (`gridLive`), so accuracy measured tap RATE: an on-beat quarter-note player scored 25 %
 * and a masher won (the header). One TAP lane for now: a step where any track hits is a note; phase 6 splits the notes
 * into lanes (kick / snare / hats / Flip). `gridLive` is kept on the engine's StepSound for the probes.
 */
export function performNoteAt(sound: { hits: number; gridLive: boolean }): boolean {
  return sound.hits > 0;
}

/** One PERFORM set on the audio clock (seconds). StudioMode owns the engine and the screen; this owns the score. */
export class PerformSet {
  score = 0;
  combo = 0;
  /** The longest run of hits in the set. (The card used to call the combo the set ENDED on "best".) */
  maxCombo = 0;
  /** Notes offered so far (at most PERFORM_SET_NOTES in an Arena set). */
  notes = 0;
  perfects = 0;
  goods = 0;
  /** Notes whose window closed unhit so far. */
  misses = 0;
  /** Taps with no note in reach (MUSIC-SUITE P2 FIX PASS: each is a miss in result(), as a wild tap is in the Cypher). */
  extras = 0;
  /**
   * Seconds from a note's audio-clock time to when the player hears it (performLatencySec). Every tap and window is
   * judged on the heard clock, `now - latencySec`. 0 = the audio clock itself (the tests and the server's sims).
   */
  latencySec = 0;
  /** The last tap's verdict, for the line beside TAP. */
  lastTap: PerformTap | null = null;
  /** MUSIC-SUITE P2 FIX PASS: the heard time of the latest EXTRA tap (a hit inside PERFORM_SPAM_LOCK_S after it is a GOOD). */
  private lastExtraAt = -Infinity;
  /** The set's length in bars: PERFORM_SET_BARS for an Arena set, null in free play (it runs until END SET). */
  readonly bars: number | null;
  readonly arena: boolean;
  private readonly maxSteps: number;
  /** Scheduled steps inside the set, notes and rests alike: the set's length is counted in steps, not notes. */
  private steps = 0;
  /**
   * MUSIC-SUITE P2 FIX PASS: notes offered in each bar of the set (index = the set's own bar, 16 of its steps from its
   * first). result() counts a whole bar toward the win's 8 only when it offered a note: rests fill a length, not a set.
   */
  private barNotes: number[] = [];
  /** Open notes: offered, not yet hit, window not yet closed. (Name kept: scripts/music/baseline-sim.ts reads it.) */
  private expected: { step: number; time: number }[] = [];
  private lastStepAt = -Infinity;
  /** Times of in-set steps the player has not heard yet (scheduled ahead) — they are not bars played. */
  private unheard: number[] = [];
  /**
   * Taps waiting for the schedule to catch up (see tap()): `at` on the heard clock, and the nearest note that was
   * known when it landed (`cand`, null when none was in reach). A note scheduled later may still be nearer.
   */
  private waiting: { at: number; cand: { step: number; time: number } | null }[] = [];
  /** The last two gaps between scheduled steps (positive only): the next step sounds at least the smaller one later. */
  private gaps: number[] = [];

  /** `arena`: the run was launched from an Arena duel, so this is the staked set with an end. */
  constructor(opts: { arena: boolean }) {
    this.arena = opts.arena;
    this.bars = opts.arena ? PERFORM_SET_BARS : null;
    this.maxSteps = opts.arena ? PERFORM_SET_NOTES : Infinity;
  }

  private heard(now: number): number { return now - this.latencySec; }

  /**
   * A sequencer step that is a note was SCHEDULED to sound at `time`, seen at `now` (both on the audio clock). It is a
   * note while the set has steps left; past an Arena set's length the music plays on and scores nothing. Returns
   * whether it was offered and how many notes expired unhit (each is a MISS: the combo breaks).
   */
  note(step: number, time: number, now: number): { offered: boolean; missed: number } {
    return this.offer(step, time, now, true);
  }

  /** A scheduled step that is not a note (performNoteAt said no): it counts toward the set's length, and scores nothing. */
  rest(step: number, time: number, now: number): { offered: boolean; missed: number } {
    return this.offer(step, time, now, false);
  }

  private offer(step: number, time: number, now: number, isNote: boolean): { offered: boolean; missed: number } {
    let offered = false;
    if (this.steps < this.maxSteps) {
      this.steps++;
      const gap = time - this.lastStepAt;
      this.gaps = Number.isFinite(gap) && gap > 0 ? [...this.gaps, gap].slice(-2) : [];   // a restart resets it
      this.lastStepAt = time;
      this.unheard.push(time);
      if (isNote) {
        this.expected.push({ step, time });
        this.notes++;
        const bar = Math.floor((this.steps - 1) / PERFORM_STEPS_PER_BAR);
        this.barNotes[bar] = (this.barNotes[bar] ?? 0) + 1;
        offered = true;
      }
      this.settleWaiting(time, offered);
    }
    return { offered, missed: this.expire(now) };
  }

  /**
   * The earliest a step not yet scheduled can sound: the last step scheduled plus the smaller of the last two gaps
   * (swing alternates long and short gaps; a tempo change is assumed not to halve a 16th between two steps). With no
   * gap seen yet, the last step itself — the cautious answer.
   */
  private nextStepNoEarlier(): number {
    return this.lastStepAt + (this.gaps.length === 2 ? Math.min(this.gaps[0], this.gaps[1]) : 0);
  }

  /**
   * A step was just scheduled at `time`. A waiting tap adopts it if it is a note NEARER than the tap's known candidate
   * (inside the window; a tie keeps the older note, as a tap decided at once does — TIE_S absorbs float rounding). Once
   * no step still to come can be nearer (nextStepNoEarlier), the tap takes its candidate, or is EXTRA.
   */
  private settleWaiting(time: number, isNote: boolean): void {
    if (!this.waiting.length) return;
    const pushed = isNote ? this.expected[this.expected.length - 1] : null;
    const keep: typeof this.waiting = [];
    for (const w of this.waiting) {
      let cand = w.cand && this.expected.includes(w.cand) ? w.cand : null;   // another tap may have taken it
      if (pushed && this.expected.includes(pushed)) {
        const dn = Math.abs(time - w.at);
        if (dn < PERFORM_EXPIRE_S && (!cand || dn < Math.abs(w.at - cand.time) - TIE_S)) cand = pushed;
      }
      const reach = cand ? Math.abs(w.at - cand.time) : PERFORM_EXPIRE_S;
      if (this.nextStepNoEarlier() - w.at >= reach - TIE_S) {
        if (cand) this.hit(this.expected.indexOf(cand), w.at); else this.extra(w.at);
      } else {
        keep.push({ at: w.at, cand });
      }
    }
    this.waiting = keep;
  }

  /** Decide every waiting tap now, on what is known: its candidate, or EXTRA. */
  private settleAll(): void {
    for (const w of this.waiting) {
      const i = w.cand ? this.expected.indexOf(w.cand) : -1;
      if (i >= 0) this.hit(i, w.at); else this.extra(w.at);
    }
    this.waiting = [];
  }

  /** Close every note whose window has passed on the heard clock. Returns how many (each a MISS; the combo breaks). */
  expire(now: number): number {
    const heard = this.heard(now);
    const cutoff = heard - PERFORM_EXPIRE_S;
    // a waiting tap is decided before its candidate's window closes under it, or once its own window has passed
    if (this.waiting.some((w) => w.at < cutoff || (w.cand !== null && w.cand.time < cutoff))) {
      const keep: typeof this.waiting = [];
      for (const w of this.waiting) {
        const i = w.cand ? this.expected.indexOf(w.cand) : -1;
        if (i >= 0 && this.expected[i].time < cutoff) this.hit(i, w.at);
        else if (w.at < cutoff) { if (i >= 0) this.hit(i, w.at); else this.extra(w.at); }
        else keep.push(w);
      }
      this.waiting = keep;
    }
    let missed = 0;
    if (this.expected.some((n) => n.time < cutoff)) {
      this.expected = this.expected.filter((n) => (n.time < cutoff ? (missed++, false) : true));
    }
    if (missed) { this.combo = 0; this.misses += missed; }
    if (this.unheard.some((t) => t <= heard)) this.unheard = this.unheard.filter((t) => t > heard);
    return missed;
  }

  /**
   * A tap at `now` (audio clock). The NEAREST open note inside the window, early or late, is hit — so a tap just before
   * a note takes that note, never the one before it.
   *
   * A note is known only once it is scheduled, up to 100 ms before it sounds, but the window reaches 250 ms early. So a
   * tap is decided at once only when no note still to be scheduled could be nearer than the best known one — every
   * such note sounds at nextStepNoEarlier() or later, so that is `tap + distance <= nextStepNoEarlier()`. Otherwise it WAITS
   * (returns 'WAIT'; its verdict lands in `lastTap` when it settles): a note scheduled nearer takes it (EARLY), and once
   * the schedule is past its reach it takes its known note, or is an EXTRA tap (the combo breaks). Measured in the P2
   * browser run at 60 BPM (16ths 250 ms apart) before this: a tap 107 ms before a note that was not scheduled yet took
   * the note 143 ms BEHIND it ("GOOD · LATE 143ms"), or, when that one was already hit, read EXTRA. Past an Arena set's
   * last step no note can come, so nothing waits.
   */
  tap(now: number): PerformTapOutcome {
    this.expire(now);
    const heard = this.heard(now);
    let best = -1, bestAbs = PERFORM_EXPIRE_S;
    for (let i = 0; i < this.expected.length; i++) {
      const a = Math.abs(heard - this.expected[i].time);
      if (a < bestAbs) { bestAbs = a; best = i; }
    }
    const scheduleDone = this.steps >= this.maxSteps;             // an Arena set past its last step: nothing more comes
    if (scheduleDone || heard + bestAbs <= this.nextStepNoEarlier() + TIE_S) return best >= 0 ? this.hit(best, heard) : this.extra(heard);
    this.waiting.push({ at: heard, cand: best >= 0 ? this.expected[best] : null });
    return 'WAIT';
  }

  /** Tap `heard` (heard clock) takes open note `i`. */
  private hit(i: number, heard: number): PerformJudgement {
    const err = heard - this.expected[i].time;      // < 0: before the note (EARLY); > 0: after it (LATE)
    this.expected.splice(i, 1);
    const sinceExtra = heard - this.lastExtraAt;
    const perfect = Math.abs(err) < PERFORM_PERFECT_S && !(sinceExtra >= 0 && sinceExtra <= PERFORM_SPAM_LOCK_S);
    this.score += performHitPoints(perfect, this.combo);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (perfect) this.perfects++; else this.goods++;
    const judgement: PerformJudgement = perfect ? 'PERFECT' : 'GOOD';
    this.lastTap = { judgement, errorSec: err, side: err < 0 ? 'EARLY' : err > 0 ? 'LATE' : null };
    return judgement;
  }

  /** A tap (heard at `at`) that met no note: no points, the combo breaks, and it is a miss in result(). */
  private extra(at: number): 'EXTRA' {
    this.combo = 0;
    this.extras++;
    if (at > this.lastExtraAt) this.lastExtraAt = at;
    this.lastTap = { judgement: 'EXTRA', errorSec: null, side: null };
    return 'EXTRA';
  }

  /**
   * The bar of the latest step scheduled (1-based; bar 1 before the first). It counts steps, so the last step of a bar
   * reads as that bar and an empty grid's bars still count. An Arena set holds at its last bar.
   */
  get bar(): number { return Math.floor(Math.max(0, this.steps - 1) / PERFORM_STEPS_PER_BAR) + 1; }

  /** An Arena set whose every step has been scheduled and whose last window has closed is over. Free play never is. */
  over(now: number): boolean {
    return this.steps >= this.maxSteps && this.heard(now) - this.lastStepAt > PERFORM_EXPIRE_S;
  }

  /**
   * The set as it stands at `now` — what END SET (or the set's own end) reports. Notes heard but never hit count as
   * misses; notes scheduled but not yet heard are not counted at all. MUSIC-SUITE P2 FIX PASS: bars are whole bars heard
   * that offered a note (a rest bar is not a bar played), and every EXTRA tap is a miss too.
   */
  result(now: number): PerformResult {
    this.settleAll();                                   // the set is over: a waiting tap is decided on what is known
    const heard = this.heard(now);
    const heardSteps = this.steps - this.unheard.filter((t) => t > heard).length;
    const wholeBars = Math.floor(Math.max(0, heardSteps) / PERFORM_STEPS_PER_BAR);
    let bars = 0;
    for (let b = 0; b < wholeBars; b++) if ((this.barNotes[b] ?? 0) > 0) bars++;
    const misses = this.misses + this.expected.filter((n) => n.time <= heard).length + this.extras;
    const notes = this.perfects + this.goods + misses;
    const accuracy = performAccuracy(this.perfects, this.goods, notes);
    return {
      score: this.score,
      won: performSetWon({ accuracy, bars }),
      bars, notes, hits: this.perfects + this.goods, perfects: this.perfects, goods: this.goods, misses,
      accuracy, grade: performGrade(accuracy), maxCombo: this.maxCombo, arena: this.arena, extras: this.extras,
    };
  }
}
