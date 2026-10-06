// FEL Kitchens — who the Fuel floor is for (owner-approved 2026-10-06, the moderate option).
//
// Under 18 the Fuel floor is recipes and cooking only: no calorie or macro numbers, no PRQ-driven load band or
// "leak" plate, no food scoring of any kind, and no weight framing. The app knows an account's age from User.dobYear
// (the age screen asks it at sign-up and next login); the rule is the STRICT verified-adult one the health surfaces
// use (lib/privacy/verifiedAdult.ts: more than 18 years, a blank or unreadable year is NOT an adult), so a minor
// is never shown the adult floor by a guess.
//
// Pure: app/kitchens/fuel/page.tsx reads the year on the server and hands FuelView the answer.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export type FuelAudience = 'adult' | 'youth';

export function fuelAudience(dobYear: number | null | undefined, now: Date = new Date()): FuelAudience {
  return verifiedAdult(dobYear, now) ? 'adult' : 'youth';
}

/** What the youth floor never shows (the youth view's own test reads its source against this). */
export const YOUTH_FUEL_NEVER = ['kcal', 'calorie', 'macro', 'PRQ', 'weight', 'score'] as const;
