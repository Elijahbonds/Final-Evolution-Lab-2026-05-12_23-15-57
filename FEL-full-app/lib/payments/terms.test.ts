// PAYMENTS-READY: the terms tick (the store terms' shape) and the coach terms placeholder.
import { describe, expect, it } from 'vitest';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import {
  BUYER_TERMS, COACH_TERMS_HREF, COACH_TERMS_TEST_PLACEHOLDER, COACH_TERMS_VERSION, checkTerms, coachTermsSigned, coachTermsVersionFor, coachTermsView,
  termsMetadata,
} from './terms';

const NOW = new Date('2026-10-26T12:00:00Z');

describe('checkTerms', () => {
  it('accepts only termsAccepted === true with exactly the expected version, and stamps the time', () => {
    expect(checkTerms({ termsAccepted: true, termsVersion: 'v1' }, 'v1', NOW)).toEqual({ ok: true, accepted: { version: 'v1', acceptedAt: '2026-10-26T12:00:00.000Z' } });
    for (const body of [undefined, null, {}, { termsAccepted: true }, { termsAccepted: 'true', termsVersion: 'v1' }, { termsAccepted: 1, termsVersion: 'v1' }, { termsAccepted: true, termsVersion: 'v0' }, { termsVersion: 'v1' }]) {
      expect(checkTerms(body as never, 'v1', NOW)).toEqual({ ok: false, status: 409, body: { error: 'terms_required', version: 'v1' } });
    }
  });

  it('nothing can be accepted while the expected version is null (terms not written, live mode)', () => {
    expect(checkTerms({ termsAccepted: true, termsVersion: null }, null, NOW)).toEqual({ ok: false, status: 409, body: { error: 'terms_required', version: null } });
  });

  it('metadata: the store terms\' key plus the time, optionally prefixed (the coach\'s account)', () => {
    const a = { version: 'v1', acceptedAt: '2026-10-26T12:00:00.000Z' };
    expect(termsMetadata(a)).toEqual({ terms_version: 'v1', terms_accepted_at: '2026-10-26T12:00:00.000Z' });
    expect(termsMetadata(a, 'coach_')).toEqual({ coach_terms_version: 'v1', coach_terms_accepted_at: '2026-10-26T12:00:00.000Z' });
  });
});

describe('the coach terms are not written yet (owner)', () => {
  it('the constant is null and there is no link: this lane writes no terms text', () => {
    expect(COACH_TERMS_VERSION).toBeNull();
    expect(COACH_TERMS_HREF).toBeNull();
    expect(coachTermsSigned()).toBe(false);
  });

  it('test mode runs on a placeholder no live account can carry; live mode accepts nothing', () => {
    expect(coachTermsVersionFor(false)).toBe(COACH_TERMS_TEST_PLACEHOLDER);
    expect(coachTermsVersionFor(true)).toBeNull();
    expect(coachTermsView(true)).toEqual({ version: null, href: null, signed: false });
    expect(coachTermsView(false)).toEqual({ version: COACH_TERMS_TEST_PLACEHOLDER, href: null, signed: false });
  });

  it('once signed, both modes ask for the signed version and link it', () => {
    expect(coachTermsVersionFor(true, 'coach-terms-2026-11-01')).toBe('coach-terms-2026-11-01');
    expect(coachTermsVersionFor(false, 'coach-terms-2026-11-01')).toBe('coach-terms-2026-11-01');
    expect(coachTermsView(true, 'coach-terms-2026-11-01', '/coach-terms')).toEqual({ version: 'coach-terms-2026-11-01', href: '/coach-terms', signed: true });
  });
});

it('buyers tick the store terms (assumption until the owner points them elsewhere)', () => {
  expect(BUYER_TERMS.coach_package).toEqual({ version: STORE_TERMS_VERSION, href: '/store-terms' });
  expect(BUYER_TERMS.fel_pro).toEqual({ version: STORE_TERMS_VERSION, href: '/store-terms' });
});
