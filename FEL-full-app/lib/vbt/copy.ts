// lib/vbt/copy.ts — VBT (2026-10-25): every line the bar-speed tool says.
//
// DRAFT PRODUCT COPY, FOR THE OWNER'S EYE (flagged in docs/VBT.md). No legal, medical or accuracy claim: every number is
// "an estimate", with its ± where the method has one, until the validation pilot (owner 2026-10-25). Nothing promises
// safety or names a cause. copy.test.ts holds every fixed line to the weekly draft's MEDICAL_WORDS and to "estimate".
//
// Pure, client-safe.
import type { LiftFamily } from './lifts';
import type { VbtStatus } from './live';
import { result, type ResultLine } from '@/lib/cue-style/result';

export const ESTIMATE_LINE = 'Camera estimates, not lab measurements. The ± shows how far off it can be.';
export const PRIVACY_LINE = 'The camera picture stays on this phone. It is never sent or saved: only the numbers are.';
export const NOT_SAVED_LINE = 'Kept on this phone only. Turn on saving your movement numbers (Profile) to keep your sets across devices and share them with your coach.';
export const TEEN_LINE = 'Rep speed and zones only for now: no max-lift estimates under 18, and your sets are not kept.';
export const UNDER_13_LINE = 'The bar-speed tool is for 13 and over.';
export const AGE_UNKNOWN_LINE = 'Add your birth year in your account to use the bar-speed tool.';
export const E1RM_LINE = 'Estimated max: the most you could lift once, worked out from how your bar slows as weight goes up. An estimate, not a test.';
export const SLOWMO_LINE = 'Pick a slow-motion video filmed side-on. It is read on this phone and never uploaded.';

/** The setup guide, per family. */
export function setupLines(family: LiftFamily): string[] {
  const common = ['Prop the phone side-on, about 3 m away, at about hip height.', 'Keep the whole movement in the picture, top to bottom, and the phone still.'];
  switch (family) {
    case 'barbell': return [...common, 'Point the camera at the end of the bar. A 45 cm plate in view gives the best reading; with no plate, your height is used.'];
    case 'dbkb': return [...common, 'The working hand nearest the camera.'];
    case 'body': return [...common, 'Your whole body in the picture, side-on.'];
    case 'medball': return [...common, 'Throw across the picture, not toward the phone.'];
  }
}

export function statusLine(s: VbtStatus): string {
  switch (s) {
    case 'waiting': return 'Step into the picture, side-on.';
    case 'no_body': return 'No body in the picture yet: step back until all of you shows.';
    case 'no_ruler': return 'Enter your height (or show the plate) so the camera can measure speed.';
    case 'reading': return 'Reading your reps…';
  }
}

export const stopLine = (pct: number) => `Bar ${pct}% slower than your best rep. End the set here.`;
export const sourceLine = (src: 'plate' | 'pose' | null) =>
  src === 'plate' ? 'Read at the plate (45 cm ruler).' : src === 'pose' ? 'Read at your hands/joints from the pose (your height is the ruler): a wider ±.' : '';

/** "0.62 ± 0.05 m/s" */
export const speedText = (v: number, pm: number | null | undefined) => `${v.toFixed(2)}${pm != null ? ` ± ${pm.toFixed(2)}` : ''} m/s`;

/**
 * CUE-REWRITE (2026-10-27): the set's result in the three-part shape — what we saw (best speed, how much the bar slowed),
 * what it means, and the one next step. The summary card used to show "Best 0.62" and "Speed loss 18%" with no unit and no
 * meaning. Never a promise about safety; the slowdown is the only thing it reads.
 */
export function setResult(o: { bestMcv: number | null; lossPct: number | null; stopPct: number }): ResultLine {
  if (o.bestMcv == null) return result('No reps were read in this set.', 'The camera could not follow the bar or your body.', 'Check the set-up tips, then film the next set.');
  const best = `Best rep: ${o.bestMcv.toFixed(2)} m/s (metres a second).`;
  if (o.lossPct == null) return result(best, 'One rep is not enough to see the bar slow down.', 'Next set, do a few more reps.');
  const saw = `${best} Your slowest rep was ${o.lossPct}% slower than your best.`;
  return o.lossPct >= o.stopPct
    ? result(saw, `That is past your ${o.stopPct}% line: more reps would mostly add tiredness, not speed.`, 'Rest 2 to 3 minutes before the next set.')
    : result(saw, `That is under your ${o.stopPct}% line: you still had speed left.`, 'Next set, add a rep or a little weight.');
}

/** Every fixed line, for the copy test. */
export const FIXED_LINES = [ESTIMATE_LINE, PRIVACY_LINE, NOT_SAVED_LINE, TEEN_LINE, UNDER_13_LINE, AGE_UNKNOWN_LINE, E1RM_LINE, SLOWMO_LINE];
