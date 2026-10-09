import { describe, expect, it } from 'vitest';
import {
  MEDIA_KIT,
  PROFILES,
  approvedProducts,
  approvedProfiles,
  approvedServices,
  getApprovedProfile,
  getBookableService,
} from './creatorCatalog';

describe('creator catalog', () => {
  it('publishes only approved profiles, and an unapproved slug looks exactly like an unknown one', () => {
    expect(approvedProfiles().map((p) => p.slug)).toEqual(['elijah-bonds']);
    expect(getApprovedProfile('elijah-bonds')?.name).toBe('Elijah Bonds');
    expect(PROFILES.find((p) => p.slug === 'example-teammate')?.approved).toBe(false);
    expect(getApprovedProfile('example-teammate')).toBeUndefined();
    expect(getApprovedProfile('nobody')).toBeUndefined();
  });

  it('cannot book a service on an unapproved profile', () => {
    expect(getBookableService('elijah-bonds:session-60')?.service.durationMinutes).toBe(60);
    expect(getBookableService('example-teammate:session-60')).toBeUndefined();
  });

  it('marks every price and rate as an example, and invents no bio', () => {
    for (const p of PROFILES) {
      expect(p.bio).toBe('Bio placeholder.');
      for (const s of p.services) expect(s.priceIsExample, s.id).toBe(true);
      for (const prod of p.products) expect(prod.priceIsExample, prod.id).toBe(true);
      for (const stat of p.stats) expect(stat.isExample).toBe(true);
      expect(p.hoursAreExample).toBe(true);
    }
    for (const pkg of MEDIA_KIT.packages) expect(pkg.priceIsExample, pkg.id).toBe(true);
    expect(MEDIA_KIT.partnersConfirmed).toBe(false);
  });

  it('gives every product a fulfillment provider and hides unapproved ones', () => {
    const profile = getApprovedProfile('elijah-bonds')!;
    for (const p of profile.products) expect(['printful', 'printify', 'manual']).toContain(p.provider);
    const shown = approvedProducts(profile).map((p) => p.id);
    expect(shown).toEqual(['fel-hoodie-m', 'fel-hoodie-w', 'fel-tee', 'fel-hat', 'fel-joggers']);
    expect(shown).not.toContain('signed-basketball');
    expect(approvedServices(profile).length).toBeGreaterThan(0);
  });
});
