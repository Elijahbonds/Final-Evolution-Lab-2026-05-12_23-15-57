// lib/coach-business/events.ts — PAYMENTS-READY (2026-10-26): the Stripe events the coach business was missing before
// payments go live. The shared webhook (app/api/stripe/webhook/route.ts) asks this file first for:
//
//   account.updated            — a coach's Express account changed (charges/payouts enabled, Stripe asking for more).
//                                A CONNECT event: Stripe sends it to an endpoint subscribed to "events on connected
//                                accounts", which has its own signing secret (STRIPE_CONNECT_WEBHOOK_SECRET; the route
//                                accepts either secret). The account is RE-READ from Stripe (state-based: Stripe does not
//                                order events, so an older account.updated can never overwrite a newer state), and the
//                                coach's row keeps charges / payouts / details submitted and, once the payments-ready SQL
//                                is applied, requirementsDue. /coach/business shows "Finish your Stripe setup" from them.
//   charge.dispute.created / .updated / .closed / .funds_withdrawn / .funds_reinstated
//                              — a buyer disputed a coach's sale. A destination charge lives on FEL's platform account, so
//                                these are PLATFORM events (the existing endpoint), and FEL is liable: Stripe takes the
//                                disputed amount and its dispute fee from FEL's balance (docs/COACH-BUSINESS.md "Why
//                                destination charges"). Each dispute is recorded on the sale (CoachSaleDispute), which is
//                                the coach's in-app notice on /coach/business, and FEL's ledger books what Stripe withdrew
//                                and returned (below).
//
// IDEMPOTENT LIKE THE REST OF THE WEBHOOK (lib/coach-business/webhook.ts): the dispute row is keyed on Stripe's dispute
// id (insert-once), a closed dispute never reopens (compare-and-set on outcome = OPEN), and each ledger row is keyed on
// the dispute and the movement, so a redelivered or out-of-order event books nothing twice. A failure throws and the
// route answers 500 so Stripe retries. An event about anything that is not a coach's sale answers null and the route
// carries on exactly as before (the coach store, FEL Pro, books).
//
// THE LEDGER (FEL's books, docs/COACH-BUSINESS.md "Ledger"). FEL's ledger books FEL's own money. A dispute on a
// destination charge takes money from FEL's platform balance, not the coach's, so it is FEL's: the withdrawal (the
// disputed amount + Stripe's dispute fee, from the dispute's balance transactions) is booked as
// COACH_CONNECT_DISPUTE_WITHDRAWN (PLATFORM_REVENUE debited), and any reinstatement as COACH_CONNECT_DISPUTE_REINSTATED.
// Getting the money back from the coach after a LOST dispute (a transfer reversal) is NOT done here: whether and how FEL
// recovers it is the payout terms' call (owner), so the coach's money is never moved by this file.
import type Stripe from 'stripe';
import { accountStatusOf, type ConnectEventStripe } from './connect';
import { feePostings, feeRefundPostings } from './fees';
import {
  businessReady, connectByAccount, keepDispute, saleById, saleIdByPaymentIntent, saleIdBySubscription, setDisputeFunds, setDisputeStatus,
  updateConnect, type DisputeOutcome, type SaleRow,
} from './store';
import { coachConnectMeta, type ConnectDeps } from './webhook';
import { invoiceSubscriptionId } from '@/lib/stripe/basil-shapes';

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null);

export type ConnectEventOutcome =
  | 'account_updated' | 'account_unknown'
  | 'dispute_recorded' | 'dispute_updated' | 'dispute_closed' | 'dispute_funds' | 'dispute_noop';

export const DISPUTE_EVENTS = [
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
] as const;

export function isDisputeEvent(type: string): boolean {
  return (DISPUTE_EVENTS as readonly string[]).includes(type);
}

/** The webhook's dependencies here: the coach-business deps, with Stripe able to re-read an account and trace a renewal. */
export type EventDeps = Omit<ConnectDeps, 'stripe'> & { stripe(): ConnectEventStripe };

// ── account.updated ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A coach's Express account changed: keep the status Stripe reports NOW. Null when the account is not a coach's. */
export async function connectAccountUpdated(deps: EventDeps, event: Stripe.Event): Promise<ConnectEventOutcome | null> {
  const payload = event.data.object as Stripe.Account;
  const accountId = (event as { account?: string }).account ?? idOf(payload);
  if (!accountId) return null;
  if (!(await businessReady(deps.db))) return null;
  const row = await connectByAccount(deps.db, accountId);
  if (!row) return null;
  const stripe = deps.stripe();
  // state-based: the account as it is now, not as this (possibly older) event saw it
  const current = stripe.accounts ? await stripe.accounts.retrieve(accountId) : payload;
  const status = accountStatusOf(current);
  await updateConnect(deps.db, accountId, status);
  if (status.requirementsDue || !status.chargesEnabled) console.warn('[coach-business] connect account needs the coach (setup unfinished)');
  return 'account_updated';
}

// ── disputes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Which coach sale a dispute is about, or null when it is not one: the one-off sale by its payment intent, else the
 *  charge's Connect metadata, else (a monthly renewal) the invoice that payment belongs to. */
export async function disputeSale(deps: EventDeps, dispute: Stripe.Dispute): Promise<SaleRow | null> {
  if (!(await businessReady(deps.db))) return null;
  const pi = idOf(dispute.payment_intent);
  let saleId = pi ? await saleIdByPaymentIntent(deps.db, pi) : null;
  if (!saleId) {
    const chargeRef = dispute.charge;
    const charge = chargeRef && typeof chargeRef === 'object' ? chargeRef : chargeRef ? await deps.stripe().charges.retrieve(chargeRef) : null;
    saleId = coachConnectMeta(charge)?.saleId ?? null;
  }
  if (!saleId && pi) {
    const stripe = deps.stripe();
    if (stripe.invoicePayments) {
      const list = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 });
      const invoiceId = idOf(list.data[0]?.invoice);
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        saleId = coachConnectMeta(invoice)?.saleId ?? null;
        const subId = saleId ? null : invoiceSubscriptionId(invoice);
        if (subId) saleId = await saleIdBySubscription(deps.db, subId);
      }
    }
  }
  return saleId ? saleById(deps.db, saleId) : null;
}

/** Stripe's dispute status → FEL's outcome. warning_closed (an inquiry that never became a dispute) took no money. */
export function disputeOutcome(status: string): DisputeOutcome {
  if (status === 'won' || status === 'warning_closed') return 'WON';
  if (status === 'lost') return 'LOST';
  return 'OPEN';
}

/** What Stripe has withdrawn from and returned to FEL's balance for this dispute, from its balance transactions (amount +
 *  dispute fee). A funds_withdrawn event without them counts the disputed amount. */
export function disputeFunds(dispute: Stripe.Dispute, type: string): { withdrawnCents: number; reinstatedCents: number } {
  let withdrawn = 0;
  let reinstated = 0;
  for (const bt of dispute.balance_transactions ?? []) {
    const net = Number((bt as { net?: unknown }).net ?? 0);
    if (!Number.isSafeInteger(net)) continue;
    if (net < 0) withdrawn += -net;
    else reinstated += net;
  }
  if (withdrawn === 0 && type === 'charge.dispute.funds_withdrawn') withdrawn = Math.max(0, Number(dispute.amount ?? 0));
  return { withdrawnCents: withdrawn, reinstatedCents: reinstated };
}

async function bookFunds(deps: EventDeps, dispute: Stripe.Dispute, sale: SaleRow, funds: { withdrawnCents: number; reinstatedCents: number }): Promise<void> {
  const meta = { saleId: sale.id, coachId: sale.coachId, disputeId: dispute.id, chargeId: idOf(dispute.charge) ?? '' };
  if (funds.withdrawnCents > 0) {
    await deps.post({
      kind: 'COACH_CONNECT_DISPUTE_WITHDRAWN',
      idempotencyKey: `coach-connect-dispute-withdrawn:${dispute.id}`,
      postings: feeRefundPostings(funds.withdrawnCents),
      metadata: { ...meta, amountCents: funds.withdrawnCents },
    });
  }
  if (funds.reinstatedCents > 0) {
    await deps.post({
      kind: 'COACH_CONNECT_DISPUTE_REINSTATED',
      idempotencyKey: `coach-connect-dispute-reinstated:${dispute.id}`,
      postings: feePostings(funds.reinstatedCents),
      metadata: { ...meta, amountCents: funds.reinstatedCents },
    });
  }
}

/** A dispute event about a coach's sale: record it, move its outcome, book the money. Null when it is not a coach sale. */
export async function connectDispute(deps: EventDeps, event: Stripe.Event): Promise<ConnectEventOutcome | null> {
  const dispute = event.data.object as Stripe.Dispute;
  const sale = await disputeSale(deps, dispute);
  if (!sale) return null;
  const outcome = disputeOutcome(String(dispute.status));
  const row = await keepDispute(deps.db, {
    id: dispute.id, saleId: sale.id, coachId: sale.coachId, chargeId: idOf(dispute.charge) ?? '', amountCents: Math.max(0, Number(dispute.amount ?? 0)),
    reason: String(dispute.reason ?? '').slice(0, 64), stripeStatus: String(dispute.status ?? '').slice(0, 64), livemode: !!dispute.livemode,
  });
  if (!row) console.warn('[coach-business] dispute on a coach sale (payments-ready SQL not applied: no row kept)');

  // the money, from the dispute's own balance transactions, on every dispute event (created usually carries the withdrawal)
  const funds = disputeFunds(dispute, event.type);
  await bookFunds(deps, dispute, sale, funds);
  let fundsMoved = false;
  if (row && (funds.withdrawnCents > row.withdrawnCents || funds.reinstatedCents > row.reinstatedCents)) {
    const after = { withdrawnCents: Math.max(row.withdrawnCents, funds.withdrawnCents), reinstatedCents: Math.max(row.reinstatedCents, funds.reinstatedCents) };
    fundsMoved = await setDisputeFunds(deps.db, row.id, row, after);
  }

  let moved = false;
  if (row && row.outcome === 'OPEN' && (outcome !== 'OPEN' || row.stripeStatus !== String(dispute.status))) {
    moved = await setDisputeStatus(deps.db, row.id, String(dispute.status).slice(0, 64), outcome);
  }
  console.warn(`[coach-business] coach sale dispute event=${event.type} outcome=${outcome}`);
  if (event.type === 'charge.dispute.created') return 'dispute_recorded';
  if (outcome !== 'OPEN' && moved) return 'dispute_closed';
  if (fundsMoved) return 'dispute_funds';
  if (moved) return 'dispute_updated';
  return 'dispute_noop';
}

/** The route's one entry point here: an account or dispute event that is the coach business's, or null. */
export async function coachConnectEvent(deps: EventDeps, event: Stripe.Event): Promise<ConnectEventOutcome | null> {
  if (event.type === 'account.updated') return connectAccountUpdated(deps, event);
  if (isDisputeEvent(event.type)) return connectDispute(deps, event);
  return null;
}

