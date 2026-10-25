import { describe, expect, it } from 'vitest';
import { groupGate, groupGateBody, squadsConsented, SQUADS_CONSENT_SINCE } from './gates';
import { TEEN_GATE_COPY } from '@/lib/coach/teenGate';

const NOW = new Date(Date.UTC(2026, 9, 25, 18));
const Y = NOW.getFullYear();
const accepted = (requestedAt: Date) => ({ requestedAt, acceptedAt: new Date(requestedAt.getTime() + 1000), revokedAt: null });

describe('the join gates (age, teen, guardian consent)', () => {
  it('nothing covers squads yet: the date is null, so every teen fails closed (owner call)', () => {
    expect(SQUADS_CONSENT_SINCE).toBeNull();
    expect(groupGate('squad', { dobYear: Y - 15, consents: [accepted(new Date(Date.UTC(2026, 9, 1)))] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
  });

  for (const kind of ['team', 'squad'] as const) {
    it(`${kind}: adults yes; under 13 never; a blank year is asked first`, () => {
      expect(groupGate(kind, { dobYear: Y - 30, consents: [] }, NOW)).toEqual({ ok: true, band: 'adult' });
      expect(groupGate(kind, { dobYear: Y - 10, consents: [accepted(new Date(Date.UTC(2026, 9, 1)))] }, NOW)).toEqual({ ok: false, error: 'under_13' });
      expect(groupGate(kind, { dobYear: null, consents: [] }, NOW)).toEqual({ ok: false, error: 'age_required' });
      expect(groupGate(kind, { dobYear: Y - 15, consents: [] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
    });
  }

  it('team: the coach loop\'s teen gate, unchanged (coach-training consent: none live, so teens fail closed)', () => {
    expect(groupGate('team', { dobYear: Y - 15, consents: [accepted(new Date(Date.UTC(2026, 9, 1)))] }, NOW)).toEqual({ ok: false, error: 'guardian_consent_required' });
    expect(groupGateBody('team', 'guardian_consent_required').message).toBe(TEEN_GATE_COPY.guardian_consent_required.message);
  });

  it('squad, once the owner sets the date: a consent asked on or after it lets a teen in; older, revoked or pending do not', () => {
    const since = new Date(Date.UTC(2026, 10, 1));
    const ok = groupGate('squad', { dobYear: Y - 15, consents: [accepted(new Date(Date.UTC(2026, 10, 2)))] }, NOW, since);
    expect(ok).toEqual({ ok: true, band: 'teen' });
    expect(groupGate('squad', { dobYear: Y - 15, consents: [accepted(new Date(Date.UTC(2026, 9, 30)))] }, NOW, since).ok).toBe(false);
    const revoked = { ...accepted(new Date(Date.UTC(2026, 10, 2))), revokedAt: new Date(Date.UTC(2026, 10, 3)) };
    expect(squadsConsented([revoked], since)).toBe(false);
    expect(squadsConsented([{ requestedAt: new Date(Date.UTC(2026, 10, 2)), acceptedAt: null, revokedAt: null }], since)).toBe(false);
    // a blank account year reads the accepted consent's recorded year
    expect(groupGate('squad', { dobYear: null, consents: [{ ...accepted(new Date(Date.UTC(2026, 10, 2))), menteeBirthYear: Y - 15 }] }, NOW, since)).toEqual({ ok: true, band: 'teen' });
  });

  it('the refusal never says what is on file, and offers no link while nothing could satisfy it', () => {
    const b = groupGateBody('squad', 'guardian_consent_required');
    expect(b).toEqual({ error: 'guardian_consent_required', message: 'A parent or guardian needs to approve squads before you can join one.', href: null });
    expect(groupGateBody('squad', 'age_required').href).toBe('/age?next=%2Fsquads');
    expect(JSON.stringify(groupGateBody('squad', 'under_13'))).not.toMatch(/\d{4}/);
  });
});
