// beatBus — MUSIC-SUITE P8 (2026-09-25), "a stage that performs".
//
// PLAN phase 8, owner decision #8 ("front, audience view, moving on the beat") plus the phase's #2: "one pure bus
// (song clock -> beat/bar/phase events + streak/join/grade events) that lamps, the podium, an LED wall, the crowd
// and the camera subscribe to — bob on BPM, cheer on streaks/joins/an S grade; everything reads the SAME clock the
// judge uses (P2's SongClock), so a pause freezes the stage."
//
// WHY THIS IS PURE, AND WHY THAT IS THE WHOLE POINT. P2's SongClock (lib/babylon/audio/SongClock.ts) already learned
// this lesson the hard way: a rhythm room that keeps its OWN running total of elapsed beats (a `beatsSoFar += dt`
// accumulator) drifts the moment a frame is dropped, and freezes wrong the moment the game is paused — the accumulator
// keeps whatever it last held, then jumps when play resumes, instead of holding the SONG's own position. So `phase()`
// below takes the song time as an ARGUMENT and returns the beat/bar position at that instant, computed fresh every
// call. It holds no clock of its own. Callers already have the song clock (DanceMode's `clock.song(audioNow())`);
// handing that same number to every subscriber — the camera, the lamps, the podium, the LED wall, the crowd — is what
// makes a pause freeze all of them together and a count-back-in's rewind (the song time stepping backward, then
// forward again over the replayed bar) resync every one of them for free, with no special-case "on resume" code
// anywhere in this file.
//
// THE CHEER SIDE is not a function of song time alone — "a streak", "an instrument joining", "an S grade" are
// DISCRETE things a caller reports as they happen (DanceMode's onJudged / finish), not a position on the beat grid.
// Those still take a song-time stamp (never performance.now()), so a cheer's glow decays in SONG seconds and a pause
// freezes it exactly where it was, same as everything else here.
//
// THE PHOTOSENSITIVITY GUARD (PLAN phase 8 rule (c) — "no full-frame flash above 3 per second… a 'reduce flashing'
// setting that stops lamp/LED strobing"; memory: the juice-flash lesson, "the flash whited out the frame in 10
// modes"). `cheer()` is the one place a caller asks "may this actually flash the screen" and the answer is rate
// limited here, independent of (and in ADDITION to) JuiceKit's own global `motionPolicy().flash` gate (lib/a11y/
// reducedMotion.ts) that `ctx.juice.flash` already reads — a streak chain landing three joins and an S grade inside
// one second must not turn into four stacked whiteouts even with reduced motion off.

/** The beat/bar position at one instant. `beatIndex`/`barIndex` can be negative during a count-in's pre-roll — the
 *  grid runs the whole time, not just from beat 0. */
export interface BeatPhase {
  /** Whole beats since `startAt` (floor — can be negative before the downbeat). */
  beatIndex: number;
  /** 0..1, how far through the CURRENT beat `t` sits. 0 = right on the beat. */
  beatPhase: number;
  /** Whole bars since `startAt`. */
  barIndex: number;
  /** 0..1 through the current bar. */
  barPhase: number;
}

/** Pure: the beat/bar position at song time `t`, for a grid at `bpm` whose beat 0 sounds at `startAt` (song seconds).
 *  No internal state — call it with the same `t` twice (a paused song clock) and it answers the same thing both
 *  times; call it with `t` stepping backward (a count-back-in's rewind) and it answers correctly with no memory of
 *  the higher value it saw a moment ago. */
export function beatPhaseAt(t: number, bpm: number, startAt = 0, beatsPerBar = 4): BeatPhase {
  const bd = 60 / Math.max(1, bpm);
  const beats = (t - startAt) / bd;
  const beatIndex = Math.floor(beats);
  const beatPhase = beats - beatIndex;
  const bars = beats / Math.max(1, beatsPerBar);
  const barIndex = Math.floor(bars);
  const barPhase = bars - barIndex;
  return { beatIndex, beatPhase, barIndex, barPhase };
}

/** A beat-locked brightness/scale pulse: 1 right on the beat, decaying toward 0 before the next one. Pass it
 *  `phase(t).beatPhase` — never a wall-clock accumulator — and it is what the lamps, the podium and the LED-wall
 *  panel (DanceMode's `banner` prop, doubling for one — see MESHY-PROMPTS.md for the piece that should replace it)
 *  bob on. */
export function beatBob(beatPhase: number): number {
  const p = ((beatPhase % 1) + 1) % 1;
  return Math.exp(-p * 5);
}

// ── the photosensitivity guard ───────────────────────────────────────────────────────────────────────────────────

/** Pure: does one more flash at `t` fit under `maxPerSec` given the flashes already recorded in `history` (song-time
 *  stamps)? A sliding window, not a bucket — a milestone at 0.05s past the window's start still counts against it,
 *  which a fixed per-second bucket would miss at the boundary. Exported on its own so the rate limit is directly
 *  testable without going through `BeatBus`'s cheer bookkeeping. */
export function withinFlashBudget(history: readonly number[], t: number, maxPerSec = 3, windowSec = 1): boolean {
  let count = 0;
  for (const h of history) if (t - h >= 0 && t - h < windowSec) count++;
  return count < maxPerSec;
}

// MUSIC-SUITE P8 FIX (2026-09-29): 'resultGreat' added — the results screen's own GREAT punch (DanceMode.ts's
// resultBeat) used to call ctx.juice.flash directly, outside this bus's bookkeeping entirely, so it never counted
// against the SAME rate limit an S-grade's cheer (kind 'gradeS', fired moments later in the same finish() call) does
// — the exact "a streak milestone and a join landing in the same instant must not stack two whiteouts" case this
// class's own doc describes, just between two calls this file never saw one of.
export type CheerKind = 'join' | 'streak' | 'gradeS' | 'resultGreat';

export interface CheerResult {
  /** May the visuals actually flash the screen for this one? Gated on the rate limit AND `reduceFlashing`. */
  flash: boolean;
  /** The crowd/lamp glow right now (cheerPulse(t) again, handed back so a caller need not call it twice). */
  pulse: number;
}

/** Song-seconds a single cheer's glow takes to fade back to 0. Four of these is how far back `BeatBus` keeps a cheer
 *  around at all — past that it can no longer contribute to `cheerPulse` and is dropped. */
const CHEER_DECAY_SEC = 1.1;

export interface BeatBusConfig {
  bpm: number;
  /** Song time beat 0 sounds at. Defaults to 0 — set it for real via `retune()` once the count-in actually arms one
   *  (DanceMode only knows `startAt` partway through `update()`, same as the judge and the band). */
  startAt?: number;
  beatsPerBar?: number;
  /** The photosensitivity guard's cap (PLAN phase 8 rule (c)): 3. */
  maxFlashPerSec?: number;
  /** Read live, at the moment a cheer is recorded — the app's "reduce flashing" preference (DanceMode wires this to
   *  `!motionPolicy().flash`, the SAME global switch JuiceKit's own flash already honours; see the file header). */
  reduceFlashing?: () => boolean;
}

/**
 * The one bus every stage visual reads. Holds the tempo grid (bpm + startAt, changed on a track re-lock-in via
 * `retune`) and a short rolling log of cheer-worthy moments — nothing else. `phase()` and `cheerPulse()` are pure
 * reads; `cheer()` is the only method that mutates anything, and what it records is timestamped in SONG seconds, so
 * every reader downstream inherits "a pause freezes it" for free.
 */
export class BeatBus {
  private bpm: number;
  private startAt: number;
  private beatsPerBar: number;
  private readonly maxFlashPerSec: number;
  private readonly reduceFlashing: () => boolean;
  private flashHistory: number[] = [];
  private cheers: { at: number; strength: number }[] = [];

  constructor(cfg: BeatBusConfig) {
    this.bpm = cfg.bpm;
    this.startAt = cfg.startAt ?? 0;
    this.beatsPerBar = cfg.beatsPerBar ?? 4;
    this.maxFlashPerSec = cfg.maxFlashPerSec ?? 3;
    this.reduceFlashing = cfg.reduceFlashing ?? (() => false);
  }

  /** A track re-lock-in: the grid restarts at the new song's tempo and downbeat. Every pending cheer is dropped —
   *  one still glowing from the last song would bleed into the next one's count-in otherwise. */
  retune(bpm: number, startAt: number): void {
    this.bpm = bpm;
    this.startAt = startAt;
    this.flashHistory = [];
    this.cheers = [];
  }

  /** The beat/bar position at song time `t`. Pure — see the file header for why. */
  phase(t: number): BeatPhase {
    return beatPhaseAt(t, this.bpm, this.startAt, this.beatsPerBar);
  }

  /**
   * Record a cheer-worthy moment (a part joining the band, a streak milestone, an S grade) at song time `t`.
   * Returns whether the visuals may actually FLASH for it (rate-limited to `maxFlashPerSec`, and always false when
   * `reduceFlashing()` reads true) — independent of the crowd's glow, which every recorded cheer feeds regardless
   * (a cheer the screen was not allowed to flash for still warms the crowd; the guard is on the STROBE, not on
   * whether the moment happened).
   */
  cheer(kind: CheerKind, t: number, strength = 1): CheerResult {
    this.cheers.push({ at: t, strength });
    const floor = t - CHEER_DECAY_SEC * 4;
    this.cheers = this.cheers.filter((c) => c.at >= floor);

    let flash = false;
    if (!this.reduceFlashing() && withinFlashBudget(this.flashHistory, t, this.maxFlashPerSec)) {
      flash = true;
      this.flashHistory.push(t);
    }
    // trim: nothing outside the rolling window can ever count against a future check again
    this.flashHistory = this.flashHistory.filter((h) => t - h < 1);
    void kind;   // kept on the record for a future per-kind colour/strength table; not branched on today
    return { flash, pulse: this.cheerPulse(t) };
  }

  /** The crowd/lamp/LED-wall glow right now: every still-live cheer's own linear decay, summed (a join landing
   *  inside a streak's glow reads brighter than either alone, the way a real crowd's noise stacks) — purely a
   *  function of `t` minus each cheer's own stamp, so it freezes with the song and never drifts from a dropped
   *  frame or a resync. */
  cheerPulse(t: number): number {
    let sum = 0;
    for (const c of this.cheers) {
      const dt = t - c.at;
      if (dt < 0 || dt > CHEER_DECAY_SEC) continue;
      sum += c.strength * (1 - dt / CHEER_DECAY_SEC);
    }
    return sum;
  }

  dispose(): void {
    this.flashHistory = [];
    this.cheers = [];
  }
}
