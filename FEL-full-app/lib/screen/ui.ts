// ui — the Quick Screen's UI constants (SCREEN-SHIP, 2026-09-29): smoothing, tracking loss, pacing, the font stack.
//
// NONE OF THESE GRADES ANYTHING. They decide how the skeleton looks, when the "Step back into the light" prompt shows
// and how long a "Done" beat holds; the screening numbers are all in lib/screen/PROPOSED-thresholds.ts (Squad gate 2:
// "these are UI smoothing constants, not screening thresholds, and go in the PROPOSED file only if they affect
// grading"). The graders never read this file.
//
// Pure.
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { IMAGE_EURO, type OneEuroParams } from '@/lib/pose/oneEuro';

/**
 * The live skeleton's One Euro filter (lib/pose/oneEuro): minCutoff 1 Hz, beta 16, dCutoff 3 Hz, stated here on
 * purpose. They are movement play's measured IMAGE_EURO values (lib/pose/oneEuro.ts header: holds a standing body still,
 * keeps up with a fast limb); this file re-states them so the screen's smoothing is readable in one place.
 */
export const SKELETON_EURO: OneEuroParams = { minCutoff: 1, beta: 16, dCutoff: 3 };
/** Movement play's own values, for the test that pins SKELETON_EURO to them. */
export const MOVEMENT_PLAY_EURO: OneEuroParams = IMAGE_EURO;

/** A joint under this visibility is HIDDEN on the live skeleton, never drawn jittering (the skeleton's own floor). */
export const SKELETON_MIN_VISIBILITY = 0.5;

/** The body joints tracking needs: shoulders, hips, knees, ankles (MediaPipe indices). */
export const KEY_JOINTS: readonly number[] = [11, 12, 23, 24, 25, 26, 27, 28];
/** Fewer confident key joints than this is tracking lost. */
export const MIN_CONFIDENT_JOINTS = 6;
/** Tracking lost for this many frames in a row shows "Step back into the light" and pauses the check (~0.2 s at 30 fps). */
export const LOSS_FRAMES = 6;

/** How long a part's "Done" beat holds before the next part's setup. */
export const DONE_BEAT_MS = 1200;

/** The screen pages' font: the system stack (never Courier, never the --fel-font-display chain). Gate 1. */
export const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** Whether one landmark is drawn on the live skeleton. */
export const jointVisible = (l: Lm | undefined, floor = SKELETON_MIN_VISIBILITY): boolean => !!l && Number.isFinite(l.x) && l.v >= floor;

/** How many key joints the model is confident of in this frame. */
export function confidentJoints(img: readonly Lm[], floor = SKELETON_MIN_VISIBILITY): number {
  return KEY_JOINTS.reduce((n, i) => n + (jointVisible(img[i], floor) ? 1 : 0), 0);
}

/** No body, or too few confident key joints to read one. */
export function trackingLost(f: Pick<PoseFrame, 'present' | 'image'>): boolean {
  return !f.present || f.image.length < 33 || confidentJoints(f.image) < MIN_CONFIDENT_JOINTS;
}

export type RepDot = 'clean' | 'fault' | 'empty';

/**
 * The rep dots (A2-2): one per rep asked for, filled as each COUNTED rep lands; a rep that did not count (notRead)
 * never fills one. The fill colour is the counted rep's own mark.
 */
export function repDots(marks: readonly ('clean' | 'fault' | 'notRead')[], target: number): RepDot[] {
  const counted = marks.filter((m): m is 'clean' | 'fault' => m !== 'notRead');
  return Array.from({ length: Math.max(0, target) }, (_, i) => counted[i] ?? 'empty');
}
