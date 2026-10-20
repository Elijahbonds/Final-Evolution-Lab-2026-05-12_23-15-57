// useHeldDobYear — a game page hands the account's birth year to the harness (FN-BOX-1, 2026-10-19).
//
// The fight pages read the year on the server and pass it down; this holds it in bodyPlayGrownUp's page slot, where
// runMode reads it for the body-fight age gate (bodySeam.gateBodyFight). A LAYOUT effect, so the year is held before any
// child's passive effect starts the mode; unmounting puts it back to unknown, so the next page fails closed.
'use client';

import { useLayoutEffect } from 'react';
import { setBodyPlayDob, setBodyPlayDobYear } from './bodyPlayGrownUp';

export function useHeldDobYear(dobYear: number | null | undefined): void {
  useLayoutEffect(() => {
    setBodyPlayDobYear(dobYear);
    return () => setBodyPlayDobYear(undefined);
  }, [dobYear]);
}

/** FN-BOX-1b: the same for the account's full birth date ('YYYY-MM-DD'); null is "no full date on file". */
export function useHeldDob(dob: string | null | undefined): void {
  useLayoutEffect(() => {
    setBodyPlayDob(dob);
    return () => setBodyPlayDob(undefined);
  }, [dob]);
}
