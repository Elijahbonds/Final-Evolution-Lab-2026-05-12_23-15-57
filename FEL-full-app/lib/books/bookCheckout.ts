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
