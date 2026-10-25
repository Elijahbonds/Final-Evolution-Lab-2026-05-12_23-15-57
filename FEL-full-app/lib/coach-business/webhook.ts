// lib/coach-business/webhook.ts — COACH-BUSINESS: a coach's Connect sale, as the shared Stripe webhook
// (app/api/stripe/webhook/route.ts) sees it. One branch in that route hands every event whose object carries
// metadata.product = COACH_CONNECT here, before the coach store and the ledger dispatch.
//
// IDEMPOTENT THE WAY THE REST OF THE WEBHOOK IS (lib/stripe/checkout-fulfil.ts, lib/coach-store/webhook.ts):
//   · status moves are compare-and-set in SQL (PENDING/EXPIRED → PAID|ACTIVE once; refunds CAS on the cumulative amount);
//   · every ledger row is keyed on the PAYMENT, not the event — `coach-connect-fee:<checkout session | invoice>` and
//     `coach-connect-refund:<charge>:<cumulative refunded>` — and LedgerTransaction.idempotencyKey is unique, so a
//     redelivered event, the same payment seen by the webhook and the success-page verify, or two retries racing, book
//     the fee once;
//   · a refund event older than one already recorded (Stripe does not order events) moves nothing.
// A failure throws, so the webhook answers 500 and Stripe retries.
import type Stripe from 'stripe';
import { CONNECT_PRODUCT } from './connect';
import { applicationFeeCents, feePostings, feeRefundPostings, refundStep } from './fees';
import { applyRefund, markCanceled, markExpired, markPaid, saleById, type RawDb, type SaleRow } from './store';

type Meta = Record<string, string>;

function asMeta(value: unknown): Meta {
  if (!value || typeof value !== 'object') return {};
  const out: Meta = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** The Connect-sale metadata on any Stripe object (session, payment-intent charge, subscription, basil invoice), or null. */
export function coachConnectMeta(obj: unknown): (Meta & { saleId: string }) | null {
  const o = (obj ?? {}) as { metadata?: unknown; parent?: { subscription_details?: { metadata?: unknown } }; subscription_details?: { metadata?: unknown } };
  const meta = { ...asMeta(o.parent?.subscription_details?.metadata), ...asMeta(o.subscription_details?.metadata), ...asMeta(o.metadata) };
  if (meta.product !== CONNECT_PRODUCT || !meta.saleId) return null;
  return meta as Meta & { saleId: string };
}

export function isCoachConnectEvent(event: Stripe.Event): boolean {
  return coachConnectMeta(event.data.object) !== null;
}

export interface LedgerPost {
  kind: string;
  idempotencyKey: string;
  postings: { type: 'EXTERNAL' | 'PLATFORM_REVENUE'; amount: number }[];
  metadata: Record<string, string | number>;
}

export interface ConnectDeps {
  db: RawDb;
  /** Posts one balanced USD_CENTS transaction, idempotent on its key (lib/ledger.ts postTransaction). */
  post(tx: LedgerPost): Promise<void>;
}

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null);

export type ConnectOutcome = 'fulfilled' | 'already' | 'pending' | 'expired' | 'canceled' | 'refunded' | 'noop' | 'unknown_sale';

async function loadSale(deps: ConnectDeps, saleId: string): Promise<SaleRow | null> {
  const sale = await saleById(deps.db, saleId);
  if (!sale) console.warn('[coach-business] webhook for an unknown sale');
  return sale;
}

/**
 * A paid Checkout Session → the sale is PAID (one-off) or ACTIVE (monthly), and a one-off sale's fee is booked. A monthly
 * sale's fees are booked per invoice (connectInvoicePaid), so the first month is not booked twice.
 */
export async function fulfilConnectCheckout(deps: ConnectDeps, session: Stripe.Checkout.Session): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(session);
  if (!meta) return 'noop';
  const paid = session.mode === 'subscription' ? session.status === 'complete' : session.payment_status === 'paid';
  if (!paid) return 'pending';
  const sale = await loadSale(deps, meta.saleId);
  if (!sale) return 'unknown_sale';
  const monthly = sale.kind === 'monthly';
  const moved = await markPaid(deps.db, sale.id, {
    status: monthly ? 'ACTIVE' : 'PAID',
    paymentIntentId: monthly ? null : idOf(session.payment_intent),
    subscriptionId: monthly ? idOf(session.subscription) : null,
    checkoutSessionId: session.id,
  });
  if (!monthly) {
    const postings = feePostings(sale.feeCents);
    if (postings.length) {
      await deps.post({
        kind: 'COACH_CONNECT_FEE',
        idempotencyKey: `coach-connect-fee:${session.id}`,
        postings,
        metadata: { saleId: sale.id, coachId: sale.coachId, amountCents: sale.amountCents, feeCents: sale.feeCents },
      });
    }
  }
  return moved ? 'fulfilled' : 'already';
}

/** A monthly sale's invoice was paid: book FEL's fee for that month, as Stripe reported it (5% of the invoice otherwise). */
export async function connectInvoicePaid(deps: ConnectDeps, invoice: Stripe.Invoice): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(invoice);
  if (!meta || !invoice.id) return 'noop';
  const amount = Number(invoice.amount_paid ?? 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'noop';
  const reported = (invoice as { application_fee_amount?: unknown }).application_fee_amount;
  const fee = typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : applicationFeeCents(amount);
  const postings = feePostings(fee);
  if (postings.length) {
    await deps.post({
      kind: 'COACH_CONNECT_FEE',
      idempotencyKey: `coach-connect-fee:${invoice.id}`,
      postings,
      metadata: { saleId: meta.saleId, invoiceId: invoice.id, amountCents: amount, feeCents: fee },
    });
  }
  return 'fulfilled';
}

export async function connectCheckoutExpired(deps: ConnectDeps, session: Stripe.Checkout.Session): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(session);
  if (!meta) return 'noop';
  return (await markExpired(deps.db, meta.saleId)) ? 'expired' : 'noop';
}

const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

/** A monthly subscription ended (cancelled by either side, or unpaid): its capacity spot frees. */
export async function connectSubscriptionChanged(deps: ConnectDeps, sub: Stripe.Subscription, deleted: boolean): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(sub);
  if (!meta) return 'noop';
  if (!deleted && !ENDED.has(String(sub.status))) return 'noop';
  return (await markCanceled(deps.db, meta.saleId)) ? 'canceled' : 'noop';
}

/**
 * The cumulative refund on a sale's charge is now `refundedTotal`. Book the share of FEL's fee handed back for the step
 * since the last one recorded, then move the sale's refund total with a compare-and-set. Called by the webhook
 * (charge.refunded) and by the coach's refund route right after Stripe accepts the refund; whichever runs second finds
 * nothing left to do.
 */
export async function recordConnectRefund(deps: ConnectDeps, saleId: string, chargeId: string, refundedTotal: number): Promise<ConnectOutcome> {
  const sale = await loadSale(deps, saleId);
  if (!sale) return 'unknown_sale';
  const after = Math.min(Math.max(0, Math.floor(refundedTotal)), sale.amountCents);
  const step = refundStep(sale.feeCents, sale.amountCents, sale.refundedCents, after);
  if (step.refundDelta === 0) return 'noop';
  const postings = feeRefundPostings(step.feeDelta);
  if (postings.length) {
    await deps.post({
      kind: 'COACH_CONNECT_FEE_REFUND',
      idempotencyKey: `coach-connect-refund:${chargeId}:${after}`,
      postings,
      metadata: { saleId: sale.id, chargeId, refundedCents: after, feeReturnedCents: step.feeDelta },
    });
  }
  const status = after >= sale.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  const moved = await applyRefund(deps.db, sale.id, sale.refundedCents, after, step.feeDelta, status);
  if (!moved) throw new Error('coach-connect refund raced; retry');
  return 'refunded';
}

/** The webhook's one entry point for a COACH_CONNECT event. */
export async function fulfilCoachConnect(deps: ConnectDeps, event: Stripe.Event): Promise<ConnectOutcome> {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return fulfilConnectCheckout(deps, obj as Stripe.Checkout.Session);
    case 'checkout.session.expired':
      return connectCheckoutExpired(deps, obj as Stripe.Checkout.Session);
    case 'invoice.paid':
      return connectInvoicePaid(deps, obj as Stripe.Invoice);
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return connectSubscriptionChanged(deps, obj as Stripe.Subscription, event.type === 'customer.subscription.deleted');
    case 'charge.refunded': {
      const charge = obj as Stripe.Charge;
      const meta = coachConnectMeta(charge);
      if (!meta) return 'noop';
      return recordConnectRefund(deps, meta.saleId, charge.id, Number(charge.amount_refunded ?? 0));
    }
    default:
      return 'noop';
  }
}
