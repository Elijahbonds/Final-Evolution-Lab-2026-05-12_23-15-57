// lib/coach-business/service.ts — COACH-BUSINESS: the checks, in order, behind the money and application routes.
// Every dependency is passed in (database, Stripe, age, plan), so the tests drive the real order of refusals and can
// prove that a closed switch reaches neither the database nor Stripe.
import { connectGate, createCheckout, refundPayment, type ConnectGate, type ConnectStripe } from './connect';
import { CHECKOUT_HOLD_MINUTES, isCoachProEnabled } from './config';
import { applicationFeeCents } from './fees';
import { featureGate, type CoachPlan } from './plan';
import { cleanGoals } from './market';
import { attachCheckout, businessReady, connectFor, holdSpot, markExpired, packageById, saleById, saveApplication, type TxDb } from './store';
import { recordConnectRefund, type ConnectDeps } from './webhook';

export type Refusal = { ok: false; status: number; error: string; reason?: string; message?: string };

export interface CheckoutDeps {
  db: TxDb;
  stripe: () => ConnectStripe;
  env: NodeJS.ProcessEnv;
  now: Date;
  isAdult(userId: string): Promise<boolean>;
  plan(userId: string): Promise<CoachPlan>;
  ensureCustomer(userId: string): Promise<string>;
  coachSlug(coachId: string): Promise<string | null>;
}

export type CheckoutResult = { ok: true; url: string | null; saleId: string } | Refusal;

const closed = (g: Extract<ConnectGate, { ok: false }>): Refusal => ({ ok: false, status: 409, error: 'store_closed', reason: g.reason });

/**
 * A buyer starts a package checkout. In order: the payments fence (switch, key, live fence, site URL) → the tables → the
 * package (active, not the coach's own) → the coach can charge (Connect ready; Pro, when the gates are on) → the buyer is
 * a verified adult → a capacity spot is held → Stripe. A Stripe failure releases the spot.
 */
export async function startPackageCheckout(deps: CheckoutDeps, buyerId: string, packageId: string): Promise<CheckoutResult> {
  const gate = connectGate(deps.env);
  if (!gate.ok) return closed(gate);
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const pkg = await packageById(deps.db, packageId);
  if (!pkg || !pkg.active) return { ok: false, status: 404, error: 'package_not_found' };
  if (pkg.coachId === buyerId) return { ok: false, status: 400, error: 'own_package', message: 'You cannot buy your own package.' };
  const acct = await connectFor(deps.db, pkg.coachId);
  if (!acct || !acct.chargesEnabled) return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  if (acct.livemode !== gate.live) return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  if (!featureGate(await deps.plan(pkg.coachId), 'payments', isCoachProEnabled(deps.env)).ok) {
    return { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };
  }
  if (!(await deps.isAdult(buyerId))) {
    return { ok: false, status: 403, error: 'adults_only', message: 'Purchases are for verified adults (18+). Under 18? A parent or guardian contacts the coach.' };
  }
  const slug = await deps.coachSlug(pkg.coachId);
  if (!slug) return { ok: false, status: 404, error: 'package_not_found' };
  const feeCents = applicationFeeCents(pkg.priceCents);
  const held = await holdSpot(deps.db, { pkg, buyerId, feeCents, stripeAccountId: acct.stripeAccountId, livemode: gate.live, now: deps.now, holdMinutes: CHECKOUT_HOLD_MINUTES });
  if (!held.ok) return { ok: false, status: 409, error: 'package_full', message: 'This package is full right now.' };
  try {
    const stripe = deps.stripe();
    const customerId = await deps.ensureCustomer(buyerId);
    const s = await createCheckout(stripe, { pkg, saleId: held.saleId, buyerId, customerId, coachSlug: slug, destination: acct.stripeAccountId, feeCents, origin: gate.origin, now: deps.now });
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
 * The coach refunds part or all of a one-off sale. Monthly coaching is cancelled, not refunded, here (the Stripe dashboard
 * refunds an invoice). The sale's record and FEL's ledger move at once, through the same code the webhook runs, so the
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
  const r = await refundPayment(deps.stripe(), { saleId: sale.id, paymentIntentId: sale.paymentIntentId, amountCents: amount, cumulativeAfter: after });
  if (r.chargeId) {
    const charge = await deps.stripe().charges.retrieve(r.chargeId);
    await recordConnectRefund(deps.ledger, sale.id, r.chargeId, Number(charge.amount_refunded ?? after));
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
