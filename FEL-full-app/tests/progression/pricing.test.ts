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
  // SEC-F4 addendum: the default is automatic payment methods — paymentMethodsFor returns
  // undefined, so no payment_method_types is sent and the Dashboard decides (Afterpay,
  // Klarna, Affirm, Apple/Google Pay, Link, Cash App, PayPal can all be switched on there).
  // The fixed lists remain only as the STRIPE_PM_PIN=1 opt-in, which is what the
  // containment assertions below exercise.
  const pin = (fn: () => void) => {
    const prev = process.env.STRIPE_PM_PIN;
    process.env.STRIPE_PM_PIN = '1';
    try { fn(); } finally {
      if (prev === undefined) delete process.env.STRIPE_PM_PIN; else process.env.STRIPE_PM_PIN = prev;
    }
  };

  it('by default nothing is pinned — the Dashboard decides without a deploy', () => {
    const prev = process.env.STRIPE_PM_PIN;
    delete process.env.STRIPE_PM_PIN;
    try {
      expect(paymentMethodsFor('subscription')).toBeUndefined();
      expect(paymentMethodsFor('payment')).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.STRIPE_PM_PIN; else process.env.STRIPE_PM_PIN = prev;
    }
  });

  it('Cash App is on both, because Stripe supports it for both', () => {
    pin(() => {
      expect(paymentMethodsFor('subscription')).toContain('cashapp');
      expect(paymentMethodsFor('payment')).toContain('cashapp');
    });
  });

  it('Afterpay is one-time only — Stripe does not support BNPL on subscriptions', () => {
    pin(() => {
      expect(paymentMethodsFor('payment')).toContain('afterpay_clearpay');
      expect(paymentMethodsFor('subscription')).not.toContain('afterpay_clearpay');
    });
    expect(NOT_ON_SUBSCRIPTION.afterpay_clearpay).toBeTruthy();
  });

  it('PayPal is offered on the store, kept off the recurring plan', () => {
    pin(() => {
      expect(paymentMethodsFor('payment')).toContain('paypal');
      expect(paymentMethodsFor('subscription')).not.toContain('paypal');
    });
  });

  it('Shop Pay is recorded as impossible, not silently dropped', () => {
    expect(UNAVAILABLE_METHODS.shop_pay).toMatch(/Shopify/);
    pin(() => {
      expect(paymentMethodsFor('payment')).not.toContain('shop_pay');
      expect(paymentMethodsFor('subscription')).not.toContain('shop_pay');
    });
  });

  it('card is always available', () => {
    pin(() => {
      expect(paymentMethodsFor('subscription')).toContain('card');
      expect(paymentMethodsFor('payment')).toContain('card');
    });
  });

  it('STRIPE_PM_PIN=1 is the explicit opt-in to the fixed lists', () => {
    const prev = process.env.STRIPE_PM_PIN;
    process.env.STRIPE_PM_PIN = '1';
    expect(paymentMethodsFor('subscription')).toEqual(['card', 'link', 'cashapp']);
    expect(paymentMethodsFor('payment')).toEqual(['card', 'link', 'cashapp', 'afterpay_clearpay', 'klarna', 'paypal']);
    if (prev === undefined) delete process.env.STRIPE_PM_PIN; else process.env.STRIPE_PM_PIN = prev;
  });
});
