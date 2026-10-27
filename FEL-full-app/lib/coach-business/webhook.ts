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
//   · a refund event older than one already recorded (Stripe does not order events) moves nothing;
//   · every fee hand-back to the coach (a refund's share of the 5%, a monthly invoice's excess fee) is STATE-based: it reads
//     the application fee's amount_refunded at Stripe first and tops it up to the target (connect.ts returnApplicationFee).
// A failure throws, so the webhook answers 500 and Stripe retries.
//
// THE FEE STEPS (fees.ts): a one-off sale's application fee is exact at checkout. A monthly sale's is set exactly on each
// renewal draft (invoice.created) and trued up on invoice.paid. These Stripe calls are made for an event Stripe sent about
// a sale that exists, whatever the payments switch says now: a coach whose client renews after the owner switched
// payments off is still owed the right split.
//
// PAYMENTS-READY (2026-10-26):
//   · every ledger row carries the coachId, so the monthly cap (PLATFORM_FEE_CAP_CENTS_MONTHLY) can read a coach's month;
//   · with a cap set, each monthly RENEWAL's share is capped too (invoice.created writes the capped split on the draft
//     invoice's own metadata, which invoice.paid then reads; invoice.paid caps it itself if the draft was missed);
//   · REFUND_PROCESSING_FEE on: a refund maps the charge's refunded total back to the price through the processing fee
//     (fees.ts priceRefundedFromCharge), hands the coach back the processing fee's share with FEL's share, and books that
//     share as COACH_CONNECT_PROCESSING_FEE_REFUND (FEL absorbing Stripe's fee). Off: exactly as before.
import type Stripe from 'stripe';
import { CONNECT_PRODUCT, invoiceFee, returnApplicationFee, type ConnectFeeStripe } from './connect';
import { platformFeePolicy, refundProcessingFee } from './config';
import {
  feeExcessCents, feePostings, feeRefundPostings, feeReturnedCents, felShareCents, monthStartUtc, priceRefundedFromCharge,
  processingShareCents, refundStep, saleSplit,
} from './fees';
import { applyRefund, coachFeesThisMonth, markCanceled, markExpired, markPaid, saleById, type RawDb, type SaleRow } from './store';

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
  /** Stripe, for the fee steps (a refund's share of the 5%, a monthly invoice's exact fee). */
  stripe(): ConnectFeeStripe;
  /** PAYMENTS-READY: the env the money settings are read from (default process.env). */
  env?: NodeJS.ProcessEnv;
  /** PAYMENTS-READY: FEL's fees from a coach so far this month (default: the ledger, store.ts coachFeesThisMonth). */
  feesThisMonth?(coachId: string, now: Date): Promise<number>;
  /** PAYMENTS-READY: the clock (tests). */
  now?(): Date;
}

function depsEnv(deps: ConnectDeps): NodeJS.ProcessEnv {
  return deps.env ?? process.env;
}

/** A monthly renewal's split under the monthly cap: FEL's share lowered to what is left of the coach's cap this month.
 *  Unchanged with no cap (the default). */
async function cappedRenewal(deps: ConnectDeps, meta: Meta, split: MetaSplit): Promise<MetaSplit> {
  const policy = platformFeePolicy(depsEnv(deps));
  if (policy.capCentsMonthly === null || !meta.coachId) return split;
  const now = deps.now?.() ?? new Date();
  const soFar = deps.feesThisMonth ? await deps.feesThisMonth(meta.coachId, now) : await coachFeesThisMonth(deps.db, meta.coachId, monthStartUtc(now), now);
  const room = Math.max(0, policy.capCentsMonthly - soFar);
  if (split.felShareCents <= room) return split;
  return { ...split, felShareCents: room, appFeeCents: room + (split.totalCents - split.priceCents) };
}

/** Marks an invoice whose split invoice.created already capped (its own metadata), so invoice.paid does not cap twice. */
export const CAPPED_META = 'feeCapApplied';

/** The split a sale's checkout wrote into its metadata (connect.ts saleMetadata), or null for an object without it. */
export interface MetaSplit { priceCents: number; totalCents: number; felShareCents: number; appFeeCents: number }

export function metaSplit(meta: Meta): MetaSplit | null {
  const n = (k: string): number | null => (/^\d+$/.test(meta[k] ?? '') ? Number(meta[k]) : null);
  const priceCents = n('priceCents'); const totalCents = n('totalCents'); const felShare = n('felShareCents'); const appFeeCents = n('appFeeCents');
  if (priceCents === null || totalCents === null || felShare === null || appFeeCents === null || totalCents <= 0) return null;
  return { priceCents, totalCents, felShareCents: felShare, appFeeCents };
}

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null);

export type ConnectOutcome = 'fulfilled' | 'already' | 'pending' | 'expired' | 'canceled' | 'refunded' | 'fee_set' | 'noop' | 'unknown_sale';

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

/**
 * A monthly sale's invoice was paid. First the true-up: when Stripe took more application fee than this invoice's A (the
 * first invoice, whose fee is the percent rounded up; or a renewal whose draft was not updated in time), the excess goes
 * back to the coach. Then FEL's share for that month is booked: 5% of the coaching price, not the processing fee.
 */
export async function connectInvoicePaid(deps: ConnectDeps, invoice: Stripe.Invoice): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(invoice);
  if (!meta || !invoice.id) return 'noop';
  const amount = Number(invoice.amount_paid ?? 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'noop';
  const metaSplitRaw = metaSplit(meta);
  // PAYMENTS-READY: a renewal under the monthly cap (unless invoice.created already capped this invoice's metadata)
  const split = metaSplitRaw && invoice.billing_reason === 'subscription_cycle' && meta[CAPPED_META] !== '1' ? await cappedRenewal(deps, meta, metaSplitRaw) : metaSplitRaw;
  let fee: number;
  if (split && amount === split.totalCents) {
    const taken = await invoiceFee(deps.stripe(), invoice.id);
    const excess = taken ? feeExcessCents(taken.feeCents, split.appFeeCents) : 0;
    if (taken && excess > 0) {
      if (!taken.feeId) throw new Error('coach-connect invoice fee has no application fee id');
      await returnApplicationFee(deps.stripe(), taken.feeId, excess, `coach-connect-fee-trueup:${invoice.id}`, { saleId: meta.saleId, invoiceId: invoice.id });
    }
    fee = split.felShareCents;
  } else if (split) {
    // A different total (a proration, a discount): FEL's 5% of the coaching part of what was paid. Its fee is the
    // subscription's percent; the dashboard shows it, and it is not trued up (docs/COACH-BUSINESS.md "Known limits").
    fee = felShareCents(Math.floor((amount * split.priceCents) / split.totalCents));
  } else {
    // A sale started before the processing-fee line (none exist in production: the tables were never applied).
    const reported = (invoice as { application_fee_amount?: unknown }).application_fee_amount;
    fee = typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : felShareCents(amount);
  }
  const postings = feePostings(fee);
  if (postings.length) {
    await deps.post({
      kind: 'COACH_CONNECT_FEE',
      idempotencyKey: `coach-connect-fee:${invoice.id}`,
      postings,
      metadata: { saleId: meta.saleId, ...(meta.coachId ? { coachId: meta.coachId } : {}), invoiceId: invoice.id, amountCents: amount, feeCents: fee },
    });
  }
  return 'fulfilled';
}

/**
 * A renewal invoice was created (a draft for about an hour before Stripe finalises it): set its application fee to A
 * exactly. Stripe: "The application_fee_amount set directly on an invoice overrides any application fee amount calculated
 * with application_fee_percent". The first invoice is skipped (Checkout finalised it already; invoice.paid trues it up),
 * and so is any invoice whose total is not the sale's (a proration keeps the percent).
 */
export async function connectInvoiceCreated(deps: ConnectDeps, invoice: Stripe.Invoice): Promise<ConnectOutcome> {
  const meta = coachConnectMeta(invoice);
  const split = meta ? metaSplit(meta) : null;
  if (!meta || !split || !invoice.id) return 'noop';
  if (invoice.status !== 'draft' || invoice.billing_reason !== 'subscription_cycle') return 'noop';
  if (Number(invoice.total ?? -1) !== split.totalCents) return 'noop';
  // PAYMENTS-READY: under a monthly cap the renewal's share is capped now, and the capped split is written on the
  // invoice's own metadata (it overrides the subscription's), so invoice.paid trues up to it and books it.
  const capped = await cappedRenewal(deps, meta, split);
  if (capped === split) {
    await deps.stripe().invoices.update(invoice.id, { application_fee_amount: split.appFeeCents });
  } else {
    await deps.stripe().invoices.update(invoice.id, {
      application_fee_amount: capped.appFeeCents,
      metadata: { felShareCents: String(capped.felShareCents), appFeeCents: String(capped.appFeeCents), [CAPPED_META]: '1' },
    });
  }
  return 'fee_set';
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

/** The refunded charge, as the refund route and charge.refunded both see it. */
export interface RefundedCharge {
  id: string;
  refundedTotal: number;
  applicationFeeId: string | null;
  /** PAYMENTS-READY: the charge's own amount (price + processing fee), to size the processing fee's share. */
  amountCents?: number;
  /** PAYMENTS-READY: the charge's sale metadata (its totalCents is the fallback for amountCents). */
  metadata?: Meta | null;
}

/** The processing fee a sale's buyer paid: the charge's amount less the price (else the metadata's, else today's rate). */
export function processingFeeOf(sale: Pick<SaleRow, 'amountCents'>, charge: Pick<RefundedCharge, 'amountCents' | 'metadata'>): number {
  const fromCharge = Number(charge.amountCents);
  if (Number.isSafeInteger(fromCharge) && fromCharge >= sale.amountCents) return fromCharge - sale.amountCents;
  const total = Number(charge.metadata?.totalCents);
  if (Number.isSafeInteger(total) && total >= sale.amountCents) return total - sale.amountCents;
  return saleSplit(sale.amountCents).processingFeeCents;
}

/**
 * The cumulative refund of a sale's price is now `charge.refundedTotal` (capped at the price: a refund of the processing
 * fee too, from the Stripe dashboard, moves nothing more here). Hand back FEL's share of the 5% for the step since the last
 * one recorded (an application-fee refund to the coach, state-based), book it, then move the sale's refund total with a
 * compare-and-set. Called by the webhook (charge.refunded) and by the coach's refund route right after Stripe accepts the
 * refund; whichever runs second finds nothing left to do.
 */
export async function recordConnectRefund(deps: ConnectDeps, saleId: string, charge: RefundedCharge): Promise<ConnectOutcome> {
  const sale = await loadSale(deps, saleId);
  if (!sale) return 'unknown_sale';
  // PAYMENTS-READY: with REFUND_PROCESSING_FEE on, the charge's refunded total is the price share PLUS the processing
  // fee's share; map it back to the price. Off (the default): today's min(refunded, price).
  const refundFee = refundProcessingFee(depsEnv(deps));
  const processing = refundFee ? processingFeeOf(sale, charge) : 0;
  const shape = { priceCents: sale.amountCents, processingFeeCents: processing };
  const after = refundFee
    ? priceRefundedFromCharge(shape, charge.refundedTotal, true)
    : Math.min(Math.max(0, Math.floor(charge.refundedTotal)), sale.amountCents);
  const step = refundStep(sale.feeCents, sale.amountCents, sale.refundedCents, after);
  if (step.refundDelta === 0) return 'noop';
  const processingDelta = refundFee
    ? processingShareCents(processing, sale.amountCents, after) - processingShareCents(processing, sale.amountCents, sale.refundedCents)
    : 0;
  if (step.feeDelta > 0 || processingDelta > 0) {
    if (!charge.applicationFeeId) throw new Error('coach-connect refund: the charge has no application fee');
    // the coach gets back FEL's share of the 5% and, with the fee refunded, the processing fee's share (the refund took
    // both from them through reverse_transfer), so the coach ends exactly where today's refund leaves them
    const target = feeReturnedCents(sale.feeCents, sale.amountCents, after) + (refundFee ? processingShareCents(processing, sale.amountCents, after) : 0);
    await returnApplicationFee(deps.stripe(), charge.applicationFeeId, target, `coach-connect-fee-refund:${charge.id}`, { saleId: sale.id, chargeId: charge.id });
  }
  const postings = feeRefundPostings(step.feeDelta);
  if (postings.length) {
    await deps.post({
      kind: 'COACH_CONNECT_FEE_REFUND',
      idempotencyKey: `coach-connect-refund:${charge.id}:${after}`,
      postings,
      metadata: { saleId: sale.id, coachId: sale.coachId, chargeId: charge.id, refundedCents: after, feeReturnedCents: step.feeDelta },
    });
  }
  if (processingDelta > 0) {
    // FEL absorbs Stripe's fee on the refunded share (Stripe keeps its fee on a refunded charge)
    await deps.post({
      kind: 'COACH_CONNECT_PROCESSING_FEE_REFUND',
      idempotencyKey: `coach-connect-processing-refund:${charge.id}:${after}`,
      postings: feeRefundPostings(processingDelta),
      metadata: { saleId: sale.id, coachId: sale.coachId, chargeId: charge.id, refundedCents: after, processingReturnedCents: processingDelta },
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
    case 'invoice.created':
      return connectInvoiceCreated(deps, obj as Stripe.Invoice);
    case 'invoice.paid':
      return connectInvoicePaid(deps, obj as Stripe.Invoice);
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return connectSubscriptionChanged(deps, obj as Stripe.Subscription, event.type === 'customer.subscription.deleted');
    case 'charge.refunded': {
      const charge = obj as Stripe.Charge;
      const meta = coachConnectMeta(charge);
      if (!meta) return 'noop';
      return recordConnectRefund(deps, meta.saleId, { id: charge.id, refundedTotal: Number(charge.amount_refunded ?? 0), applicationFeeId: idOf(charge.application_fee), amountCents: Number(charge.amount), metadata: meta });
    }
    default:
      return 'noop';
  }
}
