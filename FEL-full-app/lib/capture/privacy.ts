// privacy — what a recording is allowed to do (game capture and dunk film).
//
// The picture stays on the device. The only way bytes leave is the player tapping Share or Export, which
// hands the file to the system share sheet or a download. Nothing here posts, and nothing is kept to train a model.
//
// A game clip is the canvas, not the player's face. A dunk film is the camera: under 18, "rather not say", or no
// age yet, the Mirror's grown-up step has to be ticked before the camera starts, and again before that video can
// be exported or shared. 18 or older skips the step. The age bands are the screen's (lib/screen/age.ts).

import { needsGrownUp, type AgeBand } from '@/lib/screen/age';

/** Video is never used to train a model. This is a constant, not a setting. */
export const VIDEO_TRAINING_USE = false;

export type VideoAction = 'keep' | 'analyze' | 'save-numbers' | 'share' | 'export' | 'train';

/**
 * Where a video or a camera frame may go.
 *
 * 'stay' is the device. 'leave' is only Share or Export, and only because the player tapped it.
 */
export function videoDestination(action: VideoAction): 'stay' | 'leave' {
  if (action === 'train') {
    throw new Error('Video is never used for training.');
  }
  return action === 'share' || action === 'export' ? 'leave' : 'stay';
}

/** True only for the two taps that hand a file to the player. */
export function videoMayLeave(action: VideoAction): boolean {
  return videoDestination(action) === 'leave';
}

/**
 * The camera may start.
 *
 * No age yet: no. Under 18 or "rather not say": only after the grown-up step. 18 or older: yes.
 */
export function cameraMayStart(age: AgeBand | null, grownUp: boolean): boolean {
  if (age == null) return false;
  if (needsGrownUp(age)) return grownUp;
  return true;
}

/**
 * A video of the player may be exported or shared.
 *
 * Same rule as the camera, stated again because a grown-up who stepped away does not leave a minor's
 * clip one tap from a share sheet. 18 or older may. No age yet may not.
 */
export function selfVideoMayLeave(age: AgeBand | null, grownUp: boolean): boolean {
  if (age === '18+') return true;
  if (age == null) return false;
  return grownUp;
}

/** A game-canvas clip is not a video of the player. Sharing it is the player's tap, at any age. */
export function gameClipMayLeave(): boolean {
  return true;
}
