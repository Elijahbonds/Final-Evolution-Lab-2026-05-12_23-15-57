/**
 * lib/feel/rhythm-calibrate.ts
 *
 * PHASE 9 / Handoff PART 8.2 (Rhythm / UI Core) — audio-latency calibration.
 *
 * The calibration SCREEN (app/play/calibrate) owns the AudioContext clock and
 * the DOM; this module is the PURE math it (and the headless suite) share:
 *   - fold 16 tap timestamps into a single averaged offset,
 *   - snap that offset to 25 ms increments, clamped to [-200, +200] ms,
 *   - apply a stored offset to any rhythm mode's ideal beat time.
 *
 * AUDIO CLOCK LAW (Part 8.1): all times fed in here are already in the audio
 * context's coordinate system (seconds). This module never reads a clock —
 * everything is caller-supplied so scripts/rhythm-calibrate-tests.ts can assert
 * the invariants deterministically.
 */

// TUNE(elijah) — calibration protocol constants.
export const CALIBRATION = {
  TAP_COUNT: 16,       // taps sampled per calibration run
  STEP_MS: 25,         // offsets snap to this increment
  MIN_MS: -200,        // clamp floor
  MAX_MS: 200,         // clamp ceiling
  BPM: 100,            // metronome tempo
} as const;

/** Seconds between metronome beats at the calibration tempo. */
export const BEAT_INTERVAL_S = 60 / CALIBRATION.BPM;

export const CALIBRATION_STORAGE_KEY = 'fel.audioOffsetMs';

/** Snap a millisecond value to the nearest 25 ms increment. */
export function roundToStep(ms: number, step: number = CALIBRATION.STEP_MS): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / step) * step;
}

/** Clamp a millisecond offset to the legal calibration range. */
export function clampOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(CALIBRATION.MIN_MS, Math.min(CALIBRATION.MAX_MS, ms));
}

/** Snap + clamp in one step — the canonical form a stored offset must take. */
export function normalizeOffset(ms: number): number {
  return clampOffset(roundToStep(ms));
}

/**
 * Fold paired (expectedBeatTimeS, tapTimeS) samples into a single averaged
 * audio offset in MILLISECONDS, snapped + clamped.
 *
 * A positive result means the player taps LATE relative to the click, so the
 * mode should shift its ideal target later by that many ms to feel centered.
 * Extra/short arrays are truncated to the shorter length; empty -> 0.
 */
export function computeOffsetMs(expectedTimesS: number[], tapTimesS: number[]): number {
  const n = Math.min(expectedTimesS?.length ?? 0, tapTimesS?.length ?? 0);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (tapTimesS[i] - expectedTimesS[i]);
  const meanMs = (sum / n) * 1000;
  return normalizeOffset(meanMs);
}

/**
 * Apply a stored offset (ms) to a rhythm mode's ideal beat time (seconds).
 * idealBeatTime + audioOffset = adjusted target (Part 8.2 step 6).
 */
export function adjustedTargetS(idealBeatTimeS: number, audioOffsetMs: number): number {
  return idealBeatTimeS + audioOffsetMs / 1000;
}

/** Nudge a manual offset by ±one step, staying snapped + clamped. */
export function nudgeOffset(current: number, dirSteps: number): number {
  return normalizeOffset(current + dirSteps * CALIBRATION.STEP_MS);
}

// --- browser storage helpers (SSR-guarded; not exercised by headless tests) ---

/** Read the persisted offset (ms). Returns 0 when unset or unavailable. */
export function loadAudioOffsetMs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (raw == null) return 0;
    const v = parseInt(raw, 10);
    return Number.isFinite(v) ? normalizeOffset(v) : 0;
  } catch {
    return 0;
  }
}

/** Persist a normalized offset (ms). */
export function saveAudioOffsetMs(ms: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, String(normalizeOffset(ms)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}
