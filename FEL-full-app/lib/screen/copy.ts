// copy — the Quick Screen's fixed words (SCREEN-SHIP, 2026-09-29; SCREEN-FIX, 2026-09-29): the safety copy, the pain
// gate, the grown-up step, the camera card, the end of the results and the privacy page. The safety lines are the
// Research & Advisor draft's, verbatim ("Safety copy (shows before the screen and on every result)"); the rest are the
// briefs'. Red never says "injured", "failed" or the like (lib/screen/copy.test.ts scans every string here, the
// PROPOSED file's labels and cues, and the screen's components).
//
// Pure data.

/** Before the screen and on every result, above the fold. */
export const DISCLAIMER = 'This is a free movement check, not a medical exam.';
/**
 * On the results and the program page too (owner, 2026-09-29 7:53 AM PT). CHANGED (SCREEN-FIX-2, retest 1 S-13): was
 * "Not a medical exam. If anything hurts, stop.", which stacked a second "not a medical exam" under DISCLAIMER. The
 * page says that once (DISCLAIMER); this line keeps the stop.
 */
export const STOP_LINE = 'If anything hurts, stop.';

/** The pain gate, before the camera. */
export const PAIN_QUESTION = 'Does anything hurt right now?';
/** A "yes" ends here: no camera, no checks, nothing saved, no network. */
export const PAIN_STOP = 'Talk to a coach or a medical pro before training through pain.';

/**
 * The age question: the first thing asked, before any network or storage. Four answers in age order, none pre-picked,
 * none styled as the expected one, and no hint about which one lets you in (lib/screen/age.ts says what each allows).
 */
export const AGE_QUESTION = 'How old are you?';
export const AGE_OPTIONS = [
  { band: 'under-13', label: 'Under 13' },
  { band: '13-17', label: '13–17' },
  { band: '18+', label: '18 or older' },
  { band: 'unknown', label: 'I\'d rather not say' },
] as const;

/**
 * The grown-up step (under 18, or an age not given): one checkbox. Its version is recorded with the checkbox, so a gate
 * record kept under an older wording (the screen-v1 parent checkbox) no longer reads.
 */
// CHANGED (SCREEN-FIX-2): v2 → v3 with the body below. v2 said "Results stay on this device until you clear them or close
// this tab", which is no longer true for anyone who sees this step: under 18, nothing but the age answer is kept.
export const GROWN_UP_TEXT_VERSION = 'screen-grown-up-v3-2026-09-29';
export const GROWN_UP_TITLE = 'Get a grown-up';
export const GROWN_UP_BODY = 'Ask a parent, a guardian or your coach to stay with you for this check. It uses the camera on '
  + 'this device. The picture never leaves the device and nothing is sent anywhere. Your results are not saved: they go '
  + 'away when you reload or close this page.';
export const GROWN_UP_CHECKBOX = 'A grown-up is with me';

/** The camera card (S-3): after "no" to pain and before the browser asks for the camera, for every age. */
export const CAMERA_INFO_TITLE = 'Next: the camera';
export const CAMERA_INFO_LINES = [
  'The camera watches how you move, so the screen can count your reps and read each check.',
  'The video stays on this device. It is never recorded, and never sent anywhere.',
  'Your browser will now ask to use the camera. Choose Allow to start.',
] as const;
export const CAMERA_INFO_BUTTON = 'Turn on the camera';

/** The checks listed on the start card, in plain words (S-7). The engine's own names stay as they are. */
export const SCREEN_TEST_NAMES = {
  T1: 'Overhead squat',
  T2: 'Ankle bend (knee-to-wall)',
  T3: 'Single-leg squat',
  T5: 'Hands-on-hips jump',
} as const;

/**
 * Under the list: the checks still to come. It used to be built from the engine's NOT_BUILT_LINE, which rendered as
 * "More checks: full screen: coming later." (the double colon, S-7).
 */
export const MORE_CHECKS_LINE = 'More checks are coming later, in the full screen.';

/** "PROPOSED · preview" in plain words (S-7). The PROPOSED file keeps its own label; the screen shows these. */
export const EARLY_VERSION = 'Early version';
export const EARLY_VERSION_LINE = 'Coaches are still checking how this is scored';

/** The results screen's end (A2-3, A4-6). */
export const SCREENSHOT_LINE = 'Screenshot this to keep your results.';
export const DONE_CLEAR = 'Done, clear my results';
/** 18 or older, a screen with nothing to rank yet (a check not read clearly). */
export const NOTHING_TO_RANK = 'Not every check was read clearly, so there is nothing to rank yet.';

/**
 * 18 or older: the results' ONE next step (retest 1 L5, 2026-09-29), until the email waitlist can save safely. "Build
 * my Dunk Program" and "Play the Dunk Game, free" are gone from the results. THE ONE ABSOLUTE URL IN THE SCREEN: kept in
 * this one constant and rendered only as a plain link's href (lib/screen/offsite.test.ts allows it by name).
 * assumption: the label wording (the brief's example).
 */
export const KINDLE_BOOK_URL = 'https://www.amazon.com/dp/B0H5J1M18H';
export const KINDLE_BOOK_LABEL = 'Get the book: The Neuro-Mechanic\'s Blueprint (Kindle)';

/**
 * Under 18, or "rather not say" (SCREEN-FIX-2, Research 2026-09-29 11:01 AM PT): their own number, how it changed since
 * their last screen on this page, and a line to keep it themselves (nothing is kept for them). assumption: the
 * save-your-number wording (the brief's example).
 */
export const KID_JUMP = 'Your jump';
export const KID_NO_JUMP = 'We couldn\'t read your jump this time';
export const KID_SAME_AS_LAST = 'Same as last time';
export const KID_SAVE_LINE = 'Screenshot this or write your number down. Next time, you\'ll see how it changed.';
export const RUN_IT_AGAIN = 'Run it again';

/** Under 13, or "rather not say": in place of every link out of the screen (Cyber 3). */
export const PARENT_TITLE = 'Have a parent open this';
export const PARENT_BODY = 'Ask a parent or guardian to review these results with you. Show them this screen, or take a '
  + 'screenshot to share later.';

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

/** S-6: the browser's Back in the middle of the screen asks first. */
export const LEAVE_TITLE = 'Leave the screen?';
export const LEAVE_BODY = 'Your answers and checks so far will not be kept.';
export const LEAVE_STAY = 'Keep going';
export const LEAVE_GO = 'Leave';
/** The back arrow while a check runs: the camera stops and the camera card comes back. */
export const STOP_CHECKS_TITLE = 'Stop the checks?';
export const STOP_CHECKS_BODY = 'The camera turns off, and the checks so far will not be kept.';
export const STOP_CHECKS_GO = 'Stop the checks';

/** S-5: the camera check for everyone outside development: plain words, no numbers. */
export const SLOW_DEVICE_LINE = 'This device may be slow, so the screen may read less clearly.';

/** Where the screen's privacy page says to write. One constant, so it is easy to change (owner, 2026-09-29). */
export const SCREEN_CONTACT_EMAIL = 'FinalEvolution.us@gmail.com';

/**
 * The privacy page (/screen/privacy): plain words, no form, no request, no storage write, and no link out of the
 * screen. CHANGED (SCREEN-FIX-2, retest 1 S-11 and Cyber F1; the second bullet from the FE PM + Research amend, 11:50 AM
 * PT): the owner's text, verbatim: one heading, five bullets, one closing line (the address is plain text).
 */
export const PRIVACY_TITLE = 'How this screen keeps things private';
export const PRIVACY_LINK = 'How this screen keeps things private';
export const PRIVACY_POINTS = [
  'The screen runs on your phone. The camera is only used to see how you move. The video isn\'t uploaded, recorded or saved.',
  'If you\'re under 18, we don\'t save or send anything about you. The only thing kept is your age answer, in this tab, so the screen shows the right version. It\'s gone when you close the tab.',
  'If you\'re 18 or older, your results stay in this browser tab only, until you close it.',
  'No sign-in, no ads and no outside trackers.',
  DISCLAIMER,
] as const;
export const PRIVACY_CLEARED = 'Cleared. No results from the screen are left in this tab.';
export const PRIVACY_CONTACT = `Questions? Final Evolution LLC, ${SCREEN_CONTACT_EMAIL}`;
