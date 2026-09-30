import { describe, expect, it } from 'vitest';
import {
  canUse,
  guardianStatus,
  needsGuardian,
  YOUTH_DAILY_ACTIVITY_TARGET_MINUTES,
  type GuardianConsentLike,
} from './guardianGate';

const NOW = new Date('2026-09-29T00:00:00Z');
const row = (over: Partial<GuardianConsentLike> = {}): GuardianConsentLike => ({
  requestedAt: NOW,
  acceptedAt: null,
  revokedAt: null,
  ...over,
});

describe('needsGuardian', () => {
  it('is true under 18', () => {
    expect(needsGuardian(2015, NOW)).toBe(true); // 11
    expect(needsGuardian(2009, NOW)).toBe(true); // 17
  });

  it('is false at 18 and older', () => {
    expect(needsGuardian(2008, NOW)).toBe(false); // exactly 18 this calendar year
    expect(needsGuardian(1990, NOW)).toBe(false);
  });

  it('is true for a blank birth year — owner decision #20, the same default every other age gate uses', () => {
    expect(needsGuardian(null, NOW)).toBe(true);
    expect(needsGuardian(undefined, NOW)).toBe(true);
  });

  it('defaults `now` to the real clock when omitted', () => {
    expect(needsGuardian(1990)).toBe(false);
    expect(needsGuardian(new Date().getFullYear() - 5)).toBe(true);
  });
});

describe('guardianStatus', () => {
  it('is none with no requests at all', () => {
    expect(guardianStatus([])).toBe('none');
  });

  it('is pending for a request with no acceptedAt and no revokedAt', () => {
    expect(guardianStatus([row()])).toBe('pending');
  });

  it('is accepted once the guardian has used the link', () => {
    expect(guardianStatus([row({ acceptedAt: NOW })])).toBe('accepted');
  });

  it('is revoked when the current request was withdrawn, even if it was accepted first', () => {
    expect(guardianStatus([row({ acceptedAt: NOW, revokedAt: NOW })])).toBe('revoked');
  });

  it('reads only the MOST RECENTLY REQUESTED row, not the most recently accepted one', () => {
    const earlierAccepted = row({ requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02') });
    const laterPending = row({ requestedAt: new Date('2026-09-20'), acceptedAt: null });
    expect(guardianStatus([earlierAccepted, laterPending])).toBe('pending');
    expect(guardianStatus([laterPending, earlierAccepted])).toBe('pending'); // order in the array must not matter
  });

  it('a second request after a revoke reads pending again, not stuck on revoked', () => {
    const revoked = row({ requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: new Date('2026-09-10') });
    const askedAgain = row({ requestedAt: new Date('2026-09-15') });
    expect(guardianStatus([revoked, askedAgain])).toBe('pending');
  });
});

describe('canUse', () => {
  const adult = { dobYear: 1990, consents: [] as GuardianConsentLike[] };
  const minorNoConsent = { dobYear: 2015, consents: [] as GuardianConsentLike[] };
  const minorPending = { dobYear: 2015, consents: [row()] };
  const minorAccepted = { dobYear: 2015, consents: [row({ acceptedAt: NOW })] };
  const minorRevoked = { dobYear: 2015, consents: [row({ acceptedAt: NOW, revokedAt: NOW })] };
  const unknownAge = { dobYear: null, consents: [] as GuardianConsentLike[] };

  it('an adult always passes, with or without any consent on file', () => {
    for (const feature of ['mirror', 'pain_checkin', 'body_play'] as const) {
      expect(canUse(feature, adult, NOW)).toBe(true);
    }
  });

  it('a minor with no request, a pending one, or a revoked one is refused every feature', () => {
    for (const feature of ['mirror', 'pain_checkin', 'body_play'] as const) {
      expect(canUse(feature, minorNoConsent, NOW)).toBe(false);
      expect(canUse(feature, minorPending, NOW)).toBe(false);
      expect(canUse(feature, minorRevoked, NOW)).toBe(false);
    }
  });

  it('a minor with an accepted consent passes every feature — one gate, not a per-feature scope', () => {
    for (const feature of ['mirror', 'pain_checkin', 'body_play'] as const) {
      expect(canUse(feature, minorAccepted, NOW)).toBe(true);
    }
  });

  it('an unknown age (no birth year) is refused like a minor, unless accepted', () => {
    expect(canUse('mirror', unknownAge, NOW)).toBe(false);
    expect(canUse('mirror', { dobYear: null, consents: [row({ acceptedAt: NOW })] }, NOW)).toBe(true);
  });
});

describe('YOUTH_DAILY_ACTIVITY_TARGET_MINUTES', () => {
  it('is the owner’s own number (decision #6) — 60, not the adult WHO figure', () => {
    expect(YOUTH_DAILY_ACTIVITY_TARGET_MINUTES).toBe(60);
  });
});
