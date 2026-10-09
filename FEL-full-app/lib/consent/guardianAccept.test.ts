// MIRROR-COACH P6 (2026-09-29): the rule for who may accept a PLAYER-REQUESTED guardian consent
// (lib/consent/guardianAccept.ts). Pure — the route tests over a fake Prisma live in
// tests/camp/consent-guardian-residual.test.ts; this file pins the decision itself, including its ORDER.
import { describe, expect, it } from 'vitest';
import { decidePlayerAccept, isSelfRequest, plausibleBirthYear, playerAcceptStep, PLAYER_ACCEPT_REFUSALS } from './guardianAccept';
import { isMinorForMirror } from '../mirror/youth';

const NOW = new Date('2026-09-29T12:00:00Z');
const Y = NOW.getFullYear();
const base = { menteeId: 'mentee-1' };

describe('decidePlayerAccept — the three requirements, in order', () => {
  it('signed out is refused (401) — the path P5 could not close', () => {
    expect(decidePlayerAccept({ ...base, callerId: null, callerDobYear: null }, NOW)).toEqual({ ok: false, error: 'guardian_sign_in_required', status: 401 });
    // even with an adult year typed: there is no account to have declared it
    expect(decidePlayerAccept({ ...base, callerId: null, callerDobYear: null, declaredBirthYear: 1980 }, NOW)).toMatchObject({ ok: false, error: 'guardian_sign_in_required' });
  });

  it('the mentee is refused BEFORE any birth year is read or declared — a blank-dob minor cannot declare their way past', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'mentee-1', callerDobYear: null, declaredBirthYear: 1980 }, NOW))
      .toEqual({ ok: false, error: 'self_accept_blocked', status: 403 });
    expect(decidePlayerAccept({ ...base, callerId: 'mentee-1', callerDobYear: 1980 }, NOW)).toMatchObject({ error: 'self_accept_blocked' });
  });

  it('a second account whose stored birth year reads as a minor is refused', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'alt-1', callerDobYear: Y - 14 }, NOW)).toEqual({ ok: false, error: 'guardian_not_adult', status: 403 });
  });

  it('a stored minor birth year cannot be argued with by a typed adult one (never overwritten)', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'alt-1', callerDobYear: Y - 14, declaredBirthYear: 1980 }, NOW)).toMatchObject({ error: 'guardian_not_adult' });
  });

  it('a blank birth year with nothing typed asks for one', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: null }, NOW)).toEqual({ ok: false, error: 'guardian_birth_year_required', status: 403 });
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: undefined, declaredBirthYear: '' }, NOW)).toMatchObject({ error: 'guardian_birth_year_required' });
  });

  it('a typed year that is not a plausible year is 400, not a guess', () => {
    for (const bad of [1899, Y + 1, 1984.5, 'abcd', '84', {}, NaN]) {
      expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: null, declaredBirthYear: bad }, NOW), String(bad)).toEqual({ ok: false, error: 'birth_year_invalid', status: 400 });
    }
  });

  it('a typed year that reads as a minor is refused and NOT marked for writing', () => {
    const d = decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: null, declaredBirthYear: Y - 12 }, NOW);
    expect(d).toEqual({ ok: false, error: 'guardian_not_adult', status: 403 });
    expect('declareDobYear' in d).toBe(false);
  });

  it('an adult with a birth year on file is accepted and recorded; nothing is declared', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: 1980 }, NOW)).toEqual({ ok: true, acceptedById: 'g-1', declareDobYear: null });
    // a typed year alongside a stored one is ignored, not written
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: 1980, declaredBirthYear: 1970 }, NOW)).toEqual({ ok: true, acceptedById: 'g-1', declareDobYear: null });
  });

  it('a blank account that types an adult year is accepted, and that year is marked to write (only-when-blank is the route\'s job)', () => {
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: null, declaredBirthYear: 1984 }, NOW)).toEqual({ ok: true, acceptedById: 'g-1', declareDobYear: 1984 });
    expect(decidePlayerAccept({ ...base, callerId: 'g-1', callerDobYear: null, declaredBirthYear: ' 1984 ' }, NOW)).toMatchObject({ ok: true, declareDobYear: 1984 });
  });
});

describe('the adult line is isMinorForMirror\'s own, never a second age rule', () => {
  it('agrees with isMinorForMirror for every birth year from 1900 to this year, stored or declared', () => {
    for (let year = 1900; year <= Y; year++) {
      const stored = decidePlayerAccept({ ...base, callerId: 'g', callerDobYear: year }, NOW);
      const declared = decidePlayerAccept({ ...base, callerId: 'g', callerDobYear: null, declaredBirthYear: year }, NOW);
      expect(stored.ok, `stored ${year}`).toBe(!isMinorForMirror(year, NOW));
      expect(declared.ok, `declared ${year}`).toBe(!isMinorForMirror(year, NOW));
    }
  });

  it('flagged: the boundary year (this year − 18) is REFUSED — year-only, the careful side, as isMinorForMirror reads it', () => {
    // isMinorForMirror counts "now − year > 18" as adult, so someone born in (Y − 18) — who may still be 17 — reads as a
    // minor. A genuinely 18-year-old guardian born late in that year is turned away; that is the shared rule, not this file's.
    expect(decidePlayerAccept({ ...base, callerId: 'g', callerDobYear: Y - 18 }, NOW)).toMatchObject({ ok: false, error: 'guardian_not_adult' });
    expect(decidePlayerAccept({ ...base, callerId: 'g', callerDobYear: Y - 19 }, NOW)).toMatchObject({ ok: true });
  });
});

describe('playerAcceptStep — the page asks the same function', () => {
  it('maps every pre-tap state to one screen', () => {
    expect(playerAcceptStep({ ...base, callerId: null, callerDobYear: null }, NOW)).toBe('sign_in');
    expect(playerAcceptStep({ ...base, callerId: 'mentee-1', callerDobYear: null }, NOW)).toBe('is_mentee');
    expect(playerAcceptStep({ ...base, callerId: 'g', callerDobYear: null }, NOW)).toBe('declare_birth_year');
    expect(playerAcceptStep({ ...base, callerId: 'g', callerDobYear: Y - 15 }, NOW)).toBe('not_adult');
    expect(playerAcceptStep({ ...base, callerId: 'g', callerDobYear: 1980 }, NOW)).toBe('confirm');
  });
});

describe('small pieces', () => {
  it('every refusal carries the status the route answers with', () => {
    expect(PLAYER_ACCEPT_REFUSALS).toEqual({
      guardian_sign_in_required: 401, self_accept_blocked: 403, birth_year_invalid: 400, guardian_birth_year_required: 403, guardian_not_adult: 403,
    });
  });

  it('plausibleBirthYear uses the request route\'s own bounds (1900..this year)', () => {
    expect(plausibleBirthYear(1900, NOW)).toBe(1900);
    expect(plausibleBirthYear(Y, NOW)).toBe(Y);
    expect(plausibleBirthYear(1899, NOW)).toBeNull();
    expect(plausibleBirthYear(Y + 1, NOW)).toBeNull();
    expect(plausibleBirthYear(null, NOW)).toBeNull();
  });

  it('isSelfRequest is the mentee asking for themselves, nothing else', () => {
    expect(isSelfRequest('u1', 'u1')).toBe(true);
    expect(isSelfRequest('u1', 'fac-1')).toBe(false);
  });
});
