// age — the Quick Screen's age question and what each answer allows (SCREEN-FIX Cyber 2 and 3, 2026-09-29).
//
//   · FOUR NEUTRAL ANSWERS, none pre-picked and none styled as the expected one: under 13, 13–17, 18 or older, and
//     "I'd rather not say". "Rather not say" is read as under 13, the most protective answer.
//   · THE GROWN-UP STEP. Under 13, 13–17 and "rather not say" see "A grown-up is with me" before the camera; 18 or
//     older goes straight on.
//   · LINKS OUT OF THE SCREEN (the Dunk Program page and the free game) are for 13 and older only. Under 13 and "rather
//     not say" get "Have a parent open this" in their place: no link to a sign-in, an account, a sign-up or an email box.
//   · THE ANSWER IS LOCKED FOR THE TAB. It is written once to this tab's sessionStorage (lib/screen/store.ts lockAge)
//     and read back from then on: the age question does not show again in this tab, and a second answer cannot change
//     it. "Done, clear my results" keeps it, so clearing is not a way to answer again; closing the tab ends it.
//
// Pure.

export type AgeBand = 'under-13' | '13-17' | '18+' | 'unknown';

/** Every answer, in the order the question lists them. */
export const AGE_BANDS: readonly AgeBand[] = ['under-13', '13-17', '18+', 'unknown'];

export const isAgeBand = (x: unknown): x is AgeBand => typeof x === 'string' && (AGE_BANDS as readonly string[]).includes(x);

/** Everyone under 18, and "rather not say", sees the grown-up step before the camera. */
export const needsGrownUp = (age: AgeBand): boolean => age !== '18+';

/** The Dunk Program page and the free game: 13 and older only. No answer is no links. */
export const linksAllowed = (age: AgeBand | null | undefined): boolean => age === '13-17' || age === '18+';

const RANK: Record<AgeBand, number> = { 'under-13': 0, unknown: 0, '13-17': 1, '18+': 2 };

/**
 * One tab's answer when two places hold it (the tab's lock and a kept result's gate record): the more protective of
 * the two. Normally they agree; a hand-edited key cannot open links the other one closes.
 */
export function strictestAge(...ages: (AgeBand | null | undefined)[]): AgeBand | null {
  let out: AgeBand | null = null;
  for (const a of ages) if (a && (out === null || RANK[a] < RANK[out])) out = a;
  return out;
}
