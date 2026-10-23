/**
 * lib/stripe/basil-shapes.ts — LAUNCH-SALES B-W3 (2026-10-20): where the FEL subscription handlers read Stripe's
 * fields under the pinned API version (lib/stripe.ts: '2025-04-30.basil'), and every version after it (the SDK's own
 * types in node_modules/stripe are 2026-07-29.dahlia, which keeps basil's layout).
 *
 * Basil removed four fields the old handlers read, so a renewal, a failed payment and every period date went wrong:
 *
 *   | old read                          | basil and later                                               |
 *   |-----------------------------------|---------------------------------------------------------------|
 *   | invoice.subscription              | invoice.parent.subscription_details.subscription              |
 *   | subscription.current_period_end   | subscription.items.data[].current_period_end                  |
 *   | invoice.charge / .payment_intent  | invoice.payments.data[].payment.{charge,payment_intent}       |
 *   | charge.invoice                    | none: list InvoicePayments by payment_intent                  |
 *
 * The coach store already reads both shapes (lib/coach-store/stripeShapes.ts); this file reuses those readers rather
 * than writing a second copy, and adds what the FEL handlers need on top: a period end as a Date that is never an
 * Invalid Date (Prisma refuses one, "Provided Date object is invalid"), the subscription metadata snapshot on an
 * invoice, and the charge -> subscription mapping a refund needs.
 */
import type Stripe from 'stripe';
import { invoiceChargeOrIntent, invoiceSubscriptionId, subscriptionPeriodEndUnix } from '@/lib/coach-store/stripeShapes';

export { invoiceSubscriptionId, subscriptionPeriodEndUnix };

/** The products a FEL subscription checkout (app/api/stripe/checkout) writes a Subscription row for. */
export const SUBSCRIPTION_PRODUCTS = ['FEL_PRO', 'STUDIO_CREATOR', 'FEL_COACH', 'FEL_FACILITY'] as const;
export type SubscriptionProductKey = (typeof SUBSCRIPTION_PRODUCTS)[number];

export function isSubscriptionProduct(value: unknown): value is SubscriptionProductKey {
  return typeof value === 'string' && (SUBSCRIPTION_PRODUCTS as readonly string[]).includes(value);
}

/** Has Stripe ended this subscription for good? (`canceled` and `incomplete_expired` are terminal.) */
export function subscriptionEnded(subscription: unknown): boolean {
  const status = (subscription as { status?: unknown } | null)?.status;
  return status === 'canceled' || status === 'incomplete_expired';
}

/** A Unix-seconds value as a Date, or null. Never returns an Invalid Date. */
export function unixToDate(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

/** The subscription's current period end (basil: on the first item; older: top level), or null. */
export function subscriptionPeriodEnd(subscription: unknown): Date | null {
  return unixToDate(subscriptionPeriodEndUnix(subscription));
}

/** The latest period end on an invoice's lines (each line carries its own period), or null. */
export function invoicePeriodEnd(invoice: unknown): Date | null {
  const lines = (invoice as { lines?: { data?: Array<{ period?: { end?: unknown } }> } } | null)?.lines?.data ?? [];
  let best: number | null = null;
  for (const line of lines) {
    const end = line?.period?.end;
    if (typeof end === 'number' && Number.isFinite(end) && (best === null || end > best)) best = end;
  }
  return unixToDate(best);
}

function stringMeta(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** The subscription metadata snapshot an invoice carries (basil: parent.subscription_details.metadata). */
export function invoiceSubscriptionMetadata(invoice: unknown): Record<string, string> {
  const row = invoice as {
    parent?: { subscription_details?: { metadata?: unknown } | null } | null;
    subscription_details?: { metadata?: unknown } | null;
  } | null;
  return { ...stringMeta(row?.subscription_details?.metadata), ...stringMeta(row?.parent?.subscription_details?.metadata) };
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  return null;
}

export function paymentIntentIdOf(charge: { payment_intent?: unknown } | null | undefined): string | null {
  return idOf(charge?.payment_intent);
}

/**
 * Which subscription a charge paid for, or null for a one-time charge. Basil removed charge.invoice, so the charge's
 * payment intent is looked up among InvoicePayments; if that list is unavailable, the customer's recent invoices are
 * searched by their payments (the way lib/coach-store/reconcile.ts maps a renewal refund). A legacy charge that still
 * names its invoice is read directly.
 */
export async function subscriptionIdForCharge(stripe: Stripe, charge: Stripe.Charge): Promise<string | null> {
  const legacyInvoice = (charge as unknown as { invoice?: unknown }).invoice;
  const piId = paymentIntentIdOf(charge);

  if (legacyInvoice) {
    const invoice = typeof legacyInvoice === 'string' ? await stripe.invoices.retrieve(legacyInvoice) : legacyInvoice;
    const sub = invoiceSubscriptionId(invoice);
    if (sub) return sub;
  }
  if (!piId) return null;

  try {
    const payments = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: piId },
      limit: 1,
      expand: ['data.invoice'],
    });
    for (const payment of payments.data) {
      const invoice = typeof payment.invoice === 'string' ? await stripe.invoices.retrieve(payment.invoice) : payment.invoice;
      const sub = invoiceSubscriptionId(invoice);
      if (sub) return sub;
    }
    // The list answered: no invoice payment (a one-time Checkout charge) or a one-off invoice. Not a subscription.
    return null;
  } catch (err) {
    console.warn('[stripe] invoice payment lookup failed; falling back to the customer invoices', (err as Error)?.message ?? 'unknown');
  }

  const customer = idOf(charge.customer);
  if (!customer) return null;
  const invoices = await stripe.invoices.list({ customer, limit: 20, expand: ['data.payments'] });
  for (const invoice of invoices.data) {
    const { paymentIntentId, chargeId } = invoiceChargeOrIntent(invoice);
    if (paymentIntentId !== piId && chargeId !== charge.id) continue;
    return invoiceSubscriptionId(invoice);
  }
  return null;
}
