import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BookCheckoutError,
  assertStripeTestKey,
  bookCheckoutGate,
  bookStoreEnabled,
  bookStripeSecret,
  buildBookCheckoutParams,
  checkoutParamsForOffer,
} from './bookCheckout';
import { getBook, getOffer } from './bookCatalog';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { CLOSED_POLICY, EBOOK_ENABLED_POLICY } from '@/tests/helpers/bookTermsPolicies';

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
      policy: EBOOK_ENABLED_POLICY,
    });
    const item = params.line_items?.[0];
    expect(item && 'price_data' in item && item.price_data?.unit_amount).toBe(999);
    const productDescription = item && 'price_data' in item ? item.price_data?.product_data?.description : '';
    expect(productDescription).toContain('Price is marked example pending final approval.');
    expect(productDescription).not.toMatch(/placeholder/i);
    expect(params.metadata).toMatchObject({ product: 'BOOK', offerId: 'blueprint:ebook', format: 'ebook', terms_version: STORE_TERMS_VERSION });
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
      policy: EBOOK_ENABLED_POLICY,
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
      policy: EBOOK_ENABLED_POLICY,
    });
    expect(params.line_items?.[0]).toEqual({ price: 'price_test_123', quantity: 1 });
    expect(params.payment_method_types).toBeUndefined();
  });

  it('the terms rule: audiobook sells, ebook and bundle are refused with format_not_offered, a closed policy sells nothing', () => {
    const args = { origin: 'http://localhost:3000', taxEnabled: false, paymentMethodTypes: ['card'] };
    expect(buildBookCheckoutParams({ ...args, offerId: 'blueprint:audiobook' }).metadata?.format).toBe('audiobook');
    for (const offerId of ['blueprint:ebook', 'blueprint:bundle']) {
      try {
        buildBookCheckoutParams({ ...args, offerId });
        throw new Error(`${offerId} should have been refused`);
      } catch (err) {
        expect(err).toBeInstanceOf(BookCheckoutError);
        expect((err as BookCheckoutError).code).toBe('format_not_offered');
        expect((err as BookCheckoutError).status).toBe(409);
      }
    }
    // switching it on later is one row in bookTerms.ts: an ebook-enabled policy sells them (KDP Select still applies)
    expect(buildBookCheckoutParams({ ...args, offerId: 'blueprint:bundle', policy: EBOOK_ENABLED_POLICY }).metadata?.format).toBe('bundle');
    expect(() => buildBookCheckoutParams({ ...args, offerId: 'blueprint:audiobook', policy: CLOSED_POLICY })).toThrow(/stream only/);
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
    expect(download).toContain('issueBookDownload(');
    expect(download).not.toContain('firebasestorage.googleapis.com');
  });
});

describe('book checkout gate (the release store rules: B2 store_closed, B3 server origin, B10 fence; owner 2026-10-13: BOOK_STORE_ENABLED, platform key)', () => {
  // test changed (2026-10-13, owner answer on PR #17): the gate's key now comes from the PLATFORM STRIPE_SECRET_KEY
  // (STRIPE_BOOKS_SECRET_KEY is gone) and it also needs BOOK_STORE_ENABLED. The old `open` env set the former and
  // not the latter, so it can no longer open the gate; the assertions themselves are unchanged in meaning.
  const open = {
    BOOK_STORE_ENABLED: '1',
    STRIPE_SECRET_KEY: 'sk_test_b',
    VIRTUAL_PURCHASES_ENABLED: '1',
    NEXTAUTH_URL: 'https://fel.example/',
  } as NodeJS.ProcessEnv;

  it('opens only with BOOK_STORE_ENABLED, a test key, the B10 fence on, and a configured site URL', () => {
    expect(bookCheckoutGate(open)).toEqual({ ok: true, key: 'sk_test_b', origin: 'https://fel.example' });
  });

  it('answers a store_closed reason for each missing piece, in order', () => {
    expect(bookCheckoutGate({} as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: 'book_store_off' });
    expect(bookCheckoutGate({ ...open, STRIPE_SECRET_KEY: '' })).toEqual({ ok: false, reason: 'payments_not_set_up' });
    expect(bookCheckoutGate({ ...open, STRIPE_SECRET_KEY: 'sk_live_x' })).toEqual({ ok: false, reason: 'live_mode_off' });
    expect(bookCheckoutGate({ ...open, STRIPE_SECRET_KEY: 'rk_test_x' })).toEqual({ ok: false, reason: 'live_mode_off' });
    expect(bookCheckoutGate({ ...open, VIRTUAL_PURCHASES_ENABLED: '' })).toEqual({ ok: false, reason: 'virtual_purchases_off' });
    expect(bookCheckoutGate({ ...open, NEXTAUTH_URL: ' ' })).toEqual({ ok: false, reason: 'site_url_not_set' });
  });

  it('BOOK_STORE_ENABLED defaults off and fails closed on anything that is not an explicit on', () => {
    for (const v of [undefined, '', ' ', '0', 'false', 'off', 'no', 'enabled', '2', 'y']) {
      const env = { ...open, BOOK_STORE_ENABLED: v } as NodeJS.ProcessEnv;
      expect(bookStoreEnabled(env), String(v)).toBe(false);
      expect(bookCheckoutGate(env), String(v)).toEqual({ ok: false, reason: 'book_store_off' });
    }
    for (const v of ['1', 'true', 'TRUE', 'on', 'Yes', ' 1 ']) {
      expect(bookStoreEnabled({ BOOK_STORE_ENABLED: v } as NodeJS.ProcessEnv), v).toBe(true);
    }
  });

  it('keeps the B10 fence on top of BOOK_STORE_ENABLED: the book switch alone does not open checkout', () => {
    const env = { ...open, VIRTUAL_PURCHASES_ENABLED: undefined } as NodeJS.ProcessEnv;
    expect(bookCheckoutGate(env)).toEqual({ ok: false, reason: 'virtual_purchases_off' });
  });

  it('a live platform key never opens books, even with the coach store live', () => {
    const env = { ...open, STRIPE_SECRET_KEY: 'sk_live_p', COACH_STORE_LIVE: '1' } as NodeJS.ProcessEnv;
    expect(bookCheckoutGate(env)).toEqual({ ok: false, reason: 'live_mode_off' });
  });

  it('charges the platform Stripe account: STRIPE_SECRET_KEY is the only key read; STRIPE_BOOKS_SECRET_KEY is ignored', () => {
    expect(bookStripeSecret({ STRIPE_SECRET_KEY: 'sk_test_p' } as NodeJS.ProcessEnv)).toBe('sk_test_p');
    expect(bookStripeSecret({ STRIPE_BOOKS_SECRET_KEY: 'sk_test_b' } as NodeJS.ProcessEnv)).toBe('');
    expect(bookStripeSecret({ STRIPE_SECRET_KEY: 'sk_test_p', STRIPE_BOOKS_SECRET_KEY: 'sk_test_b' } as NodeJS.ProcessEnv)).toBe('sk_test_p');
    expect(bookCheckoutGate({ ...open, STRIPE_SECRET_KEY: '', STRIPE_BOOKS_SECRET_KEY: 'sk_test_b' } as NodeJS.ProcessEnv)).toEqual({
      ok: false,
      reason: 'payments_not_set_up',
    });
  });
});
