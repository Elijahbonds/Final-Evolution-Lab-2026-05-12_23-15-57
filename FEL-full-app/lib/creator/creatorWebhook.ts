/**
 * Booking webhook: three events, idempotent by Stripe event id (the book shop's pattern).
 *
 *   checkout.session.completed → booking CONFIRMED, cells BOOKED
 *   checkout.session.expired   → the hold is released
 *   charge.refunded            → booking CANCELLED, cells released (full refunds; a partial refund is recorded only)
 *
 * A replayed event is a no-op. A refund that arrives before its purchase is remembered, and the purchase
 * lands CANCELLED. Live-mode events are ignored: this platform is test mode only.
 *
 * MERGE (2026-10-09), the release's SEC-F4 rules (#200): a PAID completion is keyed on the Checkout Session
 * (`stripe-session:<cs_id>`, bookSessionKey), not the event id, and runs through confirmServiceSession, which
 * /bookings/success also calls with the session the SERVER retrieved from Stripe (NO-WEBHOOK). Webhook + success
 * page + a redelivery confirm once. Only payment_status 'paid' confirms (isPaidSession); an unpaid completion is not
 * remembered, so a delayed method that pays the same session later still confirms. Expiry and refunds stay
 * event-keyed.
 */

import { isValidEmail, normalizeEmail } from '@/lib/marketing/funnel';
import { bookSessionKey, paymentIntentId } from '@/lib/books/bookFulfill';
import { LIVE_BOOKING, type CreatorBookingStore } from './creatorStore';
import { notifyBooking } from './notify';

export interface CreatorEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data: { object: unknown };
}

export interface SessionLike {
  id: string;
  payment_status?: string | null;
  status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id: string } | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}

interface ChargeLike {
  payment_intent?: string | { id: string } | null;
  refunded?: boolean;
  amount?: number;
  amount_refunded?: number;
  metadata?: Record<string, string> | null;
}

export type CreatorWebhookResult =
  | { ok: true; deduped: true }
  | { ok: true; ignored: true; reason: string }
  | { ok: true; bookingId: string; outcome: string };

function bookingIdOf(session: SessionLike): string {
  return session.metadata?.bookingId || session.client_reference_id || '';
}

export async function handleCreatorEvent(
  event: CreatorEvent,
  store: CreatorBookingStore,
  now: Date = new Date(),
): Promise<CreatorWebhookResult> {
  if (event.livemode === true) return { ok: true, ignored: true, reason: 'livemode' };

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' || event.type === 'checkout.session.expired') {
    const session = event.data.object as SessionLike;
    if (session.metadata?.product !== 'SERVICE') return { ok: true, ignored: true, reason: 'not-a-service' };

    if (event.type === 'checkout.session.expired') {
      if (await store.hasEvent(event.id)) return { ok: true, deduped: true };
      const bookingId = bookingIdOf(session);
      if (!bookingId) throw new Error('service checkout event without a booking id');
      const outcome = await store.releaseBooking(bookingId, 'EXPIRED', ['HOLD'], now);
      await store.rememberEvent(event.id, event.type, paymentIntentId(session.payment_intent));
      return { ok: true, bookingId, outcome };
    }

    return confirmServiceSession(session, store, now);
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as ChargeLike;
    const product = charge.metadata?.product;
    if (product && product !== 'SERVICE') return { ok: true, ignored: true, reason: 'not-a-service' };
    if (await store.hasEvent(event.id)) return { ok: true, deduped: true };
    const pi = paymentIntentId(charge.payment_intent);
    if (!pi) return { ok: true, ignored: true, reason: 'no-payment-intent' };

    const partial = charge.refunded === false
      && typeof charge.amount === 'number'
      && typeof charge.amount_refunded === 'number'
      && charge.amount_refunded < charge.amount;
    if (partial) {
      await store.rememberEvent(event.id, 'charge.refunded.partial', pi);
      return { ok: true, ignored: true, reason: 'partial-refund' };
    }

    const booking = charge.metadata?.bookingId
      ? await store.getBooking(charge.metadata.bookingId)
      : await store.findBookingByPaymentIntent(pi);
    if (!booking) {
      // Remember the payment intent even when nothing matched yet: the completion may still be in flight.
      await store.rememberEvent(event.id, 'charge.refunded', pi);
      return { ok: true, ignored: true, reason: 'no-matching-booking' };
    }
    const outcome = await store.releaseBooking(booking.id, 'CANCELLED', LIVE_BOOKING, now, { paymentIntentId: pi });
    await store.rememberEvent(event.id, 'charge.refunded', pi);
    return { ok: true, bookingId: booking.id, outcome };
  }

  return { ok: true, ignored: true, reason: event.type };
}

/**
 * Confirm one paid service session, keyed on the session (bookSessionKey). The webhook calls it with the event's
 * session; /bookings/success calls it with the session it retrieved from Stripe itself. The booking named in the
 * session's own metadata is confirmed, never one the visitor names.
 */
export async function confirmServiceSession(
  session: SessionLike,
  store: CreatorBookingStore,
  now: Date = new Date(),
): Promise<CreatorWebhookResult> {
  if (session.metadata?.product !== 'SERVICE') return { ok: true, ignored: true, reason: 'not-a-service' };
  const key = bookSessionKey(session.id);
  if (await store.hasEvent(key)) return { ok: true, deduped: true };
  const bookingId = bookingIdOf(session);
  if (!bookingId) throw new Error('service checkout event without a booking id');
  const pi = paymentIntentId(session.payment_intent);

  if (session.payment_status !== 'paid' || session.status === 'expired') {
    return { ok: true, ignored: true, reason: 'unpaid' };
  }

  const rawEmail = normalizeEmail(session.customer_details?.email || session.customer_email || '');
  const email = isValidEmail(rawEmail) ? rawEmail : null;
  if (pi && (await store.isPaymentIntentRefunded(pi))) {
    const outcome = await store.releaseBooking(bookingId, 'CANCELLED', LIVE_BOOKING, now, { paymentIntentId: pi });
    await store.rememberEvent(key, 'checkout.session.completed', pi);
    return { ok: true, bookingId, outcome: `refunded-before-confirm:${outcome}` };
  }

  const outcome = await store.confirmBooking(
    bookingId,
    { paymentIntentId: pi, email, amountCents: session.amount_total ?? null, currency: session.currency?.toLowerCase() ?? null },
    now,
  );
  if (outcome === 'NOT_FOUND') throw new Error(`service checkout for unknown booking ${bookingId}`);
  if (outcome === 'CONFIRMED' || outcome === 'CONFLICT') {
    const booking = await store.getBooking(bookingId);
    if (booking) await notifyBooking(booking);
  }
  await store.rememberEvent(key, 'checkout.session.completed', pi);
  return { ok: true, bookingId, outcome };
}
