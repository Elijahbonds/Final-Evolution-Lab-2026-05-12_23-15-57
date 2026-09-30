import { describe, it, expect } from 'vitest';
import {
  activeHealthDataConsent, activeCoachViewConsent, canGrantCoachView, buildHealthConsentView, type ConsentRow,
} from './consent';

const t = (d: string) => new Date(`2026-09-${d}T12:00:00.000Z`);
const row = (over: Partial<ConsentRow>): ConsentRow => ({
  scope: 'health_data', coachId: null, grantedAt: t('01'), revokedAt: null, ...over,
});

describe('activeHealthDataConsent', () => {
  it('is null when there is no health_data row at all', () => {
    expect(activeHealthDataConsent([])).toBeNull();
    expect(activeHealthDataConsent([row({ scope: 'coach_view', coachId: 'c1' })])).toBeNull();
  });

  it('is the row when a health_data grant is live', () => {
    const r = row({ grantedAt: t('05') });
    expect(activeHealthDataConsent([r])).toBe(r);
  });

  it('is null after a withdraw, even though the old row still exists (the ledger is append-only)', () => {
    const withdrawn = row({ grantedAt: t('01'), revokedAt: t('10') });
    expect(activeHealthDataConsent([withdrawn])).toBeNull();
  });

  it('picks the NEWEST live row when a withdraw-then-regrant leaves two rows', () => {
    const first = row({ grantedAt: t('01'), revokedAt: t('05') });
    const second = row({ grantedAt: t('06'), revokedAt: null });
    expect(activeHealthDataConsent([first, second])).toBe(second);
    // order in the array must not matter
    expect(activeHealthDataConsent([second, first])).toBe(second);
  });
});

describe('activeCoachViewConsent', () => {
  it('is scoped to one coach: another coach\'s grant, or a health_data row, never counts', () => {
    const forOther = row({ scope: 'coach_view', coachId: 'coach_b', grantedAt: t('03') });
    const healthData = row({ scope: 'health_data', grantedAt: t('03') });
    expect(activeCoachViewConsent([forOther, healthData], 'coach_a')).toBeNull();
  });

  it('is the live row for that coach', () => {
    const r = row({ scope: 'coach_view', coachId: 'coach_a', grantedAt: t('03') });
    expect(activeCoachViewConsent([r], 'coach_a')).toBe(r);
  });

  it('is null once that coach\'s grant is revoked', () => {
    const r = row({ scope: 'coach_view', coachId: 'coach_a', grantedAt: t('03'), revokedAt: t('04') });
    expect(activeCoachViewConsent([r], 'coach_a')).toBeNull();
  });
});

describe('canGrantCoachView', () => {
  it('requires both live health_data consent AND an active coaching relationship', () => {
    expect(canGrantCoachView(true, true)).toBe(true);
    expect(canGrantCoachView(false, true)).toBe(false);
    expect(canGrantCoachView(true, false)).toBe(false);
    expect(canGrantCoachView(false, false)).toBe(false);
  });
});

describe('buildHealthConsentView', () => {
  it('reflects health_data off and no coaches when the ledger is empty', () => {
    const view = buildHealthConsentView([], []);
    expect(view.healthData).toEqual({ granted: false, grantedAt: null });
    expect(view.coaches).toEqual([]);
  });

  it('lists every active coach, granted or not, and never a coach who is not currently on the roster', () => {
    const consents: ConsentRow[] = [
      row({ grantedAt: t('01') }),
      row({ scope: 'coach_view', coachId: 'coach_a', grantedAt: t('02') }),
    ];
    const view = buildHealthConsentView(consents, [
      { coachId: 'coach_a', name: 'Coach A' },
      { coachId: 'coach_b', name: 'Coach B' },
    ]);
    expect(view.healthData.granted).toBe(true);
    expect(view.coaches).toEqual([
      { coachId: 'coach_a', name: 'Coach A', viewGranted: true, grantedAt: t('02').toISOString() },
      { coachId: 'coach_b', name: 'Coach B', viewGranted: false, grantedAt: null },
    ]);
  });

  it('a coach who no longer coaches this athlete drops out on its own, past grant or not', () => {
    const consents: ConsentRow[] = [row({ scope: 'coach_view', coachId: 'coach_a', grantedAt: t('02') })];
    // coach_a is not in activeCoaches (their CoachClient row ended) -> not listed at all, even though a live grant
    // technically still exists in the ledger. The route is what should also revoke it; this is the read side only.
    expect(buildHealthConsentView(consents, []).coaches).toEqual([]);
  });
});
