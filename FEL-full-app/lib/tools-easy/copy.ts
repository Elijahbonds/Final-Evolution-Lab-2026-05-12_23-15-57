// copy — the shared words of the camera tools (TOOLS-EASY, 2026-10-28). Held to docs/CUE-STYLE.md by
// tests/tools-easy/copy.test.ts (lib/cue-style lintStyle): plain words, short, one name per thing.
//
// Pure data.

/** One name per act, on every camera tool (label tier). Before: five start labels and five stop labels. */
export const START_CAMERA = 'Start the camera';
export const STOP_AND_READ = 'Stop and read it';

/** The jump takes (the readiness check, the combine jump station): the stand, said and shown (set-up / live tiers). */
export const TAKE_STAND_WORD = 'Stand still';
export const TAKE_STAND_LINE = 'Hands on hips. Stand still for two seconds.';
export const TAKE_JUMP_WORD = 'Jump!';
export const TAKE_READING = 'Reading your jumps…';
/** "1 of 3": jumps that counted, of the jumps asked (label tier). */
export const takeCount = (n: number, of: number) => `${Math.min(n, of)} of ${of}`;

/** The readiness check before the camera (card tier; was HOW_LINE, 25 words). */
export const READINESS_HOW = 'Prop your phone up and step back. Hands on hips, then three big jumps.';

/** The Mirror's Jump tab, which no longer measures (card tier). */
export const JUMP_TAB_LINE = 'Your vertical is measured with one guided check: three jumps, about a minute. Your dunk progress is below.';

/** Bar speed (label / set-up tiers). */
export const LOAD_LABEL = 'Weight (kg, optional)';
export const TIPS_LABEL = 'More set-up tips';
export const SLOWMO_LABEL = 'Read a slow-motion video instead';
export const READY_LINE = 'Start your set.';
export const RULER_WORD = 'Show the plate';
export const RULER_LINE = 'The camera needs the plate or your height. End the set and type your height.';
