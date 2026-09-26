// SongClock — the Cypher's song time: the audio clock with the pauses taken out, and the tap that lands on it.
//
// MUSIC-SUITE P2 (2026-09-25, "on the beat, and honest"). The dance room judged, played and drew on the raw
// AudioContext.currentTime, and nothing in the room ever stopped that clock. P1 measured what that costs
// (BASELINE.md §2a): a 5 s pause left the song running (24.2 → 28.9 s), the resume expired every step that had
// passed as a MISS in one frame (DanceCore.update's expiry), and StemBand scheduled every 16th it had missed in the
// past, so they all played at once (0.735 s behind the clock). This file is the fix's arithmetic, pure so it is tested
// without a browser:
//
//   SongClock    songTime = audioTime − pausedTotal. pause() freezes it; resume() starts it again ONE BAR EARLY (the
//                count back in: the band replays the bar before the pause point with four clicks on it, the cue lane
//                rolls toward the line again) and the song reaches the pause point exactly one bar after the resume.
//                Song time only ever steps BACK at a resume, by the count back; everything else is the audio clock.
//   plan16ths    the 16th-note lookahead both schedulers (StemBand, KitPulse) share, on the song clock, mapped to audio
//                time — and never in the past: a 16th whose audio time is already behind the clock is passed over.
//   tapLatencySec  how far behind the song clock a tap arrives: the saved calibration (it already holds the output
//                delay), else the context's outputLatency.
//   danceTap     one physical press = one judged tap: an edge latch per trigger, the SPACE-down marker as the press
//                moment, and SPACE's made-up key-up A ignored.
//
// Only the dance room reads this today; the Academy's PERFORM stage (the other P2 lane) can share tapLatencySec.

import type { FelInput } from '../core/InputBus';
import { KEY_SPACE_DOWN } from '../core/StartWake';

// ── the clock ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export class SongClock {
  /** audio − song while running: every second the song was held (paused, or counted back in). */
  private offset = 0;
  /** The song time held while paused; null while running. */
  private frozen: number | null = null;
  /** The song time the last pause stopped at: the count back in ends there. */
  private backTo = -Infinity;
  /** The audio time the count back in ends (song time reaches backTo again). */
  private backUntil = -Infinity;

  get paused(): boolean { return this.frozen !== null; }
  /** Seconds of audio the song did not advance through (the pauses, plus each count back in). */
  get pausedTotal(): number { return this.offset; }

  /** Song time at audio time `audio`. Held while paused. */
  song(audio: number): number { return this.frozen ?? audio - this.offset; }
  /** The audio time song time `song` sounds at (the mapping the schedulers use; exact while running). */
  audio(song: number): number { return song + this.offset; }

  /**
   * Hold the song at `audio`. Returns false if it was already held. A pause DURING a count back in re-arms the same
   * count back in (the song holds at the old pause point, not partway through the replayed bar), so pausing twice in a
   * row never walks the song backwards.
   */
  pause(audio: number): boolean {
    if (this.frozen !== null) return false;
    this.frozen = this.countingBack(audio) ? this.backTo : this.song(audio);
    return true;
  }

  /**
   * Run the song again from audio time `audio`, `countBackSec` of song EARLY: at `audio` the song is at the pause point
   * minus the count back, and it reaches the pause point `countBackSec` later. 0 = carry straight on. Returns the audio
   * time the count back in ends (the song is at the pause point again), or null if the clock was not paused.
   */
  resume(audio: number, countBackSec = 0): number | null {
    if (this.frozen === null) return null;
    const at = this.frozen;
    const back = Number.isFinite(countBackSec) ? Math.max(0, countBackSec) : 0;
    this.frozen = null;
    this.offset = audio - (at - back);
    this.backTo = at;
    this.backUntil = audio + back;
    return this.backUntil;
  }

  /** The count back in is running at `audio`: the song is replaying the stretch before the pause point. */
  countingBack(audio: number): boolean { return this.frozen === null && audio < this.backUntil; }

  /** Song seconds until the pause point (0 when the count back in is over, or never ran). */
  countBackLeft(audio: number): number {
    return this.countingBack(audio) ? Math.max(0, this.backTo - this.song(audio)) : 0;
  }

  /**
   * Presses count at `audio`: the song is running and has come back to within `openBeforeSec` of the pause point.
   * The dance room opens them one judge window (MISS_AFTER) early, so a step that was pending when the game paused
   * can be hit on time as it rolls back up to the line, while the harness's resync (a held trigger re-sent the
   * instant the game resumes, a bar before) lands in the closed part.
   */
  accepting(audio: number, openBeforeSec = 0): boolean {
    if (this.frozen !== null) return false;
    return audio >= this.backUntil - Math.max(0, openBeforeSec);
  }
}

// ── the schedulers' grid ──────────────────────────────────────────────────────────────────────────────────────────────

/** A 16th this far behind the audio clock still plays (a hair late). Further back and it is passed over. KitPulse's
 *  original guard (KitPulse.ts, 2026-09-06) used the same 10 ms. */
export const PAST_SLACK_SEC = 0.01;

export interface GridPlan {
  /** The 16ths to schedule now: grid index and the AUDIO time each sounds at. */
  slots: { idx: number; at: number }[];
  /** The cursor after them. */
  next16: number;
  /** 16ths passed over because their audio time had already gone by. */
  skipped: number;
}

/**
 * A 16th-note lookahead scheduler's step: every grid slot from `next16` whose SONG time is inside the lookahead, mapped
 * to audio time by `toAudio`; one already behind `audioNow - slack` is passed over instead of being handed to
 * AudioNode.start (which plays a past time at once — a frame hitch or a returning tab used to stack every missed 16th
 * into one burst). Pure.
 */
export function plan16ths(o: {
  startedAt: number; next16: number; per16: number; songNow: number; lookahead: number;
  toAudio: (songSec: number) => number; audioNow: number; slack?: number;
}): GridPlan {
  const slack = o.slack ?? PAST_SLACK_SEC;
  const slots: { idx: number; at: number }[] = [];
  let next = Math.max(0, Math.floor(o.next16));
  let skipped = 0;
  if (!(o.per16 > 0) || !Number.isFinite(o.songNow)) return { slots, next16: next, skipped };
  for (;;) {
    const t = o.startedAt + next * o.per16;
    if (!(t < o.songNow + o.lookahead)) break;
    const at = o.toAudio(t);
    if (at < o.audioNow - slack) skipped++;
    else slots.push({ idx: next, at });
    next++;
  }
  return { slots, next16: next, skipped };
}

/** The first grid index at or after song time `songSec` (0 before the grid starts). Where a rewound scheduler resumes. */
export function gridIndexAt(startedAt: number, per16: number, songSec: number): number {
  if (!(per16 > 0)) return 0;
  return Math.max(0, Math.ceil((songSec - startedAt) / per16 - 1e-9));
}

// ── latency ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Past this an outputLatency reading is a broken measurement, not a slow speaker (a Bluetooth headset is ~0.2–0.3 s). */
export const MAX_OUTPUT_LATENCY_SEC = 0.5;

/**
 * Seconds to take off a tap's song time before it is judged (+ = the player hears, and so taps, late).
 * The saved calibration wins: /play/calibrate measures taps against the click on the audio clock, so its offset
 * already holds the speaker's delay AND the player's own habit. Without one, the context's outputLatency (the speaker
 * alone). Neither = 0. `savedMs` null = never calibrated (a saved 0 is a calibration that said 0).
 */
export function tapLatencySec(savedMs: number | null, outputLatency?: number): number {
  if (savedMs !== null && Number.isFinite(savedMs)) {
    return Math.max(-MAX_OUTPUT_LATENCY_SEC, Math.min(MAX_OUTPUT_LATENCY_SEC, savedMs / 1000));
  }
  if (typeof outputLatency === 'number' && Number.isFinite(outputLatency) && outputLatency > 0) {
    return Math.min(outputLatency, MAX_OUTPUT_LATENCY_SEC);
  }
  return 0;
}

// ── the tap ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A trigger at or past this is a pull; it must come back under TAP_RELEASE before the next pull counts. */
export const TAP_PRESS = 0.5;
export const TAP_RELEASE = 0.3;

/**
 * Where the R trigger stream stands: 'up' (a pull counts), 'pulled' (a pad pull is held; nothing counts until it comes
 * back under TAP_RELEASE) or 'space' (keyboard SPACE is down; its depth ramp is not a pull — only its key-up 0 frees it).
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): SPACE is two states. 'space' = down, and no depth above 0 has come yet; a 0 here
 * is NOT a release — InputBus sends depth = (now − spaceDownAt) / 1100 every frame (InputBus.ts:565-567), and the
 * first frame after the keydown can read the same coarsened performance.now() (assumption: 100 µs in Chrome, 1 ms in
 * Safari/Firefox), so its depth is exactly 0. That 0 freed the latch, and a Space held past ~0.55 s then crossed 0.5 as a
 * "pull": a wild MISS, −20, the combo gone. 'spaceDepth' = a depth above 0 has come, so the next 0 is the key-up (or a
 * blur's release). The key-up's own A (src 'space', danceTap) frees either.
 */
export type TriggerLatch = 'up' | 'pulled' | 'space' | 'spaceDepth';

/**
 * One R-trigger value in, whether it is a tap. P1 measured the stream this has to read (BASELINE.md §2a):
 *  - a pad re-sends its trigger every frame, and the room tapped on every event above 0.5: R2 held 1 s = 57 taps;
 *  - SPACE emits KEY_SPACE_DOWN (0.01) the instant it goes down, then a depth that climbs past 0.5 about 0.55 s in and
 *    is re-sent every frame (23 wild taps for a 1 s hold), then 0 on key-up (InputBus.ts:414-417, 564-567).
 * So: the SPACE marker is the press moment (it is only ever sent on a real key-down — the bus drops key repeat), a pad
 * pull is the crossing from under TAP_RELEASE to TAP_PRESS, and nothing taps again until the trigger is let go.
 */
export function triggerTap(state: TriggerLatch, value: number): { tap: boolean; state: TriggerLatch } {
  if (value === KEY_SPACE_DOWN) return { tap: true, state: 'space' };
  // (P2 FIX PASS) a 0 before any depth is the key's own first frame, not its release
  if (state === 'space') return { tap: false, state: value > 0 ? 'spaceDepth' : 'space' };
  if (state === 'spaceDepth') return { tap: false, state: value <= 0 ? 'up' : 'spaceDepth' };
  if (state === 'pulled') return { tap: false, state: value < TAP_RELEASE ? 'up' : 'pulled' };
  return value >= TAP_PRESS ? { tap: true, state: 'pulled' } : { tap: false, state: 'up' };
}

/**
 * Any input in, whether it is ONE judged tap, and the R-trigger latch after it. A/B presses tap; the A the bus makes
 * up when SPACE comes back UP (`src: 'space'`, InputBus.ts:417) does not — the Space press already tapped on the way
 * down, and judging the key-up put every Space tap 114–195 ms late (P1). The R trigger goes through triggerTap. The
 * latch must see every trigger event in every phase (a trigger held through the count-in must not tap on the song's
 * first frame), which is why this returns the new latch even when there is no tap.
 */
export function danceTap(latch: TriggerLatch, e: FelInput): { tap: boolean; latch: TriggerLatch } {
  if (e.t === 'trigger') {
    if (e.side !== 'R') return { tap: false, latch };
    const r = triggerTap(latch, e.value);
    return { tap: r.tap, latch: r.state };
  }
  if (e.t === 'button') {
    // SPACE's key-up A (InputBus emits it with R 0, only on release): not a tap, and it frees the SPACE latch (P2 FIX PASS)
    if (e.src === 'space') return { tap: false, latch: latch === 'space' || latch === 'spaceDepth' ? 'up' : latch };
    return { tap: e.pressed && (e.btn === 'A' || e.btn === 'B'), latch };
  }
  return { tap: false, latch };
}
