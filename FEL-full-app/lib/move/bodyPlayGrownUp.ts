// bodyPlayGrownUp — whether body play must wait for the Mirror's grown-up step (BODY-PLAY-WORKS).
//
// The Mirror's rule, not a new one: under 18, or an age we do not have, is a minor (lib/mirror/youth.ts
// isMinorForMirror — a blank birth year reads as unknown). The Quick Screen's answer in this tab is the same
// step's band (lib/screen/age.ts needsGrownUp). The stricter of the two wins: a screen answer of 18+ does not
// open the camera when a birth year on file still reads as under 18.
//
// The tick itself is the Mirror's GrownUpStep. This file only decides whether that step has to come first.
// It does not start a camera, and it does not write the screen's gate record.
import { isMinorForMirror } from '@/lib/mirror/youth';
import { needsGrownUp, type AgeBand } from '@/lib/screen/age';
import { readAge, type StorageLike } from '@/lib/screen/store';

/** What this page knows about the player's age. A missing band and a missing year are both unknown. */
export interface BodyPlayAge {
  /** Account birth year, when something on the page has it. null and undefined are unknown. */
  dobYear?: number | null;
  /** This tab's Quick Screen answer, when it has one. */
  band?: AgeBand | null;
}

/** Held for the page when a caller already knows the account year. Unset stays unknown. */
let heldYear: number | null | undefined;

export function setBodyPlayDobYear(year: number | null | undefined): void {
  heldYear = year;
}

export function bodyPlayDobYear(): number | null | undefined {
  return heldYear;
}

/**
 * True when the camera has to wait for "A grown-up is with me".
 * Unknown age waits. A known adult (screen band 18+, and no birth year that still reads as under 18) does not.
 */
export function bodyPlayNeedsGrownUp(age: BodyPlayAge, now: Date = new Date()): boolean {
  if (age.band != null && needsGrownUp(age.band)) return true;
  if (age.band === '18+') return typeof age.dobYear === 'number' ? isMinorForMirror(age.dobYear, now) : false;
  return isMinorForMirror(age.dobYear, now);
}

/** The age this page can see: the held birth year, and this tab's screen answer. */
export function readBodyPlayAge(store: StorageLike | null, dobYear: number | null | undefined = heldYear): BodyPlayAge {
  return { dobYear, band: readAge(store) };
}
