// lib/coach-business/connect.ts — COACH-BUSINESS: Stripe Connect (Express) for coaches who charge their clients
// through FEL (owner, 2026-10-25: "5% + Stripe fee on top"; payments live only when the owner switches them on).
//
// THE MONEY PATH. A DESTINATION CHARGE on FEL's platform account, grossed up (fees.ts saleSplit): the buyer pays the
// package price P plus a "Processing fee" line X; Stripe moves the total to the coach's Express account
// (transfer_data.destination, on_behalf_of the coach so the coach is the merchant of record) and FEL keeps
// application_fee_amount A = 5% of P + X. Stripe's own fee comes out of FEL's balance (always, on a destination charge), so
// FEL nets 5% of P and the coach P − 5%. Monthly coaching: the same split on every invoice (fees.ts "monthly coaching").
// Refunds return part or all of P: the transfer is reversed and FEL hands back its share of the 5%, exactly, as an
// application-fee refund (returnApplicationFee). The processing fee is not refunded (fees.ts "REFUNDS"). Payouts are
// Stripe's: an Express account is paid out on Stripe's schedule, and the coach opens their Express dashboard through a
// login link.
//
// WHY NOT DIRECT CHARGES (the owner asked; docs/COACH-BUSINESS.md "Why destination charges"): a direct charge would make
// the coach pay Stripe's fee and carry refunds and disputes, but Stripe recommends destination charges for Express
// accounts (direct charges are for accounts with the full Stripe Dashboard), the buyer, the price and the Checkout would
// all have to live on each coach's account, and FEL stays liable for an Express account's negative balance either way.
// The gross-up gets the owner's split on the charge type Stripe recommends here.
//
// THE FENCE (connectGate): every Stripe call in this file is reached only through a route that asked connectGate first.
//   payments switch off              → 409 store_closed payments_off   ("Payments aren't live yet")
//   no STRIPE_SECRET_KEY             → 409 store_closed payments_not_set_up
//   a LIVE key, COACH_CONNECT_LIVE off → 409 store_closed live_mode_off  (test mode only until the owner says otherwise)
//   NEXTAUTH_URL unset               → 409 store_closed site_url_not_set (Stripe URLs never come from a request header)
import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { isLiveKey, isTestKey } from '@/lib/coach-store/stripeMode';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { CHECKOUT_HOLD_MINUTES, PAYMENTS_NOT_LIVE, isCoachConnectLive, isCoachConnectPaymentsEnabled } from './config';
import { feeRefundDue, subscriptionFeePercent, type SaleSplit } from './fees';
import { billingOf, type CoachPackage } from './packages';
import { invoiceChargeOrIntent } from '@/lib/coach-store/stripeShapes';

export const CONNECT_PRODUCT = 'COACH_CONNECT' as const;

export type ConnectClosedReason = 'payments_off' | 'payments_not_set_up' | 'live_mode_off' | 'site_url_not_set';
export type ConnectGate = { ok: true; key: string; live: boolean; origin: string } | { ok: false; reason: ConnectClosedReason };

export function connectGate(env: NodeJS.ProcessEnv = process.env): ConnectGate {
  if (!isCoachConnectPaymentsEnabled(env)) return { ok: false, reason: 'payments_off' };
  const key = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) return { ok: false, reason: 'payments_not_set_up' };
  let live: boolean;
  if (isTestKey(key)) live = false;
  else if (isLiveKey(key)) {
    if (!isCoachConnectLive(env)) return { ok: false, reason: 'live_mode_off' };
    live = true;
  } else return { ok: false, reason: 'payments_not_set_up' };
  const origin = siteOrigin(env);
  if (!origin) return { ok: false, reason: 'site_url_not_set' };
  return { ok: true, key, live, origin };
}

/** Is a coach's page allowed to show a Book button at all? (The switch is on and the key passes the fence.) */
export function paymentsLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return connectGate(env).ok;
}

/** The 409 every closed money route answers. Retryable, friendly, never a 5xx. One PII-free log line. */
export function paymentsClosed(reason: ConnectClosedReason): NextResponse {
  console.warn(`[coach-business] payments closed reason=${reason}`);
  return NextResponse.json({ error: 'store_closed', reason, message: PAYMENTS_NOT_LIVE }, { status: 409 });
}

/** The subset of the Stripe SDK this file calls, so a test hands in a recorder instead of the network. */
export interface ConnectStripe {
  accounts: Pick<Stripe['accounts'], 'create' | 'retrieve' | 'createLoginLink'>;
  accountLinks: Pick<Stripe['accountLinks'], 'create'>;
  checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'create' | 'retrieve'> };
  refunds: Pick<Stripe['refunds'], 'create'>;
  charges: Pick<Stripe['charges'], 'retrieve'>;
  subscriptions: Pick<Stripe['subscriptions'], 'cancel'>;
  applicationFees: Pick<Stripe['applicationFees'], 'retrieve' | 'createRefund'>;
  invoices: Pick<Stripe['invoices'], 'retrieve' | 'update'>;
  paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve'>;
}

/** The part of the Stripe SDK the webhook needs for the fee steps (a subset of ConnectStripe). */
export type ConnectFeeStripe = Pick<ConnectStripe, 'applicationFees' | 'invoices' | 'paymentIntents' | 'charges'>;

/** Create the coach's Express account. Idempotent at Stripe for 24 h on the user id; the store keeps the first id for good. */
export async function createExpressAccount(stripe: ConnectStripe, input: { userId: string; email: string | null; profileUrl: string | null }): Promise<{ id: string; livemode: boolean }> {
  const acct = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    ...(input.email ? { email: input.email } : {}),
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: {
      product_description: 'Athletic coaching sold through Final Evolution',
      ...(input.profileUrl ? { url: input.profileUrl } : {}),
    },
    metadata: { userId: input.userId, product: CONNECT_PRODUCT },
  }, { idempotencyKey: `coach-connect-account:${input.userId}` });
  return { id: acct.id, livemode: Boolean((acct as { livemode?: boolean }).livemode) };
}

export async function onboardingLink(stripe: ConnectStripe, accountId: string, origin: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${origin}/coach/business?connect=refresh`,
    return_url: `${origin}/coach/business?connect=return`,
  });
  return link.url;
}

export interface ConnectStatus { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }

export async function readAccountStatus(stripe: ConnectStripe, accountId: string): Promise<ConnectStatus> {
  const a = await stripe.accounts.retrieve(accountId);
  return { chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
}

/** The coach's Express dashboard (balance, payouts, payout schedule, bank details). Single-use URL. */
export async function expressDashboardLink(stripe: ConnectStripe, accountId: string): Promise<string> {
  const l = await stripe.accounts.createLoginLink(accountId);
  return l.url;
}

export interface CheckoutInput {
  pkg: CoachPackage;
  saleId: string;
  buyerId: string;
  customerId: string;
  coachSlug: string;
  destination: string;
  /** The money split of this sale (fees.ts saleSplit of the package price). */
  split: SaleSplit;
  origin: string;
  now: Date;
}

/** The metadata every object of a Connect sale carries, so the shared webhook can route it here (webhook.ts), and so each
 *  monthly invoice knows its exact split (the subscription's metadata is copied onto every invoice). */
export function saleMetadata(input: Pick<CheckoutInput, 'saleId' | 'pkg' | 'buyerId' | 'split'>): Record<string, string> {
  return {
    product: CONNECT_PRODUCT, saleId: input.saleId, packageId: input.pkg.id, coachId: input.pkg.coachId, buyerId: input.buyerId,
    priceCents: String(input.split.priceCents),
    processingFeeCents: String(input.split.processingFeeCents),
    totalCents: String(input.split.totalCents),
    felShareCents: String(input.split.felShareCents),
    appFeeCents: String(input.split.applicationFeeCents),
  };
}

/** The name of the buyer's processing-fee line, on Checkout and on every invoice. */
export const PROCESSING_FEE_LINE = 'Processing fee';

/** The Checkout Session parameters for one package. Pure, so the split and the destination are asserted without Stripe.
 *  Two line items: the package at its listed price, and the processing fee, so the buyer sees price, fee and total. */
export function checkoutParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const meta = saleMetadata(input);
  const monthly = billingOf(input.pkg.kind) === 'month';
  const recurring = monthly ? { recurring: { interval: 'month' as const } } : {};
  const lineItems = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: input.pkg.title.slice(0, 120), ...(input.pkg.summary ? { description: input.pkg.summary.slice(0, 300) } : {}) },
        unit_amount: input.split.priceCents,
        ...recurring,
      },
      quantity: 1,
    },
    ...(input.split.processingFeeCents > 0
      ? [{
          price_data: {
            currency: 'usd',
            product_data: { name: PROCESSING_FEE_LINE, description: 'Card processing for this purchase.' },
            unit_amount: input.split.processingFeeCents,
            ...recurring,
          },
          quantity: 1,
        }]
      : []),
  ];
  const common = {
    customer: input.customerId,
    client_reference_id: input.buyerId,
    line_items: lineItems,
    metadata: meta,
    expires_at: Math.floor(input.now.getTime() / 1000) + CHECKOUT_HOLD_MINUTES * 60,
    success_url: `${input.origin}/coach/business/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/coach/${encodeURIComponent(input.coachSlug)}?checkout=cancel`,
  };
  if (monthly) {
    return {
      ...common,
      mode: 'subscription',
      subscription_data: {
        // The first invoice takes at least A (rounded up); the webhook hands any excess back and sets A exactly on every
        // renewal (fees.ts "monthly coaching").
        application_fee_percent: subscriptionFeePercent(input.split),
        transfer_data: { destination: input.destination },
        on_behalf_of: input.destination,
        metadata: meta,
      },
    };
  }
  return {
    ...common,
    mode: 'payment',
    payment_intent_data: {
      application_fee_amount: input.split.applicationFeeCents,
      transfer_data: { destination: input.destination },
      on_behalf_of: input.destination,
      metadata: meta,
    },
  };
}

export async function createCheckout(stripe: ConnectStripe, input: CheckoutInput): Promise<{ id: string; url: string | null }> {
  const s = await stripe.checkout.sessions.create(checkoutParams(input), { idempotencyKey: `coach-connect-checkout:${input.saleId}` });
  return { id: s.id, url: s.url };
}

/**
 * Refund part or all of a one-off sale's PRICE: the coach's transfer is reversed in proportion. FEL's share is handed back
 * separately and exactly (returnApplicationFee, called by webhook.ts recordConnectRefund), not by Stripe's
 * refund_application_fee, which would return the same share of the whole application fee, processing fee included.
 */
export async function refundPayment(stripe: ConnectStripe, input: { saleId: string; paymentIntentId: string; amountCents: number; cumulativeAfter: number }): Promise<{ chargeId: string | null }> {
  const r = await stripe.refunds.create({
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
    reverse_transfer: true,
    refund_application_fee: false,
    metadata: { product: CONNECT_PRODUCT, saleId: input.saleId },
  }, { idempotencyKey: `coach-connect-refund:${input.saleId}:${input.cumulativeAfter}` });
  const charge = r.charge;
  return { chargeId: typeof charge === 'string' ? charge : charge?.id ?? null };
}

/**
 * Make the application fee `feeId` refunded to the coach by `targetCents` in all. State-based: Stripe's own
 * amount_refunded on the fee is read first, so a retry (a redelivered event, a crash between two steps, a key older than
 * Stripe's 24 h idempotency window) never hands back twice. Returns what this call refunded.
 */
export async function returnApplicationFee(stripe: ConnectFeeStripe, feeId: string, targetCents: number, key: string, metadata: Record<string, string>): Promise<number> {
  const fee = await stripe.applicationFees.retrieve(feeId);
  const due = Math.min(feeRefundDue(targetCents, Number(fee.amount_refunded ?? 0)), Math.max(0, Number(fee.amount ?? 0) - Number(fee.amount_refunded ?? 0)));
  if (due <= 0) return 0;
  await stripe.applicationFees.createRefund(feeId, { amount: due, metadata: { product: CONNECT_PRODUCT, ...metadata } }, { idempotencyKey: `${key}:${targetCents}` });
  return due;
}

const idOfAny = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null);

/** The charge behind a paid invoice and the application fee Stripe took on it (basil: invoice.payments). */
export async function invoiceFee(stripe: ConnectFeeStripe, invoiceId: string): Promise<{ chargeId: string; feeId: string | null; feeCents: number } | null> {
  const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payments'] });
  const { paymentIntentId, chargeId } = invoiceChargeOrIntent(inv);
  let charge: Stripe.Charge | null = null;
  if (chargeId) charge = await stripe.charges.retrieve(chargeId);
  else if (paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  }
  if (!charge) return null;
  return { chargeId: charge.id, feeId: idOfAny(charge.application_fee), feeCents: Number(charge.application_fee_amount ?? 0) };
}
