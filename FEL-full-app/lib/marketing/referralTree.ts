// REFERRAL TREE — recurring commissions across a bounded upline (2026-09-13).
//
// The Coaching & Creator Economy brief: "Multi-tier referral architecture — compliant affiliate trees —
// recurring commissions on downstream athlete memberships and Academy enrollments." Owner approved building
// the full tree.
//
// WHAT EXISTED: a single level, paying a one-off shard grant on signup (ReferralCode / ReferralConversion).
// That is a thank-you, not an affiliate program.
//
// THE FOUR PROPERTIES THIS FILE ENFORCES, and why they are in the code rather than in a policy document.
// Every one of them is the difference between an affiliate program and the thing an affiliate program is
// mistaken for, and every one is checked by a test:
//
//   1. COMMISSION IS PAID ON PRODUCT REVENUE, NEVER ON RECRUITMENT. A signup pays nothing. Money moves only
//      when somebody actually buys a subscription or an Academy enrollment. Paying people for recruiting
//      people, with no product changing hands, is the single clearest marker of the structure this is not.
//   2. DEPTH IS BOUNDED, in code, at MAX_DEPTH. An unbounded upline is unbounded liability.
//   3. THE TOTAL IS BOUNDED and provably under the platform's own take. Rates that sum past revenue are how
//      a program pays out more than it earns, which is a solvency problem before it is anything else.
//   4. NO CYCLES AND NO SELF-REFERRAL. A chain containing the payer, or the same account twice, pays nobody.
//
// I am not able to make the legal determination for any given jurisdiction — that is the owner's counsel's
// call before this ships enabled. What this file does is make the engineering honest: the structure it
// implements is the one described above and nothing else, and the tests say so.
//
// Pure: no Prisma, no DOM. The ledger adapter lives elsewhere; this decides WHO is owed WHAT.

/** How far up a chain a commission can reach. Bounded in code, not in configuration. */
export const MAX_DEPTH = 3;

/**
 * Commission rate per level, as a fraction of the qualifying payment.
 *
 * Decreasing by design: the person who actually brought the customer in earns the overwhelming share, and
 * the levels above are a small, decaying acknowledgement rather than the point of the program. A flat or
 * increasing curve is what makes upline depth the thing worth chasing instead of the sale.
 */
export const LEVEL_RATES: readonly number[] = [0.20, 0.05, 0.02];

/** Everything the tree can pay out on one payment, as a fraction. Must stay under PLATFORM_TAKE. */
export const TOTAL_RATE = LEVEL_RATES.reduce((a, b) => a + b, 0);

/** The platform's own share of a qualifying payment. Commissions come out of THIS, never out of thin air. */
export const PLATFORM_TAKE = 0.30;

/** What a payment has to be for, for anybody to earn on it. Recruitment is deliberately not on this list. */
export type QualifyingKind = 'subscription' | 'academy_enrollment' | 'coaching_retainer';

export const QUALIFYING_KINDS: readonly QualifyingKind[] = ['subscription', 'academy_enrollment', 'coaching_retainer'];

export function isQualifying(kind: string): kind is QualifyingKind {
  return (QUALIFYING_KINDS as readonly string[]).includes(kind);
}

export interface Payment {
  /** Stable id of the payment. Commission ids derive from it, so a replay is idempotent. */
  id: string;
  /** Who paid. */
  payerId: string;
  /** Cents. */
  amountCents: number;
  kind: string;
  /** Is this a renewal rather than the first payment? Commissions recur, which is the brief's ask. */
  recurring: boolean;
}

export interface Commission {
  /** `${payment.id}:${level}` — the idempotency key. One payment can never pay a level twice. */
  id: string;
  earnerId: string;
  /** 1 is the direct referrer. */
  level: number;
  amountCents: number;
  paymentId: string;
}

export interface TreeResult {
  commissions: Commission[];
  totalCents: number;
  /** Why nothing was paid, when nothing was. Empty when commissions were produced. */
  rejected: string | null;
}

/**
 * Who earns what on this payment.
 *
 * `upline` is the chain above the payer, nearest first: `[directReferrer, theirReferrer, ...]`. It is passed
 * in rather than looked up so this stays pure and so the caller owns the (expensive, cycle-prone) walk.
 */
export function commissionsFor(payment: Payment, upline: readonly string[]): TreeResult {
  const none = (why: string): TreeResult => ({ commissions: [], totalCents: 0, rejected: why });

  // 1. product revenue only
  if (!isQualifying(payment.kind)) {
    return none(`"${payment.kind}" is not a qualifying purchase — commissions are paid on product revenue only.`);
  }
  if (!Number.isFinite(payment.amountCents) || payment.amountCents <= 0) {
    return none('No qualifying amount.');
  }

  // 4. no self-referral, no repeats, no cycles
  if (upline.includes(payment.payerId)) {
    return none('The payer appears in their own upline.');
  }
  if (new Set(upline).size !== upline.length) {
    return none('The upline repeats an account.');
  }

  // 2. bounded depth — the slice is the bound, and MAX_DEPTH is never read from config
  const chain = upline.slice(0, MAX_DEPTH);

  const commissions: Commission[] = chain.map((earnerId, i) => ({
    id: `${payment.id}:${i + 1}`,
    earnerId,
    level: i + 1,
    // floor, so rounding can only ever favour the platform's solvency rather than overpay the tree
    amountCents: Math.floor(payment.amountCents * LEVEL_RATES[i]),
    paymentId: payment.id,
  })).filter((c) => c.amountCents > 0);

  return {
    commissions,
    totalCents: commissions.reduce((n, c) => n + c.amountCents, 0),
    rejected: commissions.length ? null : 'Nothing to pay.',
  };
}

/**
 * Walk an upline safely from a parent map.
 *
 * Returns the chain nearest-first, stopping at MAX_DEPTH, at a missing parent, or the moment a loop is
 * detected. A referral graph built from user input WILL contain a cycle eventually — someone's referrer
 * ends up downstream of them through a support fix or a merge — and a naive walk hangs the request.
 */
export function walkUpline(startId: string, parentOf: (id: string) => string | null | undefined): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([startId]);
  let cur = startId;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const parent = parentOf(cur);
    if (!parent || seen.has(parent)) break;
    chain.push(parent);
    seen.add(parent);
    cur = parent;
  }
  return chain;
}

/**
 * Is the rate table solvent?
 *
 * Exported so it can be asserted rather than assumed: if a future tune pushes the tree's total past the
 * platform's take, the program pays out more than it earns on every sale.
 */
export function ratesAreSolvent(): boolean {
  return TOTAL_RATE < PLATFORM_TAKE;
}

/** What a would-be affiliate is told, in plain terms. No earnings claims, no projections. */
export function programSummary(): string[] {
  return [
    `You earn on what the people you refer actually buy — subscriptions, Academy enrollments and coaching retainers — for as long as they keep paying.`,
    `${Math.round(LEVEL_RATES[0] * 100)}% on people you refer directly, ${Math.round(LEVEL_RATES[1] * 100)}% one level beyond that, ${Math.round(LEVEL_RATES[2] * 100)}% one level beyond that. It stops there.`,
    `Signing somebody up earns nothing on its own. There is no buy-in, and nothing to purchase to qualify.`,
  ];
}
