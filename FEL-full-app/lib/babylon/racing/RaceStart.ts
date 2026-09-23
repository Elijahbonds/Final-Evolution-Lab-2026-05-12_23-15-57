// RaceStart — the countdown and the start you can win (racing pass, phase 4, 2026-09-23).
//
// THE GAP: Velocity Kart and Aero Aces raced from frame one. The field launched through the grid while the player was
// still reading the course name, and the first thing every kart racer since Mario Kart teaches — the countdown, and the
// rocket start you earn by timing the throttle to it — did not exist. The start is the one moment every racer in the
// field is level; making it a skill is the cheapest depth a racing mode can have.
//
// The grammar (Mario Kart's, with Diddy Kong Racing's forgiveness):
//   · three beats — 3 · 2 · 1 — then GO. Nobody moves until GO, the clock does not run.
//   · put the throttle down as "2" lands (the first 0.8 s of the beat … GO − 2.0 s to GO − 1.2 s) and HOLD it through
//     GO: a ROCKET START (a zip of full boost). "Throttle down on 2" is the whole instruction, and it is exact.
//   · put it down EARLIER (on "3") and hold it: the engine bogs — a BURNOUT, a beat of lost drive after GO.
//   · put it down late (the back of "2", or on "1"), or let go before GO: a normal start. Never a penalty for not trying.
// Pure: a clock and a throttle in, a phase and an outcome out.

export const COUNT_BEAT_SEC = 1;
/** Seconds of settle before the first beat (the course name is on screen). */
export const COUNT_LEAD_SEC = 1.2;
/** The rocket window, in seconds BEFORE GO. */
export const ROCKET_EARLIEST = 2.0;
export const ROCKET_LATEST = 1.2;
/** What each start is worth after GO. */
export const ROCKET_ZIP_SEC = 1.1;
export const BURNOUT_SEC = 0.9;
export const BURNOUT_THROTTLE = 0.25;

export type StartOutcome = 'rocket' | 'burnout' | 'normal';
export interface StartState {
  t: number;
  /** When the throttle last went down during the count (seconds on the start clock), or null while it is up. */
  downAt: number | null;
  /** The beat on screen: 3, 2, 1, 0 = GO, -1 before the first beat. */
  beat: number;
  go: boolean;
  outcome: StartOutcome | null;
}

export const GO_AT = COUNT_LEAD_SEC + 3 * COUNT_BEAT_SEC;

export function newStart(): StartState { return { t: 0, downAt: null, beat: -1, go: false, outcome: null }; }

/** Classify a throttle that went down at `downAt` and was held through GO. */
export function classifyStart(downAt: number | null): StartOutcome {
  if (downAt === null) return 'normal';
  const before = GO_AT - downAt, eps = 1e-6;
  if (before > ROCKET_EARLIEST + eps) return 'burnout';
  if (before >= ROCKET_LATEST - eps) return 'rocket';
  return 'normal';
}

export interface StartStep { state: StartState; beatChanged: boolean; wentGo: boolean }

/** Advance the start clock. `throttleDown` is the throttle held this frame (≥ 0.5). */
export function stepStart(s: StartState, dt: number, throttleDown: boolean): StartStep {
  if (s.go) return { state: s, beatChanged: false, wentGo: false };
  const t = s.t + Math.max(0, dt);
  let downAt = s.downAt;
  if (throttleDown && downAt === null) downAt = t;
  if (!throttleDown) downAt = null;
  const left = GO_AT - t;
  const beat = t < COUNT_LEAD_SEC ? -1 : left > 0 ? Math.ceil(left / COUNT_BEAT_SEC) : 0;
  const wentGo = left <= 0;
  const state: StartState = { t, downAt, beat, go: wentGo, outcome: wentGo ? classifyStart(downAt) : null };
  return { state, beatChanged: beat !== s.beat, wentGo };
}

/** The label a beat shows. */
export function beatLabel(beat: number): string { return beat > 0 ? String(beat) : beat === 0 ? 'GO!' : ''; }
