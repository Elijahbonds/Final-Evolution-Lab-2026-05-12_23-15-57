// FEL Pro pricing + payment methods (2026-09-12).
import { describe, it, expect } from 'vitest';
import { STRIPE_PRODUCTS } from '../../lib/stripe';
import { paymentMethodsFor, UNAVAILABLE_METHODS, NOT_ON_SUBSCRIPTION } from '../../lib/stripe-payment-methods';
import { FEL_PRO_WEEKLY_USD } from '../../lib/progression/upgradeGate';

describe('two cadences, one entitlement', () => {
  it('weekly is $6 and monthly is $9.99', () => {
    expect(STRIPE_PRODUCTS.FEL_PRO.priceUsd).toBe(600);
    expect(STRIPE_PRODUCTS.FEL_PRO.interval).toBe('week');
    expect(STRIPE_PRODUCTS.FEL_PRO_MONTHLY.priceUsd).toBe(999);
    expect(STRIPE_PRODUCTS.FEL_PRO_MONTHLY.interval).toBe('month');
  });

  it('BOTH grant the same entitlement — a monthly subscriber must not look unsubscribed', () => {
    expect(STRIPE_PRODUCTS.FEL_PRO.product).toBe('FEL_PRO');
    expect(STRIPE_PRODUCTS.FEL_PRO_MONTHLY.product).toBe('FEL_PRO');
  });

  it('the weekly price matches the number shown to players', () => {
    expect(STRIPE_PRODUCTS.FEL_PRO.priceUsd).toBe(FEL_PRO_WEEKLY_USD * 100);
  });

  it('describes what the subscription actually does', () => {
    for (const k of ['FEL_PRO', 'FEL_PRO_MONTHLY'] as const) {
      expect(STRIPE_PRODUCTS[k].description).toMatch(/upgrade/i);
      expect(STRIPE_PRODUCTS[k].description).not.toMatch(/2× LC|2x LC/);
    }
  });
});

describe('payment methods offered are ones Stripe can actually take', () => {
  it('Cash App is on both, because Stripe supports it for both', () => {
    expect(paymentMethodsFor('subscription')).toContain('cashapp');
    expect(paymentMethodsFor('payment')).toContain('cashapp');
  });

  it('Afterpay is one-time only — Stripe does not support BNPL on subscriptions', () => {
    expect(paymentMethodsFor('payment')).toContain('afterpay_clearpay');
    expect(paymentMethodsFor('subscription')).not.toContain('afterpay_clearpay');
    expect(NOT_ON_SUBSCRIPTION.afterpay_clearpay).toBeTruthy();
  });

  it('PayPal is offered on the store, kept off the recurring plan', () => {
    expect(paymentMethodsFor('payment')).toContain('paypal');
    expect(paymentMethodsFor('subscription')).not.toContain('paypal');
  });

  it('Shop Pay is recorded as impossible, not silently dropped', () => {
    expect(UNAVAILABLE_METHODS.shop_pay).toMatch(/Shopify/);
    expect(paymentMethodsFor('payment')).not.toContain('shop_pay');
    expect(paymentMethodsFor('subscription')).not.toContain('shop_pay');
  });

  it('card is always available', () => {
    expect(paymentMethodsFor('subscription')).toContain('card');
    expect(paymentMethodsFor('payment')).toContain('card');
  });

  it('STRIPE_PM_AUTO hands control to the Dashboard without a deploy', () => {
    const prev = process.env.STRIPE_PM_AUTO;
    process.env.STRIPE_PM_AUTO = '1';
    expect(paymentMethodsFor('subscription')).toBeUndefined();
    expect(paymentMethodsFor('payment')).toBeUndefined();
    if (prev === undefined) delete process.env.STRIPE_PM_AUTO; else process.env.STRIPE_PM_AUTO = prev;
  });
});
