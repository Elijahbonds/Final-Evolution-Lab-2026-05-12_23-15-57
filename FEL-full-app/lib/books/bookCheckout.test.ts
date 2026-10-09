import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BookCheckoutError,
  assertStripeTestKey,
  bookCheckoutGate,
  bookSharesPlatformStripeAccount,
  buildBookCheckoutParams,
  checkoutParamsForOffer,
} from './bookCheckout';
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

  it('the checkout route runs the gate before it can create a session', () => {
    // test changed (2026-10-09): was toContain('assertStripeTestKey('). The route now asks bookCheckoutGate(), which
    // refuses a non-sk_test_ key itself (pinned below) as a 409 store_closed, and getBookStripe still asserts.
    const src = readFileSync('app/api/books/checkout/route.ts', 'utf8');
    const gateAt = src.indexOf('bookCheckoutGate()');
    expect(gateAt).toBeGreaterThan(0);
    expect(src.indexOf('getBookStripe()')).toBeGreaterThan(gateAt);
    expect(src).not.toContain("req.headers.get('origin')");
    const download = readFileSync('app/api/books/download/route.ts', 'utf8');
    expect(download).toContain('issueBookFile(');
    expect(download).not.toContain('firebasestorage.googleapis.com');
  });
});

describe('book checkout gate (the release store rules: B2 store_closed, B3 server origin, B10 fence)', () => {
  const open = { STRIPE_BOOKS_SECRET_KEY: 'sk_test_b', VIRTUAL_PURCHASES_ENABLED: '1', NEXTAUTH_URL: 'https://fel.example/' } as NodeJS.ProcessEnv;

  it('opens only with a test key, the B10 fence on, and a configured site URL', () => {
    expect(bookCheckoutGate(open)).toEqual({ ok: true, key: 'sk_test_b', origin: 'https://fel.example' });
  });

  it('answers a store_closed reason for each missing piece, in order', () => {
    expect(bookCheckoutGate({} as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: 'payments_not_set_up' });
    expect(bookCheckoutGate({ ...open, STRIPE_BOOKS_SECRET_KEY: 'sk_live_x' })).toEqual({ ok: false, reason: 'live_mode_off' });
    expect(bookCheckoutGate({ ...open, STRIPE_BOOKS_SECRET_KEY: 'rk_test_x' })).toEqual({ ok: false, reason: 'live_mode_off' });
    expect(bookCheckoutGate({ ...open, VIRTUAL_PURCHASES_ENABLED: '' })).toEqual({ ok: false, reason: 'virtual_purchases_off' });
    expect(bookCheckoutGate({ ...open, NEXTAUTH_URL: ' ' })).toEqual({ ok: false, reason: 'site_url_not_set' });
  });

  it('a live platform key never opens books, even with the coach store live', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_p', COACH_STORE_LIVE: '1', VIRTUAL_PURCHASES_ENABLED: '1', NEXTAUTH_URL: 'https://x' } as NodeJS.ProcessEnv;
    expect(bookCheckoutGate(env)).toEqual({ ok: false, reason: 'live_mode_off' });
  });

  it('reuses the platform StripeCustomer only when books charge through the platform account', () => {
    expect(bookSharesPlatformStripeAccount({ STRIPE_SECRET_KEY: 'sk_test_p' } as NodeJS.ProcessEnv)).toBe(true);
    expect(bookSharesPlatformStripeAccount({ STRIPE_SECRET_KEY: 'sk_test_p', STRIPE_BOOKS_SECRET_KEY: 'sk_test_p' } as NodeJS.ProcessEnv)).toBe(true);
    expect(bookSharesPlatformStripeAccount({ STRIPE_SECRET_KEY: 'sk_test_p', STRIPE_BOOKS_SECRET_KEY: 'sk_test_b' } as NodeJS.ProcessEnv)).toBe(false);
  });
});
