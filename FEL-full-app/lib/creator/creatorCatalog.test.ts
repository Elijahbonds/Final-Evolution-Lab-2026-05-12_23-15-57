import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_STATS,
  MEDIA_KIT,
  PROFILES,
  approvedProfiles,
  approvedServices,
  coachStoreBookHref,
  getApprovedProfile,
  publicCreatorCopy,
  publicMediaKitHighlight,
  publicMediaKitPackageDetail,
  publicProfileBio,
  publicProfileSpecialty,
  publicServiceDescription,
} from './creatorCatalog';

describe('creator catalog', () => {
  it('publishes only approved profiles, and an unapproved slug looks exactly like an unknown one', () => {
    expect(approvedProfiles().map((p) => p.slug)).toEqual(['elijah-bonds']);
    expect(getApprovedProfile('elijah-bonds')?.name).toBe('Elijah Bonds');
    expect(PROFILES.find((p) => p.slug === 'example-teammate')?.approved).toBe(false);
    expect(getApprovedProfile('example-teammate')).toBeUndefined();
    expect(getApprovedProfile('nobody')).toBeUndefined();
  });

  it('invents no bio, marks every stat and media-kit rate as an example', () => {
    for (const p of PROFILES) {
      expect(p.bio).toBe('Bio placeholder.');
      for (const stat of p.stats) expect(stat.isExample).toBe(true);
    }
    for (const pkg of MEDIA_KIT.packages) expect(pkg.priceIsExample, pkg.id).toBe(true);
    expect(MEDIA_KIT.partnersConfirmed).toBe(false);
    expect(AUDIENCE_STATS.isExample).toBe(true);
  });

  it('keeps fixture placeholders out of public display copy', () => {
    const profile = getApprovedProfile('elijah-bonds')!;
    const [service] = approvedServices(profile);
    if (!service) throw new Error('expected an approved service fixture');
    expect(publicCreatorCopy('Real words', 'Fallback')).toBe('Real words');
    expect(publicCreatorCopy('Bio placeholder.', 'Fallback')).toBe('Fallback');
    expect(publicProfileBio(profile)).not.toMatch(/placeholder/i);
    expect(publicProfileSpecialty(profile)).not.toMatch(/placeholder/i);
    expect(publicServiceDescription(service)).not.toMatch(/placeholder/i);
    expect(publicMediaKitHighlight(MEDIA_KIT.highlights[0])).not.toMatch(/placeholder/i);
    expect(publicMediaKitPackageDetail(MEDIA_KIT.packages[0])).not.toMatch(/placeholder/i);
  });

  it('lists services as information only: no price, no slot, nothing to buy here', () => {
    const profile = getApprovedProfile('elijah-bonds')!;
    expect(approvedServices(profile).length).toBeGreaterThan(0);
    for (const s of PROFILES.flatMap((p) => p.services)) {
      expect(Object.keys(s).sort()).toEqual(['approved', 'description', 'durationMinutes', 'id', 'name', 'profileSlug']);
    }
    for (const p of PROFILES) {
      expect(p).not.toHaveProperty('weeklyHours');
      expect(p).not.toHaveProperty('products');
      expect(p).not.toHaveProperty('ownerEmails');
    }
  });
});

describe('Book buttons go to the existing coach store (adults-only), not a booking engine of our own', () => {
  it('an approved profile in the coach store links to /coach/<slug>', () => {
    expect(coachStoreBookHref(getApprovedProfile('elijah-bonds')!)).toBe('/coach/elijahbonds');
  });

  it('a profile that is unapproved, or not in the coach store, gets no Book link', () => {
    expect(coachStoreBookHref(PROFILES.find((p) => p.slug === 'example-teammate')!)).toBeNull();
    const notInStore = { ...getApprovedProfile('elijah-bonds')!, coachStoreSlug: null };
    expect(coachStoreBookHref(notInStore)).toBeNull();
  });
});
