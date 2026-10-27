// lib/hoops-cam/copy.ts — basketball on the camera (BBS, 2026-10-26): every line the shot and dribble tracker says.
//
// DRAFT PRODUCT COPY, FOR THE OWNER'S EYE (docs/HOOPS-CAM.md). NO ACCURACY CLAIM (owner): the tracker is a BETA that can
// miss a shot or call one wrong, says so, and lets the player correct any shot with a tap. Nothing says "accurate",
// "precise", "AI" or a percentage of correctness; copy.test.ts holds every fixed line to that.
//
// Pure, client-safe.
import type { Placement } from './spot';

export const BETA_LINE = 'Beta: the camera can miss a shot or call one wrong. Tap any shot to fix it.';
export const PRIVACY_LINE = 'The camera picture stays on this phone. It is never sent or saved: only the numbers are.';
export const DEVICE_LINE = 'Kept on this phone only.';
export const TEEN_LINE = 'Your shots and dribbles show here while you play. They are not kept, on this phone or anywhere else.';
export const UNDER_13_LINE = 'The shot tracker is for 13 and over.';
export const AGE_UNKNOWN_LINE = 'Add your birth year in your account to use the shot tracker.';
export const SPOT_LINE = 'Spots are approximate: read from where your feet were and how tall you are, not from the court lines.';
export const RIM_LINE = 'Tap the left end of the rim, then the right end.';
export const RIM_SUGGEST_LINE = 'Is that the rim? Use it, or tap the two ends yourself.';
export const ASK_LINE = 'Did that one go in?';

/** The set-up guide for shots. */
export const SHOT_GUIDE: readonly string[] = [
  'Stand the phone still: a tripod, a fence post, a bag. Landscape works best.',
  'Off to the side of your shots (a wing or the baseline), not straight behind you: from behind, one camera cannot see a ball drop in front of the rim from one that goes through.',
  'The rim, the net and you all in the picture, with some room above the rim for the arc.',
  'An orange or brown ball. Light from behind the camera helps.',
];

/** The set-up guide for dribbles. */
export const DRIBBLE_GUIDE: readonly string[] = [
  'Prop the phone about 3 m away at about knee to hip height, facing you.',
  'All of you and the floor around your feet in the picture.',
  'An orange or brown ball, and the phone still.',
];

export const placementLine = (p: Placement): string => ({
  left_baseline: 'On the left baseline, looking along it.',
  left_wing: 'On the left wing, 45° off the middle.',
  top: 'Behind the shooter (the least clear view of a make).',
  right_wing: 'On the right wing, 45° off the middle.',
  right_baseline: 'On the right baseline, looking along it.',
})[p];

export type HoopsStatus = 'no_rim' | 'looking' | 'tracking';
export function statusLine(s: HoopsStatus, mode: 'shots' | 'dribble'): string {
  if (s === 'no_rim') return RIM_LINE;
  if (s === 'looking') return mode === 'shots' ? 'Looking for the ball…' : 'Looking for the ball: start dribbling.';
  return mode === 'shots' ? 'Ball found. Shoot when ready.' : 'Ball found. Keep dribbling.';
}

export const pctText = (made: number, taken: number): string => (taken ? `${Math.round((made / taken) * 100)}%` : '—');

/** Every fixed line, for the copy test. */
export const FIXED_LINES = [BETA_LINE, PRIVACY_LINE, DEVICE_LINE, TEEN_LINE, UNDER_13_LINE, AGE_UNKNOWN_LINE, SPOT_LINE, RIM_LINE, RIM_SUGGEST_LINE, ASK_LINE, ...SHOT_GUIDE, ...DRIBBLE_GUIDE];
