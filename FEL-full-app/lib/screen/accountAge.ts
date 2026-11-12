// lib/screen/accountAge — EVERY-SCREEN P7 (owner, 2026-11-11): "A signed-in person with a birth date on file skips 'How old
// are you?' in the vertical test and the movement check; the age band comes from the account. Signed-out people, and
// accounts without a birth date, keep the question exactly as it is. The age rules themselves do not change."
//
// The band is the one the rest of the app reads from a full birth date: lib/privacy/tryAgeBand (the 13th and the 18th
// birthdays, exact; 29 February falls on 1 March in a plain year; a date after today is unknown). Nothing new is decided
// here. A missing or unreadable date (or a birth year alone: User.dobYear cannot tell a 17-year-old from an 18-year-old)
// gives null, and the question is asked as before. The answer then goes through the Quick Screen's own age path
// (assess-app.tsx pre(): the session lock that only tightens, the run lock, the kid paths, the camera rule), exactly as
// if it had been tapped.
//
// Pure.
import type { AgeBand } from './age';
import { tryAgeBand } from '@/lib/privacy/tryAgeGate';

/** The account's age band from its full birth date ('YYYY-MM-DD'), or null: then the question is asked. */
export function accountAgeBand(birthDate: string | null | undefined, now: Date = new Date()): AgeBand | null {
  if (!birthDate) return null;
  const band = tryAgeBand(birthDate, now);
  return band === 'unknown' ? null : band;
}
