/**
 * Turn a paid Stripe Checkout into one entitlement row, and a refund into a revocation.
 *
 * Idempotent on the Stripe event id. A second delivery of the same event does
 * not write a second row. A refund remembered before the purchase arrives is
 * applied when the purchase is written, so the grant cannot land ACTIVE.
 */

import { getOffer } from './bookCatalog';
import { isValidEmail, normalizeEmail } from '@/lib/marketing/funnel';

export interface PaidBookSession {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

export interface RefundedCharge {
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

export interface BookEntitlementWrite {
  email: string;
  userId: string | null;
  offerId: string;
  format: string;
  bookSlug: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  stripeEventId: string;
  amountCents: number;
  currency: string;
  status: 'ACTIVE' | 'REVOKED';
  revokedAt: Date | null;
}

export interface BookFulfillStore {
  hasEvent(eventId: string): Promise<boolean>;
  rememberEvent(eventId: string, type: string, paymentIntentId: string | null): Promise<void>;
  isPaymentIntentRevoked(paymentIntentId: string): Promise<boolean>;
  findByEmailOffer(email: string, offerId: string): Promise<{ userId: string | null } | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  upsertEntitlement(row: BookEntitlementWrite): Promise<void>;
  revokeByPaymentIntent(paymentIntentId: string): Promise<number>;
}

export type FulfillResult =
  | { ok: true; deduped: true }
  | { ok: true; granted: true }
  | { ok: true; ignored: true; reason: string }
  | { ok: true; revoked: number };

export function paymentIntentId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

export async function recordBookCheckout(
  eventId: string,
  session: PaidBookSession,
  store: BookFulfillStore,
): Promise<FulfillResult> {
  if (session.metadata?.product !== 'BOOK') return { ok: true, ignored: true, reason: 'not-a-book' };
  if (await store.hasEvent(eventId)) return { ok: true, deduped: true };

  const offer = getOffer(session.metadata.offerId ?? '');
  if (!offer) throw new Error(`unknown book offer ${session.metadata.offerId ?? ''}`);

  const paid = session.payment_status ?? 'paid';
  if (paid !== 'paid' && paid !== 'no_payment_required') {
    await store.rememberEvent(eventId, 'checkout.session.completed', paymentIntentId(session.payment_intent));
    return { ok: true, ignored: true, reason: 'unpaid' };
  }

  const email = normalizeEmail(session.customer_details?.email || session.customer_email || '');
  if (!isValidEmail(email)) throw new Error('book checkout completed without an email');

  const pi = paymentIntentId(session.payment_intent);
  const prev = await store.findByEmailOffer(email, offer.id);
  const linked = await store.findUserIdByEmail(email);
  const alreadyRefunded = pi ? await store.isPaymentIntentRevoked(pi) : false;

  await store.upsertEntitlement({
    email,
    userId: linked ?? prev?.userId ?? null,
    offerId: offer.id,
    format: offer.format,
    bookSlug: offer.bookSlug,
    stripeSessionId: session.id,
    stripePaymentIntentId: pi,
    stripeEventId: eventId,
    amountCents: session.amount_total ?? offer.priceCents,
    currency: (session.currency || 'usd').toLowerCase(),
    status: alreadyRefunded ? 'REVOKED' : 'ACTIVE',
    revokedAt: alreadyRefunded ? new Date() : null,
  });
  await store.rememberEvent(eventId, 'checkout.session.completed', pi);
  return { ok: true, granted: true };
}

export async function revokeBookCharge(
  eventId: string,
  charge: RefundedCharge,
  store: BookFulfillStore,
): Promise<FulfillResult> {
  if (await store.hasEvent(eventId)) return { ok: true, deduped: true };
  const pi = paymentIntentId(charge.payment_intent);
  if (!pi) return { ok: true, ignored: true, reason: 'no-payment-intent' };

  const revoked = await store.revokeByPaymentIntent(pi);
  // Remember the payment intent even when no row matched yet. The checkout
  // webhook may still be in flight, and the grant checks this list.
  await store.rememberEvent(eventId, 'charge.refunded', pi);
  if (revoked === 0) return { ok: true, ignored: true, reason: 'no-matching-purchase' };
  return { ok: true, revoked };
}
