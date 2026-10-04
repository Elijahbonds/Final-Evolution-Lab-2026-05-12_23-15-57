/**
 * Basil moved invoice.subscription and subscription.current_period_end.
 * Coach-store reads both shapes. The existing FEL handlers are out of this lane (see docs/coach-store-NOTES.md).
 */

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

export function invoiceSubscriptionId(invoice: unknown): string | null {
  const row = invoice as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } };
  } | null;
  return idOf(row?.parent?.subscription_details?.subscription) ?? idOf(row?.subscription);
}

export function subscriptionPeriodEndUnix(subscription: unknown): number | null {
  const row = subscription as {
    current_period_end?: unknown;
    items?: { data?: Array<{ current_period_end?: unknown }> };
  } | null;
  const item = row?.items?.data?.[0]?.current_period_end;
  if (typeof item === 'number') return item;
  if (typeof row?.current_period_end === 'number') return row.current_period_end;
  return null;
}

/** Basil invoices carry the payment on `payments`. Older invoices still have `charge`. */
export function invoiceChargeOrIntent(invoice: unknown): { paymentIntentId: string | null; chargeId: string | null } {
  const row = invoice as {
    charge?: unknown;
    payment_intent?: unknown;
    payments?: { data?: Array<{ payment?: { payment_intent?: unknown; charge?: unknown } }> };
  } | null;
  let paymentIntentId: string | null = null;
  let chargeId: string | null = null;
  for (const payment of row?.payments?.data ?? []) {
    paymentIntentId = paymentIntentId ?? idOf(payment.payment?.payment_intent);
    chargeId = chargeId ?? idOf(payment.payment?.charge);
  }
  return {
    paymentIntentId: paymentIntentId ?? idOf(row?.payment_intent),
    chargeId: chargeId ?? idOf(row?.charge),
  };
}

export function checkoutPaymentIntentId(session: unknown): string | null {
  const row = session as { payment_intent?: unknown } | null;
  return idOf(row?.payment_intent);
}
