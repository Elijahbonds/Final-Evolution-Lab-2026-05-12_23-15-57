// AB-04 (Elijah, 2026-10-03): the one consent for saving movement NUMBERS.
//
// One scope covers jump numbers, Prove It, and re-screen history. There is no
// second consent and no training consent. VIDEO_TRAINING_USE stays false.

export const SCAN_SAVE_SCOPE = 'jump_numbers' as const;

/** The sentence on the card and on /account. Do not paraphrase it. */
export const SCAN_SAVE_CONSENT_TEXT =
  'Save my jump numbers to my account. Numbers only, never video. You can turn this off any time.';

export const SCAN_SAVE_CONSENT_VERSION = 'ab04-2026-10-03';

/** WorkoutScan kinds this consent covers. A narrow delete removes only these. */
export const SAVED_NUMBER_KINDS = ['dunk', 'prove_it', 'rescreen'] as const;
export type SavedNumberKind = (typeof SAVED_NUMBER_KINDS)[number];

export const RUN_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
