// PAYMENTS-READY: PURCHASES_ALLOWLIST under VIRTUAL_PURCHASES_ENABLED. Unset = exactly today's switch; set = only those.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allowlistPermits, isPurchaseOpen, openProducts, parseAllowlist, PURCHASE_PRODUCTS, STRIPE_CHECKOUT_PRODUCT, unknownAllowlistEntries,
} from './allowlist';

const ON = { VIRTUAL_PURCHASES_ENABLED: '1' };

describe('unset: behaviour exactly as today', () => {
  it('every product follows VIRTUAL_PURCHASES_ENABLED alone', () => {
    for (const p of PURCHASE_PRODUCTS) {
      expect(isPurchaseOpen(p, {})).toBe(false);
      expect(isPurchaseOpen(p, ON)).toBe(true);
      expect(isPurchaseOpen(p, { ...ON, PURCHASES_ALLOWLIST: '' })).toBe(true);
      expect(isPurchaseOpen(p, { ...ON, PURCHASES_ALLOWLIST: '  ,  ' })).toBe(true);
    }
    // an unknown /api/stripe/checkout product passes the fence as before (the route then answers 400 Unknown product)
    expect(isPurchaseOpen(null, ON)).toBe(true);
    expect(parseAllowlist({})).toBeNull();
  });

  it('the switch parse is lib/flags.ts\'s (1/true/on/yes, any case, trimmed)', () => {
    for (const v of ['1', 'true', 'ON', ' yes ']) expect(isPurchaseOpen('fel_pro', { VIRTUAL_PURCHASES_ENABLED: v })).toBe(true);
    for (const v of ['', '0', 'false', 'off', 'nope']) expect(isPurchaseOpen('fel_pro', { VIRTUAL_PURCHASES_ENABLED: v })).toBe(false);
  });
});

describe('set: only the listed products sell', () => {
  const env = { ...ON, PURCHASES_ALLOWLIST: 'FEL_PRO, coins ,season_pass' };
  it('listed products open, every other one is closed, an unknown product is closed', () => {
    expect(parseAllowlist(env)).toEqual(['fel_pro', 'coins', 'season_pass']);
    expect(openProducts(env)).toEqual(['fel_pro', 'coins', 'season_pass']);
    for (const p of PURCHASE_PRODUCTS) expect(isPurchaseOpen(p, env)).toBe(['fel_pro', 'coins', 'season_pass'].includes(p));
    expect(isPurchaseOpen(null, env)).toBe(false);
  });

  it('the list never opens anything while VIRTUAL_PURCHASES_ENABLED is off', () => {
    expect(openProducts({ PURCHASES_ALLOWLIST: 'fel_pro' })).toEqual([]);
    expect(isPurchaseOpen('fel_pro', { PURCHASES_ALLOWLIST: 'fel_pro' })).toBe(false);
    expect(allowlistPermits('fel_pro', { PURCHASES_ALLOWLIST: 'fel_pro' })).toBe(true);
  });

  it('a typo opens nothing and is named', () => {
    const typo = { ...ON, PURCHASES_ALLOWLIST: 'felpro,coins' };
    expect(isPurchaseOpen('fel_pro', typo)).toBe(false);
    expect(unknownAllowlistEntries(typo)).toEqual(['felpro']);
    expect(unknownAllowlistEntries(env)).toEqual([]);
  });

  it('both FEL Pro cadences are one product; every /api/stripe/checkout product has an id', () => {
    expect(STRIPE_CHECKOUT_PRODUCT.FEL_PRO).toBe('fel_pro');
    expect(STRIPE_CHECKOUT_PRODUCT.FEL_PRO_MONTHLY).toBe('fel_pro');
    for (const id of Object.values(STRIPE_CHECKOUT_PRODUCT)) expect(PURCHASE_PRODUCTS).toContain(id);
  });
});

describe('every real-money route outside the coach store asks the allow list (source)', () => {
  const ROOT = join(__dirname, '../..');
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
  it.each([
    ['app/api/stripe/checkout/route.ts', /isPurchaseOpen\(STRIPE_CHECKOUT_PRODUCT\[product\]/],
    ['app/api/season/checkout/route.ts', /isPurchaseOpen\('season_pass'\)/],
    ['app/api/studio/credits/route.ts', /isPurchaseOpen\('studio_credits'\)/],
    ['app/api/v1/wallet/checkout/route.ts', /allowlistPermits\('coins'\)/],
    ['app/api/v1/wallet/shard-checkout/route.ts', /allowlistPermits\('shards'\)/],
    ['app/api/v1/wallet/config/route.ts', /allowlistPermits\('coins'\)/],
    ['lib/books/bookCheckout.ts', /allowlistPermits\('books', env\)/],
    ['lib/signature/server.ts', /isPurchaseOpen\('fel_pro'\)/],
  ])('%s', (file, re) => {
    const src = read(file);
    expect(src).toMatch(re);
    // the old all-or-nothing read is gone from the gate itself
    expect(src).not.toMatch(/if \(!isVirtualPurchasesEnabled\(\)\)/);
  });
});
