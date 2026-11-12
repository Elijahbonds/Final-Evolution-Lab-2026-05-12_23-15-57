import { describe, it, expect } from 'vitest';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { profileGates, scanSaveUserWhere, verifiedAdultUserWhere, SCAN_SAVE_SCOPE } from './gate';

// The query-side gate is only safe if it matches the JS rule for EVERY year: a Prisma `where` that let one more birth
// year through would hand the page a 17-year-old's rows.
const matches = (where: { dobYear: { gte: number; lte: number } }, year: number | null) =>
  year !== null && year >= where.dobYear.gte && year <= where.dobYear.lte;

describe('verifiedAdultUserWhere matches verifiedAdult', () => {
  for (const now of [new Date('2026-01-01T00:00:00Z'), new Date('2026-10-24T12:00:00Z'), new Date('2031-12-31T12:00:00Z')]) {
    it(`for every birth year, as of ${now.toISOString().slice(0, 10)}`, () => {
      const w = verifiedAdultUserWhere(now);
      for (let y = 1880; y <= now.getFullYear() + 2; y++) expect(matches(w, y)).toBe(verifiedAdult(y, now));
      expect(matches(w, null)).toBe(verifiedAdult(null, now));
    });
  }
  it('a year gap of exactly 18 is not an adult (it may still be a 17-year-old)', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(matches(verifiedAdultUserWhere(now), 2008)).toBe(false);
    expect(matches(verifiedAdultUserWhere(now), 2007)).toBe(true);
  });
});

describe('scanSaveUserWhere', () => {
  it('is the adult rule AND a live jump_numbers opt-in', () => {
    const now = new Date('2026-10-24T00:00:00Z');
    expect(scanSaveUserWhere(now)).toEqual({
      dobYear: { gte: 1900, lte: 2007 },
      scanSaveOptIn: { is: { scope: SCAN_SAVE_SCOPE, granted: true, revokedAt: null } },
    });
  });
});

describe('profileGates (the JS side, from the same batch)', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const live = { scope: 'jump_numbers', granted: true, revokedAt: null };
  it('adult + live opt-in can save', () => expect(profileGates(1990, live, now)).toEqual({ adult: true, canSaveScan: true, minorOrUnknown: false }));
  it('adult without an opt-in cannot', () => expect(profileGates(1990, null, now).canSaveScan).toBe(false));
  it('a revoked, ungranted or wrong-scope opt-in is off', () => {
    expect(profileGates(1990, { ...live, revokedAt: new Date() }, now).canSaveScan).toBe(false);
    expect(profileGates(1990, { ...live, granted: false }, now).canSaveScan).toBe(false);
    expect(profileGates(1990, { ...live, scope: 'other' }, now).canSaveScan).toBe(false);
  });
  it('a teen with an opt-in row still cannot save, and is teen-safe', () => expect(profileGates(2010, live, now)).toEqual({ adult: false, canSaveScan: false, minorOrUnknown: true }));
  it('an unknown age is treated as a minor', () => expect(profileGates(null, live, now)).toEqual({ adult: false, canSaveScan: false, minorOrUnknown: true }));
});
