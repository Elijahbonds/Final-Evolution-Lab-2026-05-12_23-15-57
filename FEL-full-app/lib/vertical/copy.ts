// copy — the words of "Measure my vertical" (VERTICAL-EASY, 2026-10-27). Every line here is held to docs/CUE-STYLE.md by
// tests/vertical-easy/copy.test.ts (lib/cue-style lintStyle / shapeProblems): plain words, short, a result in three parts.
//
// Pure data and two pure helpers.
import type { FramingCheck, FramingIssue } from '@/lib/mirror/framing';

/** The one front door's name, everywhere it is linked (label tier). */
export const MEASURE_VERTICAL = 'Measure my vertical';
/** The line under it on a list row (card tier). */
export const MEASURE_VERTICAL_LINE = 'Prop your phone up, jump three times. About a minute.';

/** The setup card's eyebrow (kept: tests/screen-a/live-hud.test.tsx reads it). */
export const SETUP_EYEBROW = 'Camera setup';
/** Under the picture: where the device goes (set-up tier). */
export const SETUP_PLACE = 'Lean your phone on something about hip high. Step back until your whole body shows.';
/** The big green word once the whole body is in view. */
export const SETUP_READY = 'Ready';
/** Under it while the stand is read. */
export const SETUP_READY_LINE = 'Stand still.';

/** The big amber word for what to fix first, by the framing check's worst issue (label tier, 1–4 words). */
const HEADLINE: Record<FramingIssue, string> = {
  noBody: 'Step into view',
  cutOffBottom: 'Whole body in view',
  cutOffTop: 'Whole body in view',
  tooClose: 'Step back',
  tooFar: 'Come closer',
  offCentre: 'Move to the middle',
  turned: 'Face the camera',
  dim: 'More light',
};

/** What the setup card says, big: the one fix, or "Ready". */
export function setupHeadline(f: FramingCheck | null, ready: boolean): { word: string; ready: boolean } {
  if (ready) return { word: SETUP_READY, ready: true };
  return { word: f?.worst ? HEADLINE[f.worst] : HEADLINE.noBody, ready: false };
}
export const SETUP_HEADLINES: readonly string[] = Object.values(HEADLINE);

/** The jump's own instruction, shown with the hands-on-hips picture before the countdown (card tier). */
export const JUMP_HOW = 'Hands on hips. Dip, jump as high as you can, land tall.';
/** Flashed big when the countdown ends (live tier). */
export const JUMP_GO = 'Jump!';

// ── the result: three parts (docs/CUE-STYLE.md §4) ──

/** The number's label. */
export const RESULT_LABEL = 'Your vertical';
/** What we saw: the best of the jumps that counted. */
export const resultSaw = (counted: number, number: string): string =>
  counted >= 3 ? `Best of your 3 jumps: about ${number}.` : counted === 2 ? `Best of your 2 jumps: about ${number}.` : `Your one jump that counted: about ${number}.`;
/** What it means: against the last one on this device, or the first number to beat. */
export function resultMeans(change: { kind: 'up' | 'down' | 'same'; text: string } | null): string {
  if (!change) return 'This is your number to beat. The camera reads it from your time in the air.';
  if (change.kind === 'same') return `About the same as last time (${change.text}). That is inside the camera's range.`;
  return change.kind === 'up' ? `That is ${change.text} more than last time.` : `That is ${change.text} less than last time. One day can vary.`;
}
/** What to do next. */
export const RESULT_NEXT = 'Measure again in a week, same spot and same time of day.';
/** No jump counted. */
export const RESULT_NONE_SAW = 'No jump counted this time.';
export const RESULT_NONE_MEANS = 'The camera needs to see your feet leave and land.';
export const RESULT_NONE_NEXT = 'Step back so your whole body shows, then try again.';

/** The result's buttons (label tier). */
export const RESULT_DONE = 'Done';
export const RESULT_AGAIN = 'Jump again';
export const RESULT_MORE = 'More detail';
