// WHO MAY USE THE STUDIO'S AI BUILDER (owner, 2026-10-14: "Teens too"). Pure: no prisma, no next/*, so the panel could share it.
//
// THE RULE: a signed-in account whose User.dobYear (read from the DATABASE by the route, never the session or the body) makes it a
// teen (13–17) or an adult. Under 13 and an unknown age are refused.
//
// WHERE THE LINES COME FROM. Not a new copy of the arithmetic: this is the account rule itself, lib/privacy/ageScreen.ts
// `ageScreenOutcome` — the birth-year screen that decides who may HAVE an account ('blocked' under 13, 'teen', 'adult'). "Signed-in
// teens too" means exactly the accounts that screen admits as a teen. Only the year is stored, so its lines are the careful ones:
//   - 'blocked' when the year gap is 13 or less (the year that turns 13 this calendar year may still be 12): refused;
//   - 'teen' for a gap of 14 through 18 (certainly 13, at most 18): allowed;
//   - 'adult' when verifiedAdult says so (a gap of more than 18): allowed;
//   - 'invalid' — no year, a fraction, before 1900, in the future: an unknown age, refused (no gate here treats unknown as old
//     enough; lib/screen/age.ts reads "rather not say" as under 13, the most protective answer).
//
// UNDER 13 STAYS BLOCKED. Nothing in the repo lets an under-13 use an AI feature with a guardian's consent: the age screen locks an
// under-13 out of having an account at all (lib/privacy/u13LockLog.ts), the Privacy Policy says "We can't create an account for anyone
// under 13", and the only under-13 allowance anywhere is the free movement screen with an adult present, nothing saved. Guardian
// consent (lib/consent/guardianGate.ts) gates the Mirror, pain check-ins and camp plans — health data — and never grants an under-13
// anything.
//
// NO GUARDIAN STEP FOR A TEEN. assumption: the owner's "teens too" is the whole rule. What the builder sends is the venue only — the
// creator's request and the venue's settings and placements, never the account, a character, a look or any health number — so the
// health-data guardian gate does not apply; a teen's use of the Service is already under the Terms' parent-consent line (§2).

import { ageScreenOutcome } from '@/lib/privacy/ageScreen';

export type AiBuilderAge = 'adult' | 'teen' | 'under13' | 'unknown';

/** The account's age band for the AI builder, from User.dobYear alone (null / missing = unknown). */
export function aiBuilderAge(dobYear: number | null | undefined, now: Date = new Date()): AiBuilderAge {
  const o = ageScreenOutcome(dobYear, now);
  return o === 'adult' ? 'adult' : o === 'teen' ? 'teen' : o === 'blocked' ? 'under13' : 'unknown';
}

/** May this account use the AI builder? Teens (13–17) and adults; never under 13, never an unknown age. */
export function aiBuilderAllowed(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  const a = aiBuilderAge(dobYear, now);
  return a === 'adult' || a === 'teen';
}

/** The refusal's error code. Neutral on purpose: it names no age, no reason and no "come back when" (ageScreen's rule for copy). */
export const AI_BUILDER_AGE_REFUSED = { error: 'ai_builder_unavailable' } as const;
