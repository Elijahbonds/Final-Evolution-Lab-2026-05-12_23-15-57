// CameraFraming — the reason nothing in this game is readable.
//
// MEASURED ON THE DEPLOYED BUILD, 2026-07-27, via `tools/pose_probe.mjs`:
//
//   mode         char px   % of frame   camera distance
//   tennis            36        4.9%         33.5 m
//   skateboard        46        6.3%            —
//   football          55        7.6%            —
//   dunk              60        8.3%         18.4 m
//   onevone           62        8.5%            —
//   karate            65        8.9%            —
//   karate-vs        250       34.4%          3.9 m
//   baseball         958      131.6%            —
//
// **Six of eight modes render the player at 5-9% of the screen height.**
// A 1.72 m athlete, 60 pixels tall on a 1280×800 desktop and — before M95's
// canvas fix — NINETEEN CSS PIXELS on an iPhone.
//
// WHY THIS IS THE HEADLINE AND NOT A POLISH ITEM
//
// 1. It invalidated four batches of my own diagnosis. I reported twice that
//    "the characters are T-posed". They are not: `idle_stand` plays, the rest
//    pose solves, and the arms sit at 20 degrees from vertical, which is a
//    normal relaxed stance. Bind pose on this rig measures 90 degrees. At 60
//    pixels, 20 and 90 are the same picture. I was reading a framing bug as a
//    rigging bug.
//
// 2. It cancels M92. Eleven tells are specified, six of them anchored to the
//    subject. A tell on a 19-pixel character is roughly six pixels. Every one
//    of phases 2-8's mechanics is invisible for this reason alone, and drawing
//    them changes nothing until the camera comes in.
//
// 3. It is cheap. It is a camera distance per mode. No art, no rig, no
//    Blender, no mocap.
//
// NOT A NEW SUBSYSTEM: `CameraDirector` and `FOLLOW_PRESETS` already exist and
// already own distance. This is the arithmetic that says what to put in them,
// plus a grade so the answer can be checked instead of eyeballed.

/**
 * Below this the character cannot carry a readable tell, so the mechanics
 * behind it are unreachable however well they are implemented.
 *
 * 15% of a 660px phone canvas is a 99px character — about the size a sports
 * game gives a player in a wide tactical shot, and the floor rather than the
 * goal.
 */
export const READABLE_MIN = 0.15;

/** What a mode should aim for: the action reads, the field still fits. */
export const TARGET_FRACTION = 0.22;

/**
 * Above this the camera is inside the character and the player loses the
 * field. `baseball` measures 1.32 — the character is taller than the frame.
 */
export const TOO_CLOSE = 0.45;

/**
 * A subject-anchored tell is roughly a third of the character's height — a
 * glyph over the head, an arc at the feet, a spacing bar at the waist.
 */
export const TELL_SIZE_RATIO = 1 / 3;

/**
 * Smallest tell that can carry TWO channels — shape and colour — which M82
 * requires and M92 audits. Below this a tell degrades to a coloured smudge,
 * which is the colour-only failure both batches exist to prevent.
 */
export const MIN_TELL_CSS_PX = 24;

export interface FramingInput {
  /** Character height in metres, head to foot. Measured, not assumed. */
  heightM: number;
  /** Vertical field of view in radians. Babylon's default is 0.8. */
  fovRad: number;
  /**
   * How far the camera looks DOWN, in radians. A pitched camera foreshortens
   * a standing figure by roughly cos(pitch); ignoring it overestimates the
   * character's on-screen height by about 10% on this game's cameras, which
   * is the gap between this model and the measured values.
   */
  pitchRad?: number;
}

/** What fraction of frame height a character occupies at a given distance. */
export function fractionAtDistance(input: FramingInput & { distanceM: number }): number {
  const visibleHeight = 2 * Math.max(0.01, input.distanceM) * Math.tan(input.fovRad / 2);
  return (input.heightM * Math.cos(input.pitchRad ?? 0)) / visibleHeight;
}

/** The distance that puts a character at `fraction` of frame height. */
export function distanceForFraction(input: FramingInput & { fraction: number }): number {
  const f = Math.max(1e-4, input.fraction);
  return (input.heightM * Math.cos(input.pitchRad ?? 0)) / (2 * f * Math.tan(input.fovRad / 2));
}

export type FramingGrade = 'unreadable' | 'tight' | 'good' | 'too_close';

export function gradeFraming(fraction: number): FramingGrade {
  if (fraction < READABLE_MIN) return 'unreadable';
  if (fraction > TOO_CLOSE) return 'too_close';
  if (fraction < TARGET_FRACTION) return 'tight';
  return 'good';
}

/** On-screen size of a subject-anchored tell, in CSS pixels. */
export function tellPixels(fraction: number, canvasCssHeight: number): number {
  return fraction * canvasCssHeight * TELL_SIZE_RATIO;
}

/**
 * Can a player actually read this mode's tells?
 *
 * Takes BOTH the framing and the canvas, because they multiply — and that is
 * the point M95 alone does not reach. Quadrupling the canvas on a phone still
 * leaves a 5% character too small to carry a tell.
 */
export function canReadTells(fraction: number, canvasCssHeight: number): boolean {
  return tellPixels(fraction, canvasCssHeight) >= MIN_TELL_CSS_PX;
}

export interface ModeFraming {
  mode: string;
  /** Measured fraction of frame height, from tools/pose_probe.mjs. */
  measured: number;
  /** Measured camera distance in metres, where the probe could read it. */
  distanceM: number | null;
  heightM: number;
  fovRad: number;
}

/** What the deployed build does today. Measurements, not estimates. */
export const MEASURED: ModeFraming[] = [
  { mode: 'tennis', measured: 0.049, distanceM: 33.47, heightM: 1.722, fovRad: 0.88 },
  { mode: 'skateboard', measured: 0.063, distanceM: null, heightM: 1.72, fovRad: 0.8 },
  { mode: 'football', measured: 0.076, distanceM: null, heightM: 1.72, fovRad: 0.8 },
  { mode: 'dunk', measured: 0.083, distanceM: 18.44, heightM: 1.719, fovRad: 0.9 },
  { mode: 'onevone', measured: 0.085, distanceM: null, heightM: 1.72, fovRad: 0.9 },
  { mode: 'karate', measured: 0.089, distanceM: null, heightM: 1.72, fovRad: 0.8 },
  { mode: 'karate-vs', measured: 0.344, distanceM: 3.93, heightM: 1.226, fovRad: 0.8 },
  { mode: 'baseball', measured: 1.316, distanceM: null, heightM: 1.72, fovRad: 0.8 },
];

export interface Recommendation {
  mode: string;
  grade: FramingGrade;
  measured: number;
  currentDistanceM: number | null;
  /** Distance that would hit TARGET_FRACTION, where the current one is known. */
  recommendedDistanceM: number | null;
  /** How much closer, as a multiplier. 3.0 means "a third of the distance". */
  closerBy: number | null;
}

export function recommend(m: ModeFraming, target = TARGET_FRACTION): Recommendation {
  // Solve back through the measurement rather than trusting the ideal model:
  // the measured fraction already contains this camera's pitch and any
  // off-axis foreshortening, so scaling it is more accurate than recomputing
  // from scratch. Distance and on-screen size are inversely proportional.
  const recommended = m.distanceM === null ? null
    : +(m.distanceM * (m.measured / target)).toFixed(2);
  return {
    mode: m.mode,
    grade: gradeFraming(m.measured),
    measured: m.measured,
    currentDistanceM: m.distanceM,
    recommendedDistanceM: recommended,
    closerBy: recommended === null || recommended === 0 ? null
      : +((m.distanceM as number) / recommended).toFixed(2),
  };
}

/** Every mode that cannot show a tell today, worst first. */
export function unreadableModes(canvasCssHeight: number): ModeFraming[] {
  return MEASURED
    .filter((m) => !canReadTells(m.measured, canvasCssHeight))
    .sort((a, b) => a.measured - b.measured);
}
