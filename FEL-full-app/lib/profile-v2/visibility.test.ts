import { describe, it, expect } from 'vitest';
import { canViewProfile, effectiveVisibility, viewFor, type VisibilityInput } from './visibility';

// Owner 2026-10-24: friends only, teens private. Adults pick public or friends-only (default friends-only); under-18s
// are always friends-only with no public page; coaches see their athletes. One test per rule.
const now = new Date('2026-10-24T12:00:00Z');
const ADULT = 1990, TEEN = 2010, EIGHTEEN_GAP = 2008;
const base: VisibilityInput = { viewerId: 'stranger', ownerId: 'owner', ownerDobYear: ADULT, ownerChosePublic: false, viewerCoachesOwner: false, viewerIsFriend: false, now };

describe('profile visibility', () => {
  it('the owner always sees their own profile (adult or teen, public or not)', () => {
    expect(canViewProfile({ ...base, viewerId: 'owner' })).toEqual({ allowed: true, as: 'self' });
    expect(canViewProfile({ ...base, viewerId: 'owner', ownerDobYear: TEEN })).toEqual({ allowed: true, as: 'self' });
  });

  it('an adult defaults to friends-only: a stranger and a signed-out visitor see nothing', () => {
    expect(effectiveVisibility(ADULT, false, now)).toBe('friends');
    expect(canViewProfile(base)).toEqual({ allowed: false });
    expect(canViewProfile({ ...base, viewerId: null })).toEqual({ allowed: false });
  });

  it('an adult who chose public is visible to anyone, signed in or not', () => {
    expect(effectiveVisibility(ADULT, true, now)).toBe('public');
    expect(canViewProfile({ ...base, ownerChosePublic: true })).toEqual({ allowed: true, as: 'public' });
    expect(canViewProfile({ ...base, ownerChosePublic: true, viewerId: null })).toEqual({ allowed: true, as: 'public' });
  });

  it('an under-18 is never public, even with a public flag stored (e.g. from before the rule)', () => {
    expect(effectiveVisibility(TEEN, true, now)).toBe('friends');
    expect(canViewProfile({ ...base, ownerDobYear: TEEN, ownerChosePublic: true })).toEqual({ allowed: false });
    expect(canViewProfile({ ...base, ownerDobYear: TEEN, ownerChosePublic: true, viewerId: null })).toEqual({ allowed: false });
  });

  it('an unknown age is treated as under 18, and an exact 18-year gap is not yet an adult', () => {
    expect(canViewProfile({ ...base, ownerDobYear: null, ownerChosePublic: true })).toEqual({ allowed: false });
    expect(canViewProfile({ ...base, ownerDobYear: undefined, ownerChosePublic: true })).toEqual({ allowed: false });
    expect(canViewProfile({ ...base, ownerDobYear: EIGHTEEN_GAP, ownerChosePublic: true })).toEqual({ allowed: false });
  });

  it('a coach sees their athlete, adult or teen, public or not', () => {
    expect(canViewProfile({ ...base, viewerId: 'coach', viewerCoachesOwner: true })).toEqual({ allowed: true, as: 'coach' });
    expect(canViewProfile({ ...base, viewerId: 'coach', viewerCoachesOwner: true, ownerDobYear: TEEN })).toEqual({ allowed: true, as: 'coach' });
  });

  it('a coach relationship needs a signed-in viewer (a flag with no viewer grants nothing)', () => {
    expect(canViewProfile({ ...base, viewerId: null, viewerCoachesOwner: true })).toEqual({ allowed: false });
  });

  it('a friend sees a friends-only profile, adult or teen (no friends list exists yet: the call sites pass false)', () => {
    expect(canViewProfile({ ...base, viewerId: 'pal', viewerIsFriend: true })).toEqual({ allowed: true, as: 'friend' });
    expect(canViewProfile({ ...base, viewerId: 'pal', viewerIsFriend: true, ownerDobYear: TEEN })).toEqual({ allowed: true, as: 'friend' });
  });

  it('nobody but the owner sees the Mirror numbers, opponents’ names or the privacy controls', () => {
    expect(viewFor('self')).toEqual({ progress: true, bests: true, badges: true, squad: true, privacy: true });
    for (const as of ['coach', 'friend', 'public'] as const) {
      expect(viewFor(as)).toMatchObject({ progress: false, squad: false, privacy: false });
    }
  });
});
