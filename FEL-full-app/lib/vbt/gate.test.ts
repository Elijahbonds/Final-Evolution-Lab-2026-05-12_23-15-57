// The youth gate: under 13 never, an unknown age not opened, 13–17 technique speed only and nothing kept, adults all.
import { describe, expect, it } from 'vitest';
import { featuresFor, TEEN_E1RM, TEEN_VBT_SAVE, vbtAccess } from './gate';
import { reached } from './milestones';

const NOW = new Date('2026-10-25T12:00:00Z');
const at = (gap: number) => vbtAccess({ signedIn: true, dobYear: 2026 - gap }, NOW);

describe('vbtAccess', () => {
  it('signed out, unknown age, under 13: no camera', () => {
    expect(vbtAccess({ signedIn: false, dobYear: 1990 }, NOW)).toEqual({ ok: false, error: 'sign_in' });
    expect(vbtAccess({ signedIn: true, dobYear: null }, NOW)).toEqual({ ok: false, error: 'age_unknown' });
    for (const gap of [5, 10, 12, 13]) expect(at(gap), `gap ${gap}`).toEqual({ ok: false, error: 'under_13' });
  });

  it('13–17 (a year gap of 14 to 18): teen; 19 and over: adult (the strict verified-adult rule)', () => {
    for (const gap of [14, 15, 17, 18]) expect(at(gap), `gap ${gap}`).toEqual({ ok: true, tier: 'teen' });
    for (const gap of [19, 30, 70]) expect(at(gap), `gap ${gap}`).toEqual({ ok: true, tier: 'adult' });
  });
});

describe('what each tier gets', () => {
  it('a teen: technique speed only — no e1RM/profile, no readiness, no med-ball max, nothing kept', () => {
    expect(TEEN_E1RM).toBe(false);
    expect(TEEN_VBT_SAVE).toBe(false);
    expect(featuresFor('teen')).toEqual({ profile: false, readiness: false, keep: false, medball: false });
    expect(featuresFor('adult')).toEqual({ profile: true, readiness: true, keep: true, medball: true });
  });

  it('a teen earns no loaded max-effort milestone', () => {
    const fast = { lift: 'power_clean' as const, mcv: 1.2, pv: 2.3, release: null, fps: 60 };
    expect(reached(fast, false)).toContain('bar_power_2ms');
    expect(reached(fast, true)).not.toContain('bar_power_2ms');
    expect(reached(fast, true)).toContain('bar_speed_strength');
  });
});
