// lib/coach-business/service.ts — COACH-BUSINESS: the checks, in order, behind the money and application routes.
// Every dependency is passed in (database, Stripe, age, plan), so the tests drive the real order of refusals and can
// prove that a closed switch reaches neither the database nor Stripe.
import { connectGate, createCheckout, refundPayment, type ConnectGate, type ConnectStripe } from './connect';
import { CHECKOUT_HOLD_MINUTES, isCoachProEnabled, platformFeePolicy, refundProcessingFee } from './config';
import { chargeRefundCents, monthStartUtc, needsMonthToDate, platformFee, saleSplit } from './fees';
import { BUYER_TERMS, checkTerms, type TermsBody } from '@/lib/payments/terms';
import { featureGate, type CoachPlan } from './plan';
import { cleanGoals } from './market';
import { attachCheckout, businessReady, coachFeesThisMonth, connectFor, holdSpot, markExpired, packageById, saleById, saveApplication, type TxDb } from './store';
import { recordConnectRefund, type ConnectDeps } from './webhook';

export type Refusal = { ok: false; status: number; error: string; reason?: string; message?: string; version?: string | null };

export interface CheckoutDeps {
  db: TxDb;
  stripe: () => ConnectStripe;
  env: NodeJS.ProcessEnv;
  now: Date;
  isAdult(userId: string): Promise<boolean>;
  plan(userId: string): Promise<CoachPlan>;
  ensureCustomer(userId: string): Promise<string>;
  coachSlug(coachId: string): Promise<string | null>;
  /** PAYMENTS-READY: FEL's fees from a coach so far this month, asked only under a monthly cap (default: the ledger). */
  feesThisMonth?(coachId: string, now: Date): Promise<number>;
}

export type CheckoutResult = { ok: true; url: string | null; saleId: string } | Refusal;

const closed = (g: Extract<ConnectGate, { ok: false }>): Refusal => ({ ok: false, status: 409, error: 'store_closed', reason: g.reason });

/**
 * A buyer starts a package checkout. In order: the payments fence (switch, key, live fence, site URL) → the tables → the
 * package (active, not the coach's own) → the coach can charge (Connect ready; Pro, when the gates are on) → the buyer is
 * a verified adult → the buyer's terms tick (PAYMENTS-READY: 409 terms_required, the store terms' answer) → FEL's share
 * (by the coach's plan, under the monthly cap) → a capacity spot is held → Stripe. A Stripe failure releases the spot.
 */
export async function startPackageCheckout(deps: CheckoutDeps, buyerId: string, packageId: string, terms?: TermsBody | null): Promise<CheckoutResult> {
  const gate = connectGate(deps.env);
  if (!gate.ok) return closed(gate);
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const pkg = await packageById(deps.db, packageId);
  if (!pkg || !pkg.active) return { ok: false, status: 404, error: 'package_not_found' };
  if (pkg.coachId === buyerId) return { ok: false, status: 400, error: 'own_package', message: 'You cannot buy your own package.' };
  const acct = await connectFor(deps.db, pkg.coachId);
  if (!acct || !acct.chargesEnabled) return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  if (acct.livemode !== gate.live) return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  const plan = await deps.plan(pkg.coachId);
  if (!featureGate(plan, 'payments', isCoachProEnabled(deps.env)).ok) {
    return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  }
  if (!(await deps.isAdult(buyerId))) {
    return { ok: false, status: 403, error: 'adults_only', message: 'Purchases are for verified adults (18+). Under 18? A parent or guardian contacts the coach.' };
  }
  const slug = await deps.coachSlug(pkg.coachId);
  if (!slug) return { ok: false, status: 404, error: 'package_not_found' };
  // PAYMENTS-READY: the buyer's terms tick, before any spot is held or Stripe is called (the store terms' 409).
  const tick = checkTerms(terms, BUYER_TERMS.coach_package.version, deps.now);
  if (!tick.ok) return { ok: false, status: tick.status, error: tick.body.error, version: tick.body.version };
  // The buyer pays the price plus the processing fee; the sale records the price and FEL's share of it (fees.ts): 5% by
  // default, or the owner's PLATFORM_FEE_* settings by the coach's plan and monthly cap (config.ts).
  const policy = platformFeePolicy(deps.env);
  const soFar = needsMonthToDate(policy)
    ? await (deps.feesThisMonth ? deps.feesThisMonth(pkg.coachId, deps.now) : coachFeesThisMonth(deps.db, pkg.coachId, monthStartUtc(deps.now), deps.now))
    : 0;
  const share = platformFee(policy, plan, pkg.priceCents, soFar);
  const split = saleSplit(pkg.priceCents, undefined, share.felShareCents);
  const held = await holdSpot(deps.db, { pkg, buyerId, feeCents: split.felShareCents, stripeAccountId: acct.stripeAccountId, livemode: gate.live, now: deps.now, holdMinutes: CHECKOUT_HOLD_MINUTES });
  if (!held.ok) return { ok: false, status: 409, error: 'package_full', message: 'This package is full right now.' };
  try {
    const stripe = deps.stripe();
    const customerId = await deps.ensureCustomer(buyerId);
    const s = await createCheckout(stripe, { pkg, saleId: held.saleId, buyerId, customerId, coachSlug: slug, destination: acct.stripeAccountId, split, origin: gate.origin, now: deps.now, terms: tick.accepted });
    await attachCheckout(deps.db, held.saleId, s.id);
    return { ok: true, url: s.url, saleId: held.saleId };
  } catch (e) {
    await markExpired(deps.db, held.saleId).catch(() => false);
    console.error('[coach-business] checkout failed', e instanceof Error ? e.name : typeof e);
    return { ok: false, status: 502, error: 'checkout_failed', message: 'Checkout could not start. Try again.' };
  }
}

export interface RefundDeps { db: TxDb; stripe: () => ConnectStripe; env: NodeJS.ProcessEnv; ledger: ConnectDeps }
export type RefundResult = { ok: true; refundedCents: number; status: string } | Refusal;

/**
 * The coach refunds part or all of a one-off sale's price (the processing fee is not refunded: fees.ts "REFUNDS"). Monthly
 * coaching is cancelled, not refunded, here (the Stripe dashboard refunds an invoice). The sale's record and FEL's ledger move at once, through the same code the webhook runs, so the
 * webhook's later charge.refunded finds nothing left to do.
 */
export async function refundSale(deps: RefundDeps, coachId: string, saleId: string, amountCents: number | null): Promise<RefundResult> {
  const gate = connectGate(deps.env);
  if (!gate.ok) return closed(gate);
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const sale = await saleById(deps.db, saleId);
  if (!sale || sale.coachId !== coachId) return { ok: false, status: 404, error: 'sale_not_found' };
  if (sale.kind === 'monthly') {
    if (sale.status !== 'ACTIVE' || !sale.subscriptionId) return { ok: false, status: 409, error: 'not_active' };
    await deps.stripe().subscriptions.cancel(sale.subscriptionId);
    return { ok: true, refundedCents: 0, status: 'CANCELED' };
  }
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(sale.status) || !sale.paymentIntentId) return { ok: false, status: 409, error: 'not_refundable' };
  const left = sale.amountCents - sale.refundedCents;
  const amount = amountCents ?? left;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > left) return { ok: false, status: 400, error: 'invalid_amount' };
  const after = sale.refundedCents + amount;
  // PAYMENTS-READY: with REFUND_PROCESSING_FEE on the buyer also gets the same share of the processing fee back, so the
  // refund to Stripe is the charge's step, not the price's (fees.ts chargeRefundCents). Off: the price step, as before.
  let refundCents = amount;
  let chargeAfter = after;
  let paymentAmount: number | undefined;
  if (refundProcessingFee(deps.env)) {
    try {
      const pi = await deps.stripe().paymentIntents.retrieve(sale.paymentIntentId);
      paymentAmount = Number((pi as { amount?: unknown }).amount);
    } catch (e) {
      console.error('[coach-business] refund: payment not read', e instanceof Error ? e.name : typeof e);
      return { ok: false, status: 502, error: 'refund_failed', message: 'The refund did not go through. Try again.' };
    }
    const processing = Number.isSafeInteger(paymentAmount) && (paymentAmount as number) >= sale.amountCents ? (paymentAmount as number) - sale.amountCents : saleSplit(sale.amountCents).processingFeeCents;
    const shape = { priceCents: sale.amountCents, processingFeeCents: processing };
    chargeAfter = chargeRefundCents(shape, after, true);
    refundCents = chargeAfter - chargeRefundCents(shape, sale.refundedCents, true);
  }
  let r: { chargeId: string | null };
  try {
    r = await refundPayment(deps.stripe(), { saleId: sale.id, paymentIntentId: sale.paymentIntentId, amountCents: refundCents, cumulativeAfter: after });
  } catch (e) {
    console.error('[coach-business] refund failed', e instanceof Error ? e.name : typeof e);
    return { ok: false, status: 502, error: 'refund_failed', message: 'The refund did not go through. Try again.' };
  }
  if (r.chargeId) {
    // Stripe has accepted the refund. If handing back FEL's share or booking it fails here, the charge.refunded webhook
    // runs the same step (state-based, so nothing is paid twice) and Stripe retries it until it succeeds.
    try {
      const charge = await deps.stripe().charges.retrieve(r.chargeId);
      const fee = charge.application_fee;
      await recordConnectRefund({ ...deps.ledger, env: deps.ledger.env ?? deps.env }, sale.id, {
        id: r.chargeId,
        refundedTotal: Number(charge.amount_refunded ?? chargeAfter),
        applicationFeeId: typeof fee === 'string' ? fee : fee?.id ?? null,
        amountCents: Number((charge as { amount?: unknown }).amount ?? paymentAmount),
      });
    } catch (e) {
      console.error('[coach-business] refund recorded later by the webhook', e instanceof Error ? e.message : typeof e);
    }
  }
  return { ok: true, refundedCents: after, status: after >= sale.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED' };
}

export const APPLY_NOTE_MAX = 500;

export interface ApplyDeps {
  db: TxDb;
  env: NodeJS.ProcessEnv;
  isAdult(userId: string): Promise<boolean>;
  /** The coach behind a public slug, when that coach is published and listed (or the coach store is theirs). */
  coachBySlug(slug: string): Promise<{ userId: string; acceptingClients: boolean } | null>;
}

export type ApplyResult = { ok: true } | Refusal;

/** Under 18 (or age unknown): no application. The page sends them to the guardian path instead. */
export const GUARDIAN_PATH = {
  error: 'guardian_required',
  message: 'Under 18? A parent or guardian contacts the coach. The coach then sends a join code, and your parent or guardian approves it.',
} as const;

/**
 * An adult applies to a coach. A minor is never put in contact here: the answer is the guardian path (the coach's join
 * code with guardian consent, lib/coach/teenGate.ts) — nothing about the minor is stored.
 */
export async function applyToCoach(deps: ApplyDeps, applicantId: string, body: unknown): Promise<ApplyResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const slug = typeof b.slug === 'string' ? b.slug : '';
  const goal = cleanGoals([b.goal])[0];
  if (!slug || !goal) return { ok: false, status: 400, error: 'invalid_body' };
  const note = typeof b.note === 'string' ? b.note.replace(/\s+/g, ' ').trim().slice(0, APPLY_NOTE_MAX) : '';
  if (!(await deps.isAdult(applicantId))) return { ok: false, status: 403, ...GUARDIAN_PATH };
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const coach = await deps.coachBySlug(slug);
  if (!coach) return { ok: false, status: 404, error: 'coach_not_found' };
  if (coach.userId === applicantId) return { ok: false, status: 400, error: 'own_profile' };
  if (!coach.acceptingClients) return { ok: false, status: 409, error: 'not_accepting', message: "This coach isn't taking new clients right now." };
  let packageId: string | null = null;
  if (typeof b.packageId === 'string' && b.packageId) {
    const pkg = await packageById(deps.db, b.packageId);
    if (!pkg || pkg.coachId !== coach.userId || !pkg.active) return { ok: false, status: 404, error: 'package_not_found' };
    packageId = pkg.id;
  }
  await saveApplication(deps.db, { coachId: coach.userId, applicantId, packageId, goal, note });
  return { ok: true };
}
