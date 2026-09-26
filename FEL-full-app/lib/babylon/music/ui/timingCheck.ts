// lib/babylon/music/ui/timingCheck.ts — "CHECK MY TIMING": the 8-tap calibration check in the Academy's transport, pure.
// StudioMode runs it on the engine's count-in (AudioEngine.countIn, PHASE-4 ENGINE CONTRACT (3)); this file decides
// which taps count, reads them and says the result.
//
// MUSIC-SUITE P4 (2026-09-25). What was open: PLAN phase 2 promised "an 8-tap check in the count-in", and P2 moved it
// here because the Academy had no count-in (P2 REPORT "Not done": "It needs a 2-bar count-in in both rooms"). The only
// way to set the offset PERFORM judges by (performLatencySec: the saved calibration, else outputLatency) was the 16-tap
// /play/calibrate screen in another tab.
//
// The check: 2 bars of count-in clicks = 8 clicks; the player taps on each (Space / J / Enter or the TAP button); the
// taps are read against the clicks' scheduled audio times and the offset saved, DATED, where every rhythm room reads it
// (rhythm-calibrate saveAudioOffsetMs → loadRoomCalibration), and the room says "your offset +75 ms".
//   * THE TEMPO IS THE CALIBRATION SCREEN'S, 80 BPM (rhythm-calibrate CALIBRATION.BPM), whatever the song's. A tap is read
//     in a one-beat window [−200 ms, beat − 200 ms) around its click (P2's rule: EARLIEST_MS), so the beat must be wider
//     than the delay being measured — at 160 BPM (375 ms) a Bluetooth player 300 ms late would read 75 ms EARLY. At 80
//     BPM the window is [−200, +550) ms, the one the calibrate screen uses.
//   * WHICH CLICK A TAP IS FOR: the taps' phases on the click grid are averaged on the circle (rhythm-calibrate
//     readCalibrationTaps), which says where the player's taps sit; each tap is then paired with the click that places it
//     there, and the offset is rhythm-calibrate computeOffsetMs(clicks, taps) — the mean of (tap − its click), snapped to
//     25 ms, clamped to ±400. So a player who comes in on the 2nd click, or taps 300 ms late, is still read right; nearest-
//     click pairing (the pre-P2 screen's bug) would have called 300 ms late "−200 ms early" at 100 BPM.
//   * NOTHING UNTRUSTWORTHY IS SAVED. Fewer than 8 taps in the window, or taps that disagree (steadiness < STEADY_MIN, the
//     calibrate screen's bar), say so and keep the old reading.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25):
//   * A LEAD-IN BAR. The check counted in exactly 2 bars and needed a tap on all 8 clicks, the first of which sounded 50 ms
//     after the press (AudioEngine START_LEAD_S) — so tap 1 was a REACTION, not a beat. Computed with this reader (8 clicks
//     at 80 BPM, clicks 2–8 tapped perfectly): a first tap +150…+250 ms late saved +25 ms (a 0 ms player stored 25 ms late);
//     +300…+400 ms read "uneven" and saved nothing; skipping it said "7 of 8 taps". On a phone the TAP button only appears
//     after the press re-renders, in a new panel, so the check failed nearly every time. Now the engine counts in
//     CHECK_LEAD_BARS + CHECK_BARS bars (12 clicks) and only the LAST 8 are read (checkClicks): the first bar is a lead-in
//     to hear the tempo and reach the TAP button, and a tap in it is outside the window (acceptsTap) — never counted.
//   * THE CLICKS AS HEARD. The clicks now cross the desk's limiter like the music (mixGraph: 6 ms, 12 ms with MASTER), so
//     the room reads the taps against heardClicks(clicks, engine.graphLatencySec): the saved offset is the DEVICE's delay
//     only — what /play/calibrate saves (its clicks go osc → destination) and what the rooms add their own desk to.

import { CALIBRATION, STEADY_MIN, computeOffsetMs, readCalibrationTaps } from '@/lib/feel/rhythm-calibrate';

/** The check's tempo: the calibrate screen's (see the header). */
export const CHECK_BPM = CALIBRATION.BPM;
/** Two bars of count-in are read … */
export const CHECK_BARS = 2;
/** … is eight clicks, eight taps. */
export const CHECK_TAPS = 8;
export const CHECK_BEAT_SEC = 60 / CHECK_BPM;
/** MUSIC-SUITE P4 FIX PASS: the bar counted in BEFORE the read bars (heard, never read: the player finds the tempo and TAP). */
export const CHECK_LEAD_BARS = 1;
/** The bars the engine counts in for a check: the lead-in and the read bars. */
export const CHECK_COUNT_BARS = CHECK_LEAD_BARS + CHECK_BARS;

/** The clicks a check READS: the last CHECK_TAPS of the count-in (the lead-in bar's are only heard). */
export function checkClicks(all: readonly number[]): number[] {
  return all.length >= CHECK_TAPS ? all.slice(all.length - CHECK_TAPS) : [];
}
/** The clicks as they leave the desk (AudioEngine.graphLatencySec later than they were scheduled): what a tap answers. */
export function heardClicks(clicks: readonly number[], latencySec: number): number[] {
  const l = Number.isFinite(latencySec) && latencySec > 0 ? latencySec : 0;
  return clicks.map((c) => c + l);
}

/** The window taps are read in: from EARLIEST before the first click to the late edge after the last. */
export function checkWindow(clicks: readonly number[], beatSec = CHECK_BEAT_SEC): { open: number; close: number } | null {
  if (!clicks.length || !(beatSec > 0)) return null;
  const early = -CALIBRATION.EARLIEST_MS / 1000;              // 0.2 s
  return { open: clicks[0] - early, close: clicks[clicks.length - 1] + beatSec - early };
}

/** Is a tap at `t` one the check takes (inside the window, and a tap still wanted)? */
export function acceptsTap(t: number, taps: readonly number[], clicks: readonly number[], beatSec = CHECK_BEAT_SEC): boolean {
  const w = checkWindow(clicks, beatSec);
  return !!w && Number.isFinite(t) && taps.length < CHECK_TAPS && t >= w.open && t < w.close;
}

export type CheckResult =
  | { ok: true; offsetMs: number; steadiness: number; taps: number; pairs: { click: number; tap: number }[] }
  | { ok: false; reason: 'few' | 'uneven'; taps: number; steadiness: number };

/**
 * Read the check: the clicks' scheduled times (audio clock, s) and the taps (audio clock, s). Taps outside the window
 * are ignored, and only the first CHECK_TAPS count.
 */
export function readTimingCheck(clicks: readonly number[], taps: readonly number[], beatSec = CHECK_BEAT_SEC): CheckResult {
  const w = checkWindow(clicks, beatSec);
  const inside = w ? taps.filter((t) => Number.isFinite(t) && t >= w.open && t < w.close).slice(0, CHECK_TAPS) : [];
  if (inside.length < CHECK_TAPS) return { ok: false, reason: 'few', taps: inside.length, steadiness: 0 };
  const grid = clicks[0];
  const reading = readCalibrationTaps(inside, grid, beatSec);
  if (reading.steadiness < STEADY_MIN) return { ok: false, reason: 'uneven', taps: inside.length, steadiness: reading.steadiness };
  // pair each tap with the click that puts it at the players' consensus offset (never "the nearest click")
  const lagSec = reading.offsetMs / 1000;
  const pairs = inside.map((tap) => ({ click: grid + Math.round((tap - grid - lagSec) / beatSec) * beatSec, tap }));
  const offsetMs = computeOffsetMs(pairs.map((p) => p.click), pairs.map((p) => p.tap));
  return { ok: true, offsetMs, steadiness: reading.steadiness, taps: inside.length, pairs };
}

/** "+75 ms", "−50 ms", "0 ms" (a true minus sign). */
export function formatOffset(ms: number): string {
  const n = Math.round(ms);
  return n > 0 ? `+${n} ms` : n < 0 ? `−${-n} ms` : '0 ms';
}

/** The line the room says when the check ends. */
export function checkLine(r: CheckResult): string {
  if (r.ok) return `your offset ${formatOffset(r.offsetMs)} — saved; PERFORM and the Cypher judge by it from now on`;
  if (r.reason === 'few') return `${r.taps} of ${CHECK_TAPS} taps landed on the clicks — nothing was saved; try again and tap all ${CHECK_TAPS}`;
  return `those taps were uneven (steadiness ${r.steadiness.toFixed(2)}, ${STEADY_MIN} needed) — nothing was saved; try again, one tap per click`;
}
