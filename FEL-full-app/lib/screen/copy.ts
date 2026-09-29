// copy — the Quick Screen's fixed words (SCREEN-SHIP, 2026-09-29): the safety copy, the pain gate, the consent step and
// the end of the results. The safety lines are the Research & Advisor draft's, verbatim ("Safety copy (shows before the
// screen and on every result)"); the rest are the brief's. Red never says "injured", "failed" or the like
// (lib/screen/copy.test.ts scans every string here, the PROPOSED file's labels and cues, and the screen's components).
//
// Pure data.

/** Before the screen and on every result, above the fold. */
export const DISCLAIMER = 'This is a free movement check, not a medical exam.';

/** The pain gate, before the camera. */
export const PAIN_QUESTION = 'Does anything hurt right now?';
/** A "yes" ends here: no camera, no checks, nothing saved, no network. */
export const PAIN_STOP = 'Talk to a coach or a medical pro before training through pain.';

/** The age question: the first thing asked, before any network or storage. */
export const AGE_QUESTION = 'How old are you?';
export const AGE_OPTIONS = [
  { band: '18+', label: '18 or older' },
  { band: 'under-18', label: 'Under 18' },
  { band: 'unknown', label: 'I\'d rather not say' },
] as const;

/** The parent-consent step (under 18, or an age not given). Its version is recorded with the checkbox. */
export const CONSENT_TEXT_VERSION = 'screen-consent-v1-2026-09-29';
export const CONSENT_TITLE = 'A parent or guardian needs to say OK';
export const CONSENT_BODY = 'This free movement check uses the camera on this phone. The picture never leaves the phone and '
  + 'nothing is sent anywhere. Results stay on this phone until you clear them or close this tab.';
export const CONSENT_CHECKBOX = 'I\'m this athlete\'s parent or guardian, and I agree to this movement check.';

/** The results screen's end (A2-3, A4-6). */
export const SCREENSHOT_LINE = 'Screenshot this to keep your results.';
export const DONE_CLEAR = 'Done, clear my results';
export const BUILD_PROGRAM = 'Build my Dunk Program';
export const BRAIN_BRAWL = 'Play Brain Brawl, free';

/** A4-4: only after a real, completed screen where every graded check is green. */
export const WIN_LINE = 'Clean screen. You\'re ready for Dunking & Plyometrics.';

/** A4-6: a missing session (refresh after clear, a new tab, a deep link). */
export const NOT_SAVED_TITLE = 'Your results aren\'t saved. Run the screen again';
export const NOT_SAVED_BODY = 'Results live only in this tab, and only until you clear them. Nothing was sent anywhere.';
export const RUN_AGAIN = 'Run the screen again';
export const BACK_TO_RESULTS = 'Back to my results';
export const PROGRAM_COMING = 'Dunk Program coming soon';
export const DEMO_COMING = 'Demo coming (20–30 s)';

/** Squad gate 2: tracking lost. */
export const TRACKING_LOSS_PROMPT = 'Step back into the light';

/** A screen with no program pick yet (a check not finished, no flag to start from). */
export const NO_PICK_LINE = 'Finish every check to get your program pick.';
