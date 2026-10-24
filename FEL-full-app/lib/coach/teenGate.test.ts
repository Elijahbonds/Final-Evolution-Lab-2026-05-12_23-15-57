import { beforeEach, describe, expect, it, vi } from 'vitest';

// The day the coach-training consent wording went live (lib/coach/coachConsent.ts). It is null in the real module (the
// wording awaits the owner); each test sets it, so both the fail-closed state of today and the state after go-live are
// pinned.
const cc = vi.hoisted(() => ({ since: null as Date | null }));
vi.mock('./coachConsent', async (orig) => {
  const real = await orig<typeof import('./coachConsent')>();
  return { ...real, coversCoachTraining: (c: { requestedAt: Date }) => real.coversCoachTraining(c, cc.since), coachConsentAskHref: () => real.coachConsentAskHref(cc.since) };
});

import { teenGate, teenGateBody } from './teenGate';
import { COACH_TRAINING_CONSENT_SINCE } from './coachConsent';

const NOW = new Date('2026-10-20T12:00:00Z');
const accepted = (menteeBirthYear?: number) => ({ requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, menteeBirthYear });

/** A go-live day before the fixtures' consents were requested (2026-09-01), so they were asked the new wording. */
const LIVE_BEFORE = new Date('2026-08-01');

describe('owner 2026-10-23, "ask guardians again": only a consent asked under the coach-training wording counts', () => {
  beforeEach(() => { cc.since = null; });

  it('TODAY the wording is not live (null in the real module), so every teen fails closed, accepted consent or not', () => {
    expect(COACH_TRAINING_CONSENT_SINCE).toBeNull();
    for (const y of [2012, 2010, 2008]) expect(teenGate({ dobYear: y, consents: [accepted()] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
    expect(teenGate({ dobYear: null, consents: [accepted(2011)] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
    // adults are unaffected
    expect(teenGate({ dobYear: 2007, consents: [] }, NOW)).toEqual({ ok: true, band: 'adult' });
    // and there is nowhere to send the teen yet: no request could satisfy the gate
    expect(teenGateBody('guardian_consent_required').href).toBeNull();
  });

  it('after go-live, a consent requested BEFORE that day (the old camp-plan wording) still does not count', () => {
    cc.since = new Date('2026-10-01');
    expect(teenGate({ dobYear: 2011, consents: [accepted()] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
    // a new request, accepted, asked under the new wording: counts
    const asked = { requestedAt: new Date('2026-10-05'), acceptedAt: new Date('2026-10-06'), revokedAt: null };
    expect(teenGate({ dobYear: 2011, consents: [accepted(), asked] }, NOW)).toEqual({ ok: true, band: 'teen' });
    expect(teenGateBody('guardian_consent_required').href).toBe('/consent/guardian');
  });
});

describe('teenGate: the year lines the account screen already uses (wording live before the fixtures\' consents)', () => {
  beforeEach(() => { cc.since = LIVE_BEFORE; });
  it('a year gap of 13 or less is under 13 — refused even with a consent', () => {
    expect(teenGate({ dobYear: 2013, consents: [accepted()] }, NOW)).toEqual({ ok: false, error: 'under_13' });
    expect(teenGate({ dobYear: 2020, consents: [] }, NOW)).toEqual({ ok: false, error: 'under_13' });
  });
  it('a gap of 14 through 18 is a teen: consent needed (exactly 18 by year may still be 17)', () => {
    for (const y of [2012, 2010, 2008]) {
      expect(teenGate({ dobYear: y, consents: [] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
      expect(teenGate({ dobYear: y, consents: [accepted()] }, NOW)).toEqual({ ok: true, band: 'teen' });
    }
  });
  it('a gap over 18 is an adult, consent or not', () => {
    expect(teenGate({ dobYear: 2007, consents: [] }, NOW)).toEqual({ ok: true, band: 'adult' });
  });
  it('the newest consent decides: a later pending request or a revoke is not accepted', () => {
    const later = { requestedAt: new Date('2026-10-01'), acceptedAt: null, revokedAt: null };
    expect(teenGate({ dobYear: 2011, consents: [accepted(), later] }, NOW).ok).toBe(false);
    expect(teenGate({ dobYear: 2011, consents: [{ ...accepted(), revokedAt: new Date() }] }, NOW).ok).toBe(false);
  });
  it('blank or impossible years ask for the year; a blank account year takes an accepted consent\'s', () => {
    expect(teenGate({ dobYear: null, consents: [] }, NOW)).toEqual({ ok: false, error: 'age_required' });
    expect(teenGate({ dobYear: 1850, consents: [] }, NOW)).toEqual({ ok: false, error: 'age_required' });
    expect(teenGate({ dobYear: 2031, consents: [] }, NOW)).toEqual({ ok: false, error: 'age_required' });
    expect(teenGate({ dobYear: null, consents: [accepted(2011)] }, NOW)).toEqual({ ok: true, band: 'teen' });
    expect(teenGate({ dobYear: null, consents: [accepted(2015)] }, NOW)).toEqual({ ok: false, error: 'under_13' });
    expect(teenGate({ dobYear: null, consents: [accepted()] }, NOW)).toEqual({ ok: false, error: 'age_required' });
  });
  it('the refusal body says what is needed and where, nothing about the account', () => {
    expect(teenGateBody('guardian_consent_required')).toEqual({ error: 'guardian_consent_required', message: expect.stringContaining('approve coach training'), href: '/consent/guardian' });
    expect(teenGateBody('under_13').href).toBeNull();
    expect(teenGateBody('age_required').href).toBe('/age?next=%2Fcoach');
  });
});
