/**
 * Stripe Checkout for one catalog offer.
 *
 * Test mode only: a live secret key is refused before a session is created.
 * The amount comes from the catalog (or from a Stripe Price id Elijah pasted
 * into the catalog), never from the request body.
 */

import 'server-only';
import Stripe from 'stripe';
import { formatLabel, getBook, getOffer, type BookOffer, type BookTitle } from './bookCatalog';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';
import { siteOrigin } from '@/lib/stripe/site-origin';
import type { StoreClosedReason } from '@/lib/coach-store/stripeMode';

// Same pin as lib/stripe.ts. The SDK's enum lags the account's version string.
const API_VERSION = '2025-04-30.basil' as never;

let bookStripe: Stripe | null = null;
let bookStripeKey: string | null = null;

export function bookStripeSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.STRIPE_BOOKS_SECRET_KEY || env.STRIPE_SECRET_KEY || '';
}

export function bookWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.STRIPE_BOOKS_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || '';
}

/** Live keys (`sk_live_`) are refused. Book checkout cannot charge a real card from this route. */
export function assertStripeTestKey(key: string): void {
  if (!key.startsWith('sk_test_')) {
    throw new Error('Book checkout is test-mode only. Set STRIPE_BOOKS_SECRET_KEY to an sk_test_ key. Live keys are refused.');
  }
}

/**
 * May book checkout open, and where does Stripe send the buyer back? MERGE (2026-10-09), the release's store rules:
 *   - no key                         -> store_closed payments_not_set_up (B2: 409, never 503)
 *   - a key that is not sk_test_     -> store_closed live_mode_off (books stay test-only; COACH_STORE_LIVE is the
 *                                       coach store's switch and is NOT read here)
 *   - VIRTUAL_PURCHASES_ENABLED off  -> store_closed virtual_purchases_off (B10, FE PM Oct 7: no real-money product
 *                                       outside the coach store sells until it has an 18+ check and a refund path)
 *   - NEXTAUTH_URL unset             -> store_closed site_url_not_set (B3: never the request's Origin header)
 * assumption: books sit behind the existing B10 fence until the owner names their own switch (owner question).
 */
export type BookCheckoutGate =
  | { ok: true; key: string; origin: string }
  | { ok: false; reason: StoreClosedReason };

/** lib/flags.ts isVirtualPurchasesEnabled's parse, read from the PASSED env so the gate is testable. */
function virtualPurchasesOn(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VIRTUAL_PURCHASES_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export function bookCheckoutGate(env: NodeJS.ProcessEnv = process.env): BookCheckoutGate {
  const key = bookStripeSecret(env).trim();
  if (!key) return { ok: false, reason: 'payments_not_set_up' };
  if (!key.startsWith('sk_test_')) return { ok: false, reason: 'live_mode_off' };
  if (!virtualPurchasesOn(env)) return { ok: false, reason: 'virtual_purchases_off' };
  const origin = siteOrigin(env);
  if (!origin) return { ok: false, reason: 'site_url_not_set' };
  return { ok: true, key, origin };
}

/** True when book checkout charges through the platform's own Stripe account (no separate STRIPE_BOOKS_SECRET_KEY). */
export function bookSharesPlatformStripeAccount(env: NodeJS.ProcessEnv = process.env): boolean {
  const books = (env.STRIPE_BOOKS_SECRET_KEY ?? '').trim();
  return !books || books === (env.STRIPE_SECRET_KEY ?? '').trim();
}

export function stripeTaxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.STRIPE_BOOKS_TAX || env.STRIPE_TAX_ENABLED || '';
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

export function getBookStripe(env: NodeJS.ProcessEnv = process.env): Stripe {
  const key = bookStripeSecret(env);
  assertStripeTestKey(key);
  if (bookStripe && bookStripeKey === key) return bookStripe;
  bookStripe = new Stripe(key, { apiVersion: API_VERSION });
  bookStripeKey = key;
  return bookStripe;
}

export class BookCheckoutError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'BookCheckoutError';
  }
}

export interface CheckoutBuildInput {
  offer: BookOffer;
  book: BookTitle;
  origin: string;
  customerId?: string | null;
  customerEmail?: string | null;
  taxEnabled: boolean;
  paymentMethodTypes: string[] | undefined;
}

export function checkoutParamsForOffer(input: CheckoutBuildInput): Stripe.Checkout.SessionCreateParams {
  if (!input.offer.directSale) {
    throw new BookCheckoutError(
      input.offer.directSaleNote || 'This format is not for sale here.',
      409,
      'not_for_sale',
    );
  }
  const origin = input.origin.replace(/\/$/, '');
  if (!/^https?:\/\//.test(origin)) {
    throw new BookCheckoutError('Checkout has no public origin configured.', 500, 'not_configured');
  }

  const priceId = input.offer.stripePriceId?.trim();
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: input.offer.priceCents,
          product_data: {
            name: `${input.book.title} — ${formatLabel(input.offer.format)}`,
            description: input.offer.priceIsExample
              ? 'EXAMPLE price — placeholder, not a final price.'
              : input.book.description,
          },
        },
      };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [lineItem],
    metadata: {
      product: 'BOOK',
      offerId: input.offer.id,
      bookSlug: input.book.slug,
      format: input.offer.format,
    },
    success_url: `${origin}/press/receipt?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/press/${input.book.slug}?checkout=cancel`,
    client_reference_id: input.offer.id,
  };

  if (input.customerId) {
    params.customer = input.customerId;
    if (input.taxEnabled) params.customer_update = { address: 'auto' };
  } else {
    params.customer_creation = 'always';
    if (input.customerEmail) params.customer_email = input.customerEmail;
  }

  if (input.taxEnabled) {
    params.automatic_tax = { enabled: true };
    params.billing_address_collection = 'required';
  }

  if (input.paymentMethodTypes && input.paymentMethodTypes.length > 0) {
    params.payment_method_types = input.paymentMethodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  }
  return params;
}

export function buildBookCheckoutParams(input: {
  offerId: string;
  origin: string;
  customerId?: string | null;
  customerEmail?: string | null;
  taxEnabled: boolean;
  paymentMethodTypes?: string[] | undefined;
}): Stripe.Checkout.SessionCreateParams {
  const offer = getOffer(input.offerId);
  if (!offer) throw new BookCheckoutError('Unknown book.', 404, 'unknown_offer');
  const book = getBook(offer.bookSlug);
  if (!book) throw new BookCheckoutError('Unknown book.', 404, 'unknown_offer');
  return checkoutParamsForOffer({
    offer,
    book,
    origin: input.origin,
    customerId: input.customerId,
    customerEmail: input.customerEmail,
    taxEnabled: input.taxEnabled,
    paymentMethodTypes: input.paymentMethodTypes === undefined ? paymentMethodsFor('payment') : input.paymentMethodTypes,
  });
}
