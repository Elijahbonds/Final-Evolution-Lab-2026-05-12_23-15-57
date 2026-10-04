/**
 * Coach-store money. FEL keeps 15% (lib/fees.ts). Stripe's card fee comes out of the coach's 85%.
 * The referral cut is a share of FEL's fee, tracked on CoachStoreReferral, never as a ledger posting
 * and never taken from the coach.
 */
import { PLATFORM_FEE_RATE } from '@/lib/fees';
import {
  CREDIT_CAP,
  MAX_REFERRAL_RENEWALS,
  PAYMENT_HOLD_DAYS,
  REFERRAL_MIN_WEEKLY_CENTS,
  REFERRAL_MONTH_CAP_CENTS,
  REFERRAL_SHARE_DEFAULT,
  REFERRAL_SHARE_MAX,
  SESSION_HOLD_DAYS,
} from './constants';

export interface CoachSplit {
  priceCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
  coachCents: number;
}

/** price − 15% − the actual Stripe fee. The fee is whatever the balance transaction reported. */
export function coachStoreSplit(priceCents: number, stripeFeeCents: number): CoachSplit {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error('price');
  if (!Number.isInteger(stripeFeeCents) || stripeFeeCents < 0) throw new Error('stripe fee');
  const platformFeeCents = Math.floor(priceCents * PLATFORM_FEE_RATE);
  const coachCents = priceCents - platformFeeCents - stripeFeeCents;
  return { priceCents, platformFeeCents, stripeFeeCents, coachCents };
}

export interface LedgerPosting {
  type: 'EXTERNAL' | 'PLATFORM_REVENUE' | 'CREATOR_ACCRUAL';
  amount: number;
  userId?: string;
}

/** Postings sum to 0. A zero Stripe fee is omitted (the ledger rejects a zero posting). Referral is not here. */
export function coachStorePostings(split: CoachSplit, coachUserId: string): LedgerPosting[] {
  const postings: LedgerPosting[] = [
    { type: 'EXTERNAL', amount: split.priceCents },
  ];
  if (split.stripeFeeCents > 0) postings.push({ type: 'EXTERNAL', amount: -split.stripeFeeCents });
  if (split.platformFeeCents !== 0) postings.push({ type: 'PLATFORM_REVENUE', amount: -split.platformFeeCents });
  if (split.coachCents !== 0) postings.push({ type: 'CREATOR_ACCRUAL', amount: -split.coachCents, userId: coachUserId });
  const sum = postings.reduce((n, p) => n + p.amount, 0);
  if (sum !== 0) throw new Error('coach-store postings do not balance');
  return postings;
}

/**
 * Share of FEL's fee paid to a referrer. Unset env → 0.20 (Elijah, flagged). Clamped to 0–0.5.
 */
export function referralShareOfFee(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.COACH_STORE_REFERRAL_SHARE_OF_FEE;
  if (raw === undefined || raw.trim() === '') return REFERRAL_SHARE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return REFERRAL_SHARE_DEFAULT;
  return Math.min(REFERRAL_SHARE_MAX, Math.max(0, n));
}

export type ReferralSource = 'live_1on1' | 'video_review' | 'program' | 'membership';

export interface ReferralInput {
  referrerUserId: string | null;
  buyerUserId: string;
  coachUserId: string;
  referrerIsAdult: boolean;
  buyerIsAdult: boolean;
  priceCents: number;
  platformFeeCents: number;
  /** 0 = first payment, 1..12 = renewals that still pay, above that pays nothing. */
  renewalIndex: number;
  source: ReferralSource;
  /**
   * Real billing interval of the plan. The $10/week referral floor applies only when this is `'week'`
   * (Elijah 11:53 PT Oct 4 2026). Monthly and one-time skip the floor.
   */
  billing: 'one_time' | 'week' | 'month';
  /**
   * Weekly price when billing is `'week'`, else null. Kept for callers; the floor no longer uses a
   * weekly-equivalent of a monthly amount.
   */
  weeklyCents: number | null;
  /** Cut already recorded for this referrer in the current month, in cents. */
  monthCutCents: number;
  share: number;
  paidAt: Date;
  sessionEndsAt: Date | null;
}

export interface ReferralDecision {
  cutCents: number;
  shareOfFee: number;
  holdUntil: Date;
  reason: string | null;
}

export function weeklyEquivalentCents(priceCents: number, billing: 'one_time' | 'week' | 'month'): number | null {
  if (billing === 'one_time') return null;
  if (billing === 'week') return priceCents;
  return Math.floor((priceCents * 7) / 30);
}

/** The referral guardrails. A refused referral is cut 0 with a reason. The coach's split is not an input that changes. */
export function decideReferral(input: ReferralInput): ReferralDecision {
  const share = Math.min(REFERRAL_SHARE_MAX, Math.max(0, input.share));
  const holdDays = input.source === 'live_1on1' || input.source === 'video_review' ? SESSION_HOLD_DAYS : PAYMENT_HOLD_DAYS;
  const anchor = input.source === 'live_1on1' || input.source === 'video_review'
    ? (input.sessionEndsAt ?? input.paidAt)
    : input.paidAt;
  const holdUntil = new Date(anchor.getTime() + holdDays * 24 * 60 * 60 * 1000);
  const none = (reason: string): ReferralDecision => ({ cutCents: 0, shareOfFee: share, holdUntil, reason });

  if (!input.referrerUserId) return none('no_referrer');
  if (input.referrerUserId === input.buyerUserId) return none('self_referral');
  if (input.referrerUserId === input.coachUserId) return none('referrer_is_coach');
  if (!input.referrerIsAdult) return none('referrer_not_adult');
  if (!input.buyerIsAdult) return none('buyer_not_adult');
  if (input.renewalIndex < 0 || input.renewalIndex > MAX_REFERRAL_RENEWALS) return none('renewal_cap');
  // Floor is weekly-billed only (Elijah 11:53 PT). Monthly pays normal referrer share; one-time unchanged.
  if (input.billing === 'week' && input.priceCents < REFERRAL_MIN_WEEKLY_CENTS) return none('under_ten_a_week');

  let cut = Math.floor(input.platformFeeCents * share);
  if (cut > input.platformFeeCents) cut = input.platformFeeCents;
  if (cut < 0) cut = 0;
  const room = REFERRAL_MONTH_CAP_CENTS - input.monthCutCents;
  if (room <= 0) return none('month_cap');
  if (cut > room) cut = room;
  if (cut === 0) return none('zero_cut');
  return { cutCents: cut, shareOfFee: share, holdUntil, reason: null };
}

/** Grant a review credit only when the invoice is new and the bank is under the cap. The invoice id is recorded either way so a retry does not double-grant. */
export function nextReviewCredits(current: number, lastInvoiceId: string | null, invoiceId: string, grant: boolean): { credits: number; lastInvoiceId: string } {
  if (!grant || lastInvoiceId === invoiceId) return { credits: current, lastInvoiceId: invoiceId };
  if (current >= CREDIT_CAP) return { credits: current, lastInvoiceId: invoiceId };
  return { credits: current + 1, lastInvoiceId: invoiceId };
}
