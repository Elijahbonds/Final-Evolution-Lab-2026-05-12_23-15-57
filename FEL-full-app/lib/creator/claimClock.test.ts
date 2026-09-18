// ONE CLOCK, READ BY BOTH CARD SURFACES (2026-09-13).
//
// The reason this is its own file rather than folded into either caller: the failure it prevents is the two
// surfaces DISAGREEING — a shield on the card face and "measured 8 months ago" on the profile behind it.
// That is only catchable where both read the same function, so the same function is tested once, here.

import { describe, it, expect } from 'vitest';
import { freshnessOf, ageDaysOf, ageLabel, freshnessNote, FRESH_DAYS, EXPIRES_DAYS } from './claimClock';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('the boundaries are exactly where they are documented', () => {
  it('fresh below FRESH_DAYS, stale at it', () => {
    expect(freshnessOf(0)).toBe('fresh');
    expect(freshnessOf(FRESH_DAYS - 1)).toBe('fresh');
    expect(freshnessOf(FRESH_DAYS)).toBe('stale');
  });

  it('stale below EXPIRES_DAYS, expired at it', () => {
    expect(freshnessOf(EXPIRES_DAYS - 1)).toBe('stale');
    expect(freshnessOf(EXPIRES_DAYS)).toBe('expired');
    expect(freshnessOf(10_000)).toBe('expired');
  });
});

describe('ageDaysOf survives what a database actually hands it', () => {
  it('reads an ISO timestamp', () => {
    expect(ageDaysOf(ago(45), NOW)).toBe(45);
  });

  it('a missing or unreadable timestamp is null, NOT zero', () => {
    // zero would read as "measured today", which is the most flattering possible misreading and therefore
    // the one to rule out explicitly
    expect(ageDaysOf(null, NOW)).toBeNull();
    expect(ageDaysOf(undefined, NOW)).toBeNull();
    expect(ageDaysOf('', NOW)).toBeNull();
    expect(ageDaysOf('not a date', NOW)).toBeNull();
  });

  it('a future timestamp clamps to today rather than going negative', () => {
    expect(ageDaysOf(ago(-5), NOW)).toBe(0);
  });
});

describe('the note always says something, including when the number is gone', () => {
  it('fresh states the date without hedging', () => {
    expect(freshnessNote(3)).toBe('Measured 3 days ago.');
  });

  it('stale explicitly says it is not current', () => {
    expect(freshnessNote(120)).toMatch(/not a current reading/i);
    expect(freshnessNote(120)).toMatch(/4 months ago/);
  });

  it('expired talks about WHEN, never about what it said', () => {
    const note = freshnessNote(400);
    expect(note).toMatch(/last measured/i);
    expect(note).toMatch(/nothing current/i);
    expect(note).toMatch(/1 year ago/);
  });

  it('ageLabel rounds the way a person speaks', () => {
    expect(ageLabel(0)).toBe('today');
    expect(ageLabel(1)).toBe('yesterday');
    expect(ageLabel(29)).toBe('29 days ago');
    expect(ageLabel(30)).toBe('1 month ago');
    expect(ageLabel(365)).toBe('1 year ago');
    expect(ageLabel(800)).toBe('2 years ago');
  });
});
