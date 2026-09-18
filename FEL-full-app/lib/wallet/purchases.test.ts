import { describe, expect, it } from 'vitest';
import { purchasesEnabledFromEnv, shardSaleCopy } from './purchases';

// FEATURES-UX-SHOP: one truth. Whatever the flag says, no surface may claim the opposite.
describe('purchases truth', () => {
  it('is enabled only when Stripe is configured', () => {
    expect(purchasesEnabledFromEnv({})).toBe(false);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: '' })).toBe(false);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x' })).toBe(true);
  });

  it('never says "sold" while purchases are off, never says "coming soon" while they are on', () => {
    const off = shardSaleCopy(false);
    for (const s of Object.values(off)) expect(s.toLowerCase()).not.toMatch(/\bsold\b|\bbuy\b/);
    expect(off.badge).toBe('Coming soon');
    expect(off.shardBuyLabel).toBe('Coming soon');
    expect(off.coinStoreShards).toMatch(/not on sale yet/);

    const on = shardSaleCopy(true);
    for (const s of Object.values(on)) expect(s.toLowerCase()).not.toMatch(/coming soon|not on sale/);
    expect(on.badge).toBe('');
    expect(on.shardBuyLabel).toBe('Buy');
    expect(on.coinStoreShards).toMatch(/sold in the Shard Store/);
  });

  it('stays neutral before the server answers', () => {
    const pending = shardSaleCopy(null);
    for (const s of Object.values(pending)) expect(s.toLowerCase()).not.toMatch(/coming soon|not on sale|\bsold\b|bought/);
    expect(pending.badge).toBe('');
  });
});
