import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BookCheckoutError, assertStripeTestKey, buildBookCheckoutParams, checkoutParamsForOffer } from './bookCheckout';
import { getBook, getOffer } from './bookCatalog';

describe('book checkout', () => {
  it('refuses a live key and accepts a test key', () => {
    expect(() => assertStripeTestKey('')).toThrow(/test-mode only/);
    expect(() => assertStripeTestKey('sk_live_123')).toThrow(/test-mode only/);
    expect(() => assertStripeTestKey('sk_test_123')).not.toThrow();
  });

  it('charges the catalog price, not a caller-supplied amount', () => {
    const params = buildBookCheckoutParams({
      offerId: 'blueprint:ebook',
      origin: 'http://localhost:3000',
      customerEmail: 'buyer@example.com',
      taxEnabled: false,
      paymentMethodTypes: ['card'],
    });
    const item = params.line_items?.[0];
    expect(item && 'price_data' in item && item.price_data?.unit_amount).toBe(999);
    expect(params.metadata).toMatchObject({ product: 'BOOK', offerId: 'blueprint:ebook', format: 'ebook' });
    expect(params.success_url).toBe('http://localhost:3000/press/receipt?session_id={CHECKOUT_SESSION_ID}');
    expect(params.automatic_tax).toBeUndefined();
    expect(params.customer_creation).toBe('always');
    expect(params.customer_email).toBe('buyer@example.com');
  });

  it('turns Stripe Tax on only when asked, and attaches a known customer without also setting an email', () => {
    const book = getBook('blueprint')!;
    const offer = getOffer('blueprint:audiobook')!;
    const params = checkoutParamsForOffer({
      offer,
      book,
      origin: 'https://final-evolution-lab.web.app',
      customerId: 'cus_123',
      customerEmail: 'buyer@example.com',
      taxEnabled: true,
      paymentMethodTypes: ['card'],
    });
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.billing_address_collection).toBe('required');
    expect(params.customer).toBe('cus_123');
    expect(params.customer_email).toBeUndefined();
    expect(params.customer_update).toEqual({ address: 'auto' });
  });

  it('will not sell a Kindle Unlimited ebook, and will sell that title as audio', () => {
    expect(() => buildBookCheckoutParams({
      offerId: 'art-of-dunking:ebook',
      origin: 'http://localhost:3000',
      taxEnabled: false,
      paymentMethodTypes: ['card'],
    })).toThrow(BookCheckoutError);
    const audio = buildBookCheckoutParams({
      offerId: 'art-of-dunking:audiobook',
      origin: 'http://localhost:3000',
      taxEnabled: false,
      paymentMethodTypes: ['card'],
    });
    expect(audio.metadata?.format).toBe('audiobook');
  });

  it('uses a Stripe Price id from the catalog when Elijah has pasted one', () => {
    const book = getBook('blueprint')!;
    const offer = { ...getOffer('blueprint:ebook')!, stripePriceId: 'price_test_123' };
    const params = checkoutParamsForOffer({
      offer,
      book,
      origin: 'http://localhost:3000',
      taxEnabled: false,
      paymentMethodTypes: undefined,
    });
    expect(params.line_items?.[0]).toEqual({ price: 'price_test_123', quantity: 1 });
    expect(params.payment_method_types).toBeUndefined();
  });

  it('the checkout route asserts test mode before it can create a session', () => {
    const src = readFileSync('app/api/books/checkout/route.ts', 'utf8');
    expect(src).toContain('assertStripeTestKey(');
    const download = readFileSync('app/api/books/download/route.ts', 'utf8');
    expect(download).toContain('issueBookFile(');
    expect(download).not.toContain('firebasestorage.googleapis.com');
  });
});
