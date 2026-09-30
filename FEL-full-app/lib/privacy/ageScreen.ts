// lib/privacy/ageScreen.ts — AGE-SCREEN: the birth-year rule, the block flag, and the copy.
//
// Pure on purpose: no React, no prisma, no next/*, no console. The sign-up form and the server routes share one
// outcome, and client components import this file, so it must not drag a server runtime into the browser bundle.
// The adult line is verifiedAdult's (a year gap of more than 18). The cutoff numbers live only in this function;
// nothing here is rendered as an age, a reason, or a "come back when".

import { verifiedAdult } from './verifiedAdult';

/** One-year block flag. A constant only: no age, no year, no account or guest id, no timestamp. */
export const AGE_BLOCK_COOKIE = 'fel_age_gate';
export const AGE_BLOCK_VALUE = '1';
export const AGE_BLOCK_MAX_AGE = 31536000;
export const AGE_BLOCK_STORAGE_KEY = 'fel:ageGate';

export const AGE_QUESTION = 'What year were you born?';
export const AGE_TURN_AWAY = "Sorry, we can't create an account for you right now.";
export const AGE_INVALID = 'Choose a year from the list.';

const EARLIEST_BIRTH_YEAR = 1900;

/** This calendar year down to 1900, newest first. No default — callers render a disabled placeholder. */
export function birthYearOptions(now: Date = new Date()): number[] {
  const thisYear = now.getFullYear();
  const years: number[] = [];
  for (let year = thisYear; year >= EARLIEST_BIRTH_YEAR; year--) years.push(year);
  return years;
}

export type AgeScreenOutcome = 'blocked' | 'teen' | 'adult' | 'invalid';

/**
 * 'invalid' unless an integer from 1900 through this year. 'blocked' when the gap is 13 or less (the year that
 * turns 13 this calendar year is under 13 — in 2026, 2013). 'teen' for a gap of 14 through 18. 'adult' when
 * verifiedAdult says so (gap more than 18). No month.
 */
export function ageScreenOutcome(year: unknown, now: Date = new Date()): AgeScreenOutcome {
  if (typeof year !== 'number' || !Number.isInteger(year)) return 'invalid';
  const thisYear = now.getFullYear();
  if (year < EARLIEST_BIRTH_YEAR || year > thisYear) return 'invalid';
  if (thisYear - year <= 13) return 'blocked';
  if (verifiedAdult(year, now)) return 'adult';
  return 'teen';
}

/**
 * The Set-Cookie header for the block flag. Takes no arguments. Max-Age only (never Expires). Path=/, SameSite=Lax,
 * Secure in production, not httpOnly. The value is the constant `1`.
 */
export function ageBlockCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AGE_BLOCK_COOKIE}=${AGE_BLOCK_VALUE}; Max-Age=${AGE_BLOCK_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}
