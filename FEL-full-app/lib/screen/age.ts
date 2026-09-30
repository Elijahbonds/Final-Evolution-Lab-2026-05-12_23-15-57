// age — the Quick Screen's age question and what each answer allows (SCREEN-FIX Cyber 2 and 3, 2026-09-29).
//
//   · FOUR NEUTRAL ANSWERS, none pre-picked and none styled as the expected one: under 13, 13–17, 18 or older, and
//     "I'd rather not say". "Rather not say" is read as under 13, the most protective answer.
//   · UNDER 18 IS A KID (SCREEN-FIX-2, Research 2026-09-29 11:01 AM PT): under 13, 13–17 and "rather not say" (isKid).
//     A kid sees "A grown-up is with me" before the camera, only their own number at the end (lib/screen/kid.ts), and
//     keeps nothing but the age answer (lib/screen/store.ts). 18 or older goes straight on.
//   · LINKS OUT OF THE SCREEN are for 18 or older only (SCREEN-FIX-2: 13–17 lose them, S-10). A kid gets no link to a
//     sign-in, an account, a sign-up, an email box or the free game.
//   · THE ANSWER IS LOCKED FOR THE TAB. It is written once to this tab's sessionStorage (lib/screen/store.ts lockAge)
//     and read back from then on: the age question does not show again in this tab, and a second answer cannot change
//     it. "Done, clear my results" keeps it, so clearing is not a way to answer again; closing the tab ends it.
//
// Pure.

export type AgeBand = 'under-13' | '13-17' | '18+' | 'unknown';

/** Every answer, in the order the question lists them. */
export const AGE_BANDS: readonly AgeBand[] = ['under-13', '13-17', '18+', 'unknown'];

export const isAgeBand = (x: unknown): x is AgeBand => typeof x === 'string' && (AGE_BANDS as readonly string[]).includes(x);

/** Under 18, "rather not say", or no answer yet: a kid (the most protective reading of a missing answer). */
export const isKid = (age: AgeBand | null | undefined): boolean => age !== '18+';

/** Everyone under 18, and "rather not say", sees the grown-up step before the camera. */
export const needsGrownUp = (age: AgeBand): boolean => isKid(age);

/** A link out of the screen (the Dunk Program page): 18 or older only. No answer is no links. */
export const linksAllowed = (age: AgeBand | null | undefined): boolean => age === '18+';

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
