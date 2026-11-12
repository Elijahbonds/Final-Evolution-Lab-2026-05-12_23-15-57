// bodyPlayGrownUp — whether body play must wait for the Mirror's grown-up step (BODY-PLAY-WORKS).
//
// The Mirror's rule, not a new one: under 18, or an age we do not have, is a minor (lib/mirror/youth.ts
// isMinorForMirror — a blank birth year reads as unknown). The Quick Screen's answer in this tab is the same
// step's band (lib/screen/age.ts needsGrownUp). The stricter of the two wins: a screen answer of 18+ does not
// open the camera when a birth year on file still reads as under 18.
//
// The tick itself is the Mirror's GrownUpStep. This file only decides whether that step has to come first.
// It does not start a camera, and it does not write the screen's gate record.
//
// FN-BOX-1b-2 (2026-10-19): with a full date of birth held for the page (setBodyPlayDob, the fight pages' useHeldDob)
// the year half of that rule is exact — ageRules.isAdult18, an adult from the 18th birthday on — so born 2008 skips the
// step from their birthday in 2026. Without one it is isMinorForMirror on the year, unchanged, so it fails closed. A full
// date whose year disagrees with the year on file, or one that does not parse, waits (one of them is wrong) — the
// same rule as bodySeam.bodyFightAllowed. The screen band still wins first: 'under-13' / '13-17' / 'unknown' wait.
import { isAdult18, parseBirthDate } from '@/lib/age/ageRules';
import { isMinorForMirror } from '@/lib/mirror/youth';
import { needsGrownUp, type AgeBand } from '@/lib/screen/age';
import { readAge, type StorageLike } from '@/lib/screen/store';

/** What this page knows about the player's age. A missing band and a missing year are both unknown. */
export interface BodyPlayAge {
  /** Account birth year, when something on the page has it. null and undefined are unknown. */
  dobYear?: number | null;
  /** This tab's Quick Screen answer, when it has one. */
  band?: AgeBand | null;
  /** FN-BOX-1b-2: the account's full birth date, 'YYYY-MM-DD'. null and undefined are "no full date": the year rule. */
  dob?: string | null;
}

/** Held for the page when a caller already knows the account year. Unset stays unknown. */
let heldYear: number | null | undefined;

export function setBodyPlayDobYear(year: number | null | undefined): void {
  heldYear = year;
}

export function bodyPlayDobYear(): number | null | undefined {
  return heldYear;
}

/** FN-BOX-1b: the account's full birth date ('YYYY-MM-DD'), held beside the year. Unset stays unknown. */
let heldDob: string | null | undefined;

export function setBodyPlayDob(dob: string | null | undefined): void {
  heldDob = dob;
}

export function bodyPlayDob(): string | null | undefined {
  return heldDob;
}

/**
 * True when the camera has to wait for "A grown-up is with me".
 * Unknown age waits. A known adult (screen band 18+, and no birth year that still reads as under 18) does not.
 */
export function bodyPlayNeedsGrownUp(age: BodyPlayAge, now: Date = new Date()): boolean {
  if (age.band != null && needsGrownUp(age.band)) return true;
  if (age.dob != null) return minorByDate(age.dob, age.dobYear, now);
  if (age.band === '18+') return typeof age.dobYear === 'number' ? isMinorForMirror(age.dobYear, now) : false;
  return isMinorForMirror(age.dobYear, now);
}

/** FN-BOX-1b-2: a full date reads as a minor until the 18th birthday; a bad date, or one off the year on file, waits. */
function minorByDate(dob: string, dobYear: number | null | undefined, now: Date): boolean {
  if (dobYear != null && parseBirthDate(dob)?.year !== dobYear) return true;
  return !isAdult18(dob, now);
}

/** The age this page can see: the held birth year and full date, and this tab's screen answer. */
export function readBodyPlayAge(
  store: StorageLike | null,
  dobYear: number | null | undefined = heldYear,
  dob: string | null | undefined = heldDob,
): BodyPlayAge {
  return { dobYear, band: readAge(store), dob };
}
