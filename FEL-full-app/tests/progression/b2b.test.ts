// B2B lane pricing + the safeguarding carve-out (2026-09-12).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRIPE_PRODUCTS } from '../../lib/stripe';
import { NEVER_GATED, isNeverGated, b2bPaywall } from '../../lib/pro-guard';

describe('the B2B tiers', () => {
  it('prices a single credentialed facilitator and an organisation', () => {
    expect(STRIPE_PRODUCTS.FEL_COACH.priceUsd).toBe(3900);
    expect(STRIPE_PRODUCTS.FEL_FACILITY.priceUsd).toBe(19900);
    expect(STRIPE_PRODUCTS.FEL_COACH.interval).toBe('month');
  });
  it('keeps them distinct entitlements, unlike the two Pro cadences', () => {
    expect(STRIPE_PRODUCTS.FEL_COACH.product).toBe('FEL_COACH');
    expect(STRIPE_PRODUCTS.FEL_FACILITY.product).toBe('FEL_FACILITY');
  });
  it('names the tier and its price in the paywall body', () => {
    const b = b2bPaywall('Camp mentees', 'coach', 'free thing');
    expect(b.tier).toBe('coach');
    expect(b.message).toContain('39');
    expect(b.free).toBe('free thing');
  });
});

describe('SAFEGUARDING IS NEVER PAYWALLED', () => {
  it('consent and revoke are on the never-gated list', () => {
    expect(NEVER_GATED).toContain('/api/v1/camp/consent');
    expect(NEVER_GATED).toContain('/api/v1/camp/revoke');
    expect(isNeverGated('/api/v1/camp/consent')).toBe(true);
    expect(isNeverGated('/api/v1/camp/revoke/anything')).toBe(true);
    expect(isNeverGated('/api/v1/camp/mentees')).toBe(false);
  });

  // The real assertion: the source itself must not contain the gate. A list is a promise;
  // this checks the promise was kept, and fails loudly if someone "simplifies" later.
  it('the consent route contains NO payment gate, in source', () => {
    const src = readFileSync('app/api/v1/camp/consent/route.ts', 'utf8');
    expect(src).not.toContain('requirePaidFacilitator');
    expect(src).not.toContain('PAYWALL_STATUS');
  });

  it('the revoke route contains NO payment gate, in source', () => {
    const src = readFileSync('app/api/v1/camp/revoke/route.ts', 'utf8');
    expect(src).not.toContain('requirePaidFacilitator');
    expect(src).not.toContain('PAYWALL_STATUS');
  });

  it('the routes that DO sell are gated, so this is not vacuous', () => {
    for (const r of ['mentees', 'plans', 'assess', 'sessions']) {
      const src = readFileSync(`app/api/v1/camp/${r}/route.ts`, 'utf8');
      expect(src, `${r} should be gated`).toContain('requirePaidFacilitator');
    }
  });
});

describe('the CRM is not a product', () => {
  it('stays admin-only rather than being sold as a tier', () => {
    const src = readFileSync('lib/crm/helpers.ts', 'utf8');
    expect(src).toContain('admin');
    // no customer-facing entitlement check was bolted onto an internal tool
    expect(src).not.toContain('isFacilityUser');
  });
});
