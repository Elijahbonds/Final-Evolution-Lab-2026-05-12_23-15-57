// copy — the full Quick Screen's spoken set-up lines and its pain prompt, short enough to be HEARD (SCREEN-EASY,
// 2026-10-28; docs/CUE-STYLE.md §1: a set-up ≤ 24 words, a prompt ≤ 14).
//
// MEASURED (docs/SCREEN-EASY-AUDIT.md §2): every set-up line of the full screen was cut off by the next one. The voice
// says one line at a time and a new line cancels the one before (lib/babylon/audio/voice/speakNatural.ts), and the
// countdown's "3" came 1.9–2.5 s after a set-up line of 9–15 s: a first-timer heard "Ankle bend, left leg. Left side…"
// and then "3, 2, 1, Go." These say the move in its first words, then the one thing to do, and the runner now waits for
// a set-up line to be said before it counts down (lib/assess/runner.ts lineDoneAt).
//
// Pure.

/** Each part's set-up line, in the order the screen runs them (lib/assess/runner.ts QUICK_PARTS). */
export const SETUP = {
  'T1-front': 'Overhead squat. Face the camera, arms straight up. Squat deep, three times.',
  'T3-left': 'Stand on your left leg, hands on hips. Squat a third of the way, three times.',
  'T3-right': 'Now your right leg. Same again, three times.',
  T5: 'Jump. Hands on hips, three jumps.',
  'T1-side': 'Now turn side-on, left side to the camera. Same overhead squat, three times.',
  'T2-left': 'Last one, at a wall. Left foot forward, heel down. Knee to the wall, three times.',
  'T2-right': 'Now turn around, right foot forward. Same again, three times.',
} as const;

/** The move header's one cue under the move's name ("Move 2 of 5 · Single-leg squat · Left leg"). */
export const MOVE_CUE = {
  'T1-front': 'Face the camera, arms straight up',
  'T3-left': 'Left leg',
  'T3-right': 'Right leg',
  T5: 'Hands on hips',
  'T1-side': 'Side-on, left side to the camera',
  'T2-left': 'At a wall, left foot forward',
  'T2-right': 'Right side to the camera',
} as const;

/** Said when the athlete stands on the wrong leg for a single-leg squat (the runner waits for the right one). */
export const OTHER_LEG = { left: 'Other leg. Stand on your left leg.', right: 'Other leg. Stand on your right leg.' } as const;

/** The pain prompt's line is lib/screen/copy.ts PAIN_CHECK_LINE (both hands up is the "no"); under the question on screen: */
export const HANDS_UP_HINT = 'No pain? Put both hands up.';

/** The wall check's way out, on screen while it is set up: no wall, no measure (it is skipped, never guessed). */
export const NO_WALL_BUTTON = 'No wall here? Skip it';
/** Beside the wall picture while the ankle bend is set up. */
export const WALL_LINE = 'Side-on, one foot forward. Knee to the wall, heel down.';
export const NO_WALL_SKIPPED = 'Ankle bend skipped: it needs a wall.';

/** Before the camera (the pain step): the start card's privacy line, for a start that did not pass the start card. */
export const VIDEO_STAYS = 'The video stays on this device.';
/** Under the take-off question (was "Asked once, before the camera. Your sided results are labelled with your jumping leg."). */
export const TAKEOFF_NOTE = 'It labels your left and right results.';

/** The results (SCREEN-EASY): the line under "Two things to work on", and the fold for everything else. */
export const OVERALL_WORK_LINE = 'Start with the top one. Each has one thing to try.';
export const MORE_DETAIL = 'More detail';
