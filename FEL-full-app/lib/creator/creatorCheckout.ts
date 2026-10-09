/**
 * Stripe Checkout for one bookable service slot.
 *
 * Test mode only, through the book shop's own guard: the creator platform uses the same Stripe client and
 * key (`STRIPE_BOOKS_SECRET_KEY`, falling back to `STRIPE_SECRET_KEY`) and `bookCheckoutGate` refuses
 * anything that is not `sk_test_` before a hold is taken or Stripe is called.
 *
 * Order matters: key check → catalog → slot validation (server-generated slots only) → Firestore hold in a
 * transaction (fails if any cell is taken) → Checkout Session. If Stripe fails, the hold is released.
 * The price comes from the catalog, never from the request.
 *
 * MERGE (2026-10-09), the release's store rules through the book shop's bookCheckoutGate: a closed store is a 409
 * store_closed with a reason (STORE-READY B2, was 503 test_mode_only), VIRTUAL_PURCHASES_ENABLED (B10) closes it by
 * default, and Stripe's return URLs come from siteOrigin() (B3), never the request's Origin header.
 */

import 'server-only';
import { randomUUID } from 'crypto';
import type Stripe from 'stripe';
import { bookCheckoutGate, getBookStripe } from '@/lib/books/bookCheckout';
import type { StoreClosedReason } from '@/lib/coach-store/stripeMode';
import { STORE_CLOSED_MESSAGE } from '@/lib/coach-store/constants';
import { isValidEmail, normalizeEmail } from '@/lib/marketing/funnel';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';
import { getBookableService, type CreatorProfile, type CreatorService } from './creatorCatalog';
import { validateSlot } from './creatorSlots';
import type { BookingRecord, CreatorBookingStore } from './creatorStore';

/** Stripe's minimum is 30 minutes after creation. One more minute keeps a slow request above it. */
export const CHECKOUT_TTL_SECONDS = 31 * 60;
/** A hold outlives its session by this much, so a late expiry event (not a stale read) frees the slot. */
export const HOLD_GRACE_MS = 30 * 60_000;

export class CreatorCheckoutError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly reason?: StoreClosedReason) {
    super(message);
    this.name = 'CreatorCheckoutError';
  }
}

export interface ServiceCheckoutParamsInput {
  profile: CreatorProfile;
  service: CreatorService;
  bookingId: string;
  slotStart: string;
  slotEnd: string;
  origin: string;
  customerEmail: string | null;
  expiresAtSec: number;
  paymentMethodTypes: string[] | undefined;
}

export function serviceCheckoutParams(input: ServiceCheckoutParamsInput): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    product: 'SERVICE',
    bookingId: input.bookingId,
    serviceId: input.service.id,
    profileSlug: input.profile.slug,
    slotStart: input.slotStart,
  };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: input.service.priceCents,
          product_data: {
            name: `${input.service.name} with ${input.profile.name}`,
            description: input.service.priceIsExample
              ? `EXAMPLE price — placeholder, not a final price. ${input.slotStart}`
              : `${input.service.durationMinutes} minutes, starting ${input.slotStart}`,
          },
        },
      },
    ],
    metadata,
    // Copied to the PaymentIntent so a refunded charge can still name its booking.
    payment_intent_data: { metadata },
    client_reference_id: input.bookingId,
    expires_at: input.expiresAtSec,
    customer_creation: 'always',
    success_url: `${input.origin}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/team/${input.profile.slug}/book/${encodeURIComponent(input.service.id)}?checkout=cancel`,
  };
  if (input.customerEmail) params.customer_email = input.customerEmail;
  if (input.paymentMethodTypes && input.paymentMethodTypes.length > 0) {
    params.payment_method_types = input.paymentMethodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  }
  return params;
}

export interface StripeCheckoutClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: { idempotencyKey?: string },
      ): Promise<{ id: string; url: string | null }>;
    };
  };
}

export interface StartServiceCheckoutInput {
  serviceId: unknown;
  slotStart: unknown;
  email?: unknown;
}

export interface StartServiceCheckoutDeps {
  store: CreatorBookingStore | null;
  stripe?: () => StripeCheckoutClient;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  newId?: () => string;
  paymentMethodTypes?: string[] | undefined;
}

export async function startServiceCheckout(
  input: StartServiceCheckoutInput,
  deps: StartServiceCheckoutDeps,
): Promise<{ url: string; bookingId: string; sessionId: string }> {
  const env = deps.env ?? process.env;
  const gate = bookCheckoutGate(env);
  if (!gate.ok) throw new CreatorCheckoutError(STORE_CLOSED_MESSAGE, 409, 'store_closed', gate.reason);

  const serviceId = typeof input.serviceId === 'string' ? input.serviceId.slice(0, 120) : '';
  const found = getBookableService(serviceId);
  if (!found) throw new CreatorCheckoutError('Unknown service.', 404, 'unknown_service');
  const { profile, service } = found;

  const origin = gate.origin;

  const now = deps.now ?? new Date();
  const slot = validateSlot(profile, service, input.slotStart, now);
  if (!slot.ok) throw new CreatorCheckoutError('That time is not open for booking.', 400, `slot_${slot.reason}`);

  let email: string | null = null;
  if (typeof input.email === 'string' && input.email.trim()) {
    email = normalizeEmail(input.email).slice(0, 200);
    if (!isValidEmail(email)) throw new CreatorCheckoutError('That email does not look right.', 400, 'bad_email');
  }

  if (!deps.store) throw new CreatorCheckoutError('Booking is not configured on this server yet.', 503, 'store_not_configured');
  const store = deps.store;

  const bookingId = (deps.newId ?? randomUUID)();
  const expiresAtSec = Math.floor(now.getTime() / 1000) + CHECKOUT_TTL_SECONDS;
  const stamp = now.toISOString();
  const booking: BookingRecord = {
    id: bookingId,
    serviceId: service.id,
    profileSlug: profile.slug,
    slotStart: new Date(slot.startMs).toISOString(),
    slotEnd: new Date(slot.endMs).toISOString(),
    cellIds: slot.cellIds,
    status: 'HOLD',
    holdExpiresAt: new Date(expiresAtSec * 1000 + HOLD_GRACE_MS).toISOString(),
    checkoutSessionId: null,
    paymentIntentId: null,
    email,
    amountCents: service.priceCents,
    currency: 'usd',
    priceIsExample: service.priceIsExample,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const held = await store.holdSlot(booking, now);
  if (held === 'TAKEN') throw new CreatorCheckoutError('Someone just took that time. Pick another.', 409, 'slot_taken');

  const params = serviceCheckoutParams({
    profile,
    service,
    bookingId,
    slotStart: booking.slotStart,
    slotEnd: booking.slotEnd,
    origin,
    customerEmail: email,
    expiresAtSec,
    paymentMethodTypes: 'paymentMethodTypes' in deps ? deps.paymentMethodTypes : paymentMethodsFor('payment'),
  });

  let session: { id: string; url: string | null };
  try {
    const stripe = deps.stripe ? deps.stripe() : (getBookStripe(env) as unknown as StripeCheckoutClient);
    session = await stripe.checkout.sessions.create(params, { idempotencyKey: `creator-booking:${bookingId}` });
  } catch (err) {
    await store.releaseBooking(bookingId, 'FAILED', ['HOLD'], new Date()).catch(() => undefined);
    console.error('[creator-checkout] stripe', err instanceof Error ? err.message : err);
    throw new CreatorCheckoutError('Checkout failed. The time was not held.', 502, 'stripe_failed');
  }
  if (!session.url) {
    await store.releaseBooking(bookingId, 'FAILED', ['HOLD'], new Date()).catch(() => undefined);
    throw new CreatorCheckoutError('Checkout did not return a URL.', 502, 'no_url');
  }
  await store.attachCheckoutSession(bookingId, session.id, now);
  return { url: session.url, bookingId, sessionId: session.id };
}
