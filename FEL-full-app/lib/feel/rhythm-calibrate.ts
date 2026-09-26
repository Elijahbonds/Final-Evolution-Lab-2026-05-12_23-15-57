/**
 * lib/feel/rhythm-calibrate.ts
 *
 * PHASE 9 / Handoff PART 8.2 (Rhythm / UI Core) — audio-latency calibration.
 *
 * The calibration SCREEN (app/play/calibrate) owns the AudioContext clock and
 * the DOM; this module is the PURE math it (and the headless suite) share:
 *   - fold 16 tap timestamps into a single averaged offset,
 *   - snap that offset to 25 ms increments, clamped to [-400, +400] ms,
 *   - apply a stored offset to any rhythm mode's ideal beat time.
 *
 * MUSIC-SUITE P2 (2026-09-25) — Bluetooth. The stored offset was clamped to ±200 ms (below), and Bluetooth headphones
 * commonly add 200–300 ms of output delay, so a Bluetooth player's real offset could not be stored at all. Worse, the
 * screen paired every tap with the NEAREST beat: at 100 BPM (600 ms apart) a tap 300 ms late is as near the next beat
 * as its own, so anything past ~270 ms (with normal tap jitter) was read as EARLY and the average collapsed toward 0.
 * Now: the clamp is ±400 ms; the click is 80 BPM (750 ms apart) and every tap is read on the beat grid as a phase, the
 * phases averaged on the circle (readCalibrationTaps) and the mean placed in the one-beat window [-200, +550) ms — a
 * tap is late by up to 550 ms or early by up to 200 ms, never both, so a +400 ms offset sits 150 ms inside the window.
 * The screen also stores WHEN it was measured (CALIBRATION_MEASURED_AT_KEY): an offset measured on Bluetooth is wrong
 * the day the player switches to the TV, and the screen now says how old the saved one is. And it can send the player
 * back where they came from (?return=<same-origin path>, safeReturnPath).
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
  MIN_MS: -400,        // clamp floor   (MUSIC-SUITE P2: was -200)
  MAX_MS: 400,         // clamp ceiling (MUSIC-SUITE P2: was 200 — Bluetooth is often 200–300 ms)
  BPM: 80,             // metronome tempo (MUSIC-SUITE P2: was 100 — a beat must be wider than the reading window below)
  /** The earliest a tap is read as EARLY; anything before it is late for the previous beat. The window is one beat,
   *  [EARLIEST_MS, EARLIEST_MS + beat) = [-200, +550) ms at 80 BPM. */
  EARLIEST_MS: -200,
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

export interface TapReading {
  /** The offset (ms), snapped + clamped: positive = the player hears the click late and taps late. 0 with no taps. */
  offsetMs: number;
  /** How tightly the taps agree, 0..1 (the length of the mean phase vector): 1 = every tap at the same phase. */
  steadiness: number;
  /** steadiness >= STEADY_MIN: the taps agree well enough to trust the reading. */
  steady: boolean;
  /** Taps read. */
  taps: number;
}

/** A reading whose taps spread wider than this is not trusted (0.8 ≈ a 90 ms standard deviation at 80 BPM). */
export const STEADY_MIN = 0.8;

/**
 * Read raw tap times (seconds, audio clock) against a click grid that starts at `gridS` and repeats every `beatS`.
 *
 * MUSIC-SUITE P2 (2026-09-25): each tap is a PHASE on the grid, not a pairing with its nearest beat, so a steady player
 * 300 ms late is read as 300 ms late even where 300 ms is half a beat. The phases are averaged on the circle (a tap just
 * past a beat and one just before the next agree instead of cancelling), and the mean is placed in the one-beat window
 * [CALIBRATION.EARLIEST_MS, EARLIEST_MS + beat). Which beat a tap "belongs to" never matters: a lead-in tap is as good a
 * reading as a counted one.
 */
export function readCalibrationTaps(tapTimesS: readonly number[], gridS: number, beatS: number = BEAT_INTERVAL_S): TapReading {
  const taps = (tapTimesS ?? []).filter((t) => Number.isFinite(t));
  if (taps.length === 0 || !(beatS > 0) || !Number.isFinite(gridS)) return { offsetMs: 0, steadiness: 0, steady: false, taps: 0 };
  let x = 0, y = 0;
  for (const t of taps) {
    const phase = (2 * Math.PI * (t - gridS)) / beatS;
    x += Math.cos(phase);
    y += Math.sin(phase);
  }
  const steadiness = Math.hypot(x, y) / taps.length;
  if (steadiness < 1e-6) return { offsetMs: 0, steadiness: 0, steady: false, taps: taps.length };
  const beatMs = beatS * 1000;
  let ms = (Math.atan2(y, x) / (2 * Math.PI)) * beatMs;          // (-beat/2, +beat/2]
  while (ms < CALIBRATION.EARLIEST_MS) ms += beatMs;             // into the one-beat reading window
  while (ms >= CALIBRATION.EARLIEST_MS + beatMs) ms -= beatMs;
  return { offsetMs: normalizeOffset(ms), steadiness, steady: steadiness >= STEADY_MIN, taps: taps.length };
}

/** How old a stored reading is, for the screen: 'today', 'yesterday', 'N days ago' — null when it was never dated. */
export function calibrationAgeText(measuredAtMs: number | null, nowMs: number): string | null {
  if (measuredAtMs == null || !Number.isFinite(measuredAtMs) || !Number.isFinite(nowMs)) return null;
  const days = Math.floor(Math.max(0, nowMs - measuredAtMs) / 86_400_000);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The calibrate screen's ?return=: a same-origin PATH, or null. MUSIC-SUITE P2 (2026-09-25): the rooms link here with
 * ?return=/play/dance (or /play/music) and the screen offers "Back to the room" after saving. Anything that could leave
 * the origin is refused: a scheme (https:, javascript:), a protocol-relative '//host', a backslash ('/\host' is '//host'
 * to a browser), a control character (browsers drop tabs and newlines from a URL, so '/\t/host' is '//host' too).
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.trim();
  if (!p || p.length > 512 || p[0] !== '/' || p[1] === '/') return null;
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return null;
  try {
    const base = 'https://fel.invalid';
    const u = new URL(p, base);
    if (u.origin !== base) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

// --- storage (SSR-guarded; the headless suite passes its own store) ---

/**
 * When the stored offset was measured (epoch ms, as a decimal string). A key of its own, beside the offset, so the offset
 * key keeps its plain-integer format and any reader of it (parseInt) is unaffected. MUSIC-SUITE P2 (2026-09-25).
 */
export const CALIBRATION_MEASURED_AT_KEY = 'fel.audioOffsetMeasuredAt';

/** The slice of Storage these helpers use — window.localStorage in the browser, a Map-backed fake in the tests. */
export type CalibrationStore = Pick<Storage, 'getItem' | 'setItem'>;

function browserStore(): CalibrationStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;   // storage blocked (private mode, site data off)
  }
}

/** A stored offset string -> ms (snapped + clamped); 0 when absent or unreadable. */
export function parseStoredOffset(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const v = parseInt(raw, 10);
  return Number.isFinite(v) ? normalizeOffset(v) : 0;
}

/** A stored measured-at string -> epoch ms, or null (never measured, or saved before the date was kept). */
export function parseMeasuredAt(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

export interface StoredCalibration {
  offsetMs: number;
  measuredAt: number | null;
  /** An offset was saved on this device (a saved 0 is a calibration; nothing saved is not). */
  saved: boolean;
}

/** The persisted calibration: its offset, when it was measured, and whether one was saved at all. */
export function loadAudioCalibration(store: CalibrationStore | null = browserStore()): StoredCalibration {
  if (!store) return { offsetMs: 0, measuredAt: null, saved: false };
  try {
    const raw = store.getItem(CALIBRATION_STORAGE_KEY);
    const saved = raw != null && Number.isFinite(parseInt(raw, 10));
    return {
      offsetMs: parseStoredOffset(raw),
      measuredAt: saved ? parseMeasuredAt(store.getItem(CALIBRATION_MEASURED_AT_KEY)) : null,
      saved,
    };
  } catch {
    return { offsetMs: 0, measuredAt: null, saved: false };
  }
}

/** Read the persisted offset (ms). Returns 0 when unset or unavailable. */
export function loadAudioOffsetMs(store: CalibrationStore | null = browserStore()): number {
  return loadAudioCalibration(store).offsetMs;
}

/** What a rhythm room reads: the offset it may APPLY (null = use its own fallback), and whether a reading was set aside. */
export interface RoomCalibration {
  /** The saved offset (ms) when it is one the rooms can trust, else null (fall back to AudioContext.outputLatency). */
  offsetMs: number | null;
  /** An offset IS saved but predates the fixed reader (no measured-at date): ignored, and the player is asked to redo it. */
  stale: boolean;
}

/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): THE ONE READER BOTH ROOMS USE (DanceMode and StudioMode each read the key their
 * own way — and disagreed on a corrupt value: PERFORM read it as a calibration of 0, the Cypher as none).
 *
 * An offset with no measured-at date was saved by the OLD screen, whose reader paired each tap with the nearest click at
 * 100 BPM and clamped to ±200 ms, so anything past ~270 ms late collapsed toward 0 or read as EARLY (this file's P2
 * header) — and until P2 no room applied it, so it never mattered. Now both rooms apply the saved offset IN PLACE OF
 * outputLatency, so a Bluetooth player (~+350 ms) whose old run saved −200 would be judged about 550 ms off: every
 * Cypher step a MISS, every PERFORM tap an EXTRA, where the outputLatency fallback is about right. Only a DATED reading
 * (CALIBRATION_MEASURED_AT_KEY, written by the P2 reader alone) is applied; an undated one is `stale` (the rooms say
 * "recalibrate") and the room falls back as if nothing were saved.
 */
export function loadRoomCalibration(store: CalibrationStore | null = browserStore()): RoomCalibration {
  const c = loadAudioCalibration(store);
  if (!c.saved) return { offsetMs: null, stale: false };
  return c.measuredAt === null ? { offsetMs: null, stale: true } : { offsetMs: c.offsetMs, stale: false };
}

/**
 * The persisted offset (ms) a rhythm room may apply, or null — never saved, or saved by the pre-P2 reader (undated, see
 * loadRoomCalibration) — which is what a room needs to choose between the calibration and its fallback
 * (AudioContext.outputLatency). loadAudioOffsetMs answers 0 for all three.
 */
export function loadSavedOffsetMs(store: CalibrationStore | null = browserStore()): number | null {
  return loadRoomCalibration(store).offsetMs;
}

/**
 * Persist a normalized offset (ms) and when it was measured (epoch ms; the one wall-clock read in this module, and only
 * as a default — the screen passes the time its reading finished).
 */
export function saveAudioOffsetMs(ms: number, measuredAtMs: number = Date.now(), store: CalibrationStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.setItem(CALIBRATION_STORAGE_KEY, String(normalizeOffset(ms)));
    if (Number.isFinite(measuredAtMs) && measuredAtMs > 0) store.setItem(CALIBRATION_MEASURED_AT_KEY, String(Math.floor(measuredAtMs)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}
