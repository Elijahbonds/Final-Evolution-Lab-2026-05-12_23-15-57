// lib/coach-business/connect.ts — COACH-BUSINESS: Stripe Connect (Express) for coaches who charge their clients
// through FEL (owner, 2026-10-25: a 5% revenue share; payments live only when the owner switches them on).
//
// THE MONEY PATH. A DESTINATION CHARGE on FEL's platform account: the buyer pays the package price, Stripe moves it to
// the coach's Express account (transfer_data.destination, on_behalf_of the coach so the coach is the merchant of record),
// and FEL keeps `application_fee_amount` = 5% (fees.ts). Monthly coaching is a subscription with
// application_fee_percent = 5. Refunds reverse the transfer AND hand back the fee in proportion (reverse_transfer +
// refund_application_fee), so a refund never comes out of FEL's pocket alone. Payouts are Stripe's: an Express account
// is paid out on Stripe's schedule, and the coach opens their Express dashboard through a login link.
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
import { CHECKOUT_HOLD_MINUTES, CONNECT_FEE_BPS, PAYMENTS_NOT_LIVE, isCoachConnectLive, isCoachConnectPaymentsEnabled } from './config';
import { billingOf, type CoachPackage } from './packages';

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
}

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
  feeCents: number;
  origin: string;
  now: Date;
}

/** The metadata every object of a Connect sale carries, so the shared webhook can route it here (webhook.ts). */
export function saleMetadata(input: Pick<CheckoutInput, 'saleId' | 'pkg' | 'buyerId'>): Record<string, string> {
  return { product: CONNECT_PRODUCT, saleId: input.saleId, packageId: input.pkg.id, coachId: input.pkg.coachId, buyerId: input.buyerId };
}

/** The Checkout Session parameters for one package. Pure, so the 5% and the destination are asserted without Stripe. */
export function checkoutParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const meta = saleMetadata(input);
  const lineItem = {
    price_data: {
      currency: 'usd',
      product_data: { name: input.pkg.title.slice(0, 120), ...(input.pkg.summary ? { description: input.pkg.summary.slice(0, 300) } : {}) },
      unit_amount: input.pkg.priceCents,
      ...(billingOf(input.pkg.kind) === 'month' ? { recurring: { interval: 'month' as const } } : {}),
    },
    quantity: 1,
  };
  const common = {
    customer: input.customerId,
    client_reference_id: input.buyerId,
    line_items: [lineItem],
    metadata: meta,
    expires_at: Math.floor(input.now.getTime() / 1000) + CHECKOUT_HOLD_MINUTES * 60,
    success_url: `${input.origin}/coach/business/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/coach/${encodeURIComponent(input.coachSlug)}?checkout=cancel`,
  };
  if (billingOf(input.pkg.kind) === 'month') {
    return {
      ...common,
      mode: 'subscription',
      subscription_data: {
        application_fee_percent: CONNECT_FEE_BPS / 100,
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
      application_fee_amount: input.feeCents,
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

/** Refund part or all of a one-off sale: the coach's transfer is reversed and FEL's fee handed back in proportion. */
export async function refundPayment(stripe: ConnectStripe, input: { saleId: string; paymentIntentId: string; amountCents: number; cumulativeAfter: number }): Promise<{ chargeId: string | null }> {
  const r = await stripe.refunds.create({
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: { product: CONNECT_PRODUCT, saleId: input.saleId },
  }, { idempotencyKey: `coach-connect-refund:${input.saleId}:${input.cumulativeAfter}` });
  const charge = r.charge;
  return { chargeId: typeof charge === 'string' ? charge : charge?.id ?? null };
}
