// lib/seller/takedown.ts — SELLER-18-1 (S-2): a seller later found to be under 18.
//
// What happens, with no schema change:
//   1. the coach page comes down: Instructor.published = false (the public coach page, the coach directory, and both
//      checkouts all require a published Instructor, so every package and store listing of theirs stops selling);
//   2. every active MarketplaceListing they created (coach-store items and Studio cartridges) is set inactive;
//   3. payouts freeze: their Stripe Express account's payout schedule is set to manual, with a metadata note, so money
//      already there stays at Stripe until a person reviews it;
//   4. the review opens. v2 (Cyber F6): a durable review record (lib/seller/server.ts: an AnalyticsEvent row named
//      SELLER_REVIEW_EVENT, an existing table, so no schema change) instead of a log line; the log line, with a short
//      one-way reference (never the id, the email or the birth year), is only the fallback when the record can't be stored.
// v2 (Cyber F1): it runs once. An account whose last review record shows payouts already held (frozen, or no Stripe
// account) and that has nothing live left (no published coach page, no active listing) is skipped: no write, no Stripe
// call. Something live again (re-published) comes down again, without a second Stripe call.
// Each step runs on its own and never throws: one failure does not stop the others, and the gate still refuses.
import { createHash } from 'node:crypto';

export type PayoutFreeze = 'frozen' | 'no_account' | 'failed';

/** What the last review record says about this account. */
export interface PriorHold { payouts: PayoutFreeze }

export interface TakedownDeps {
  unpublishCoachPage(userId: string): Promise<number>;
  deactivateListings(userId: string): Promise<number>;
  freezePayouts(userId: string): Promise<PayoutFreeze>;
  log(line: string): void;
  /** v2 (F1): the last review record for this account, or null. A failed read is null, so the takedown runs. */
  priorHold?(userId: string): Promise<PriorHold | null>;
  /** v2 (F1): published coach pages plus active listings still up. A failed read counts as live. */
  liveCount?(userId: string): Promise<number>;
  /** v2 (F6): store the durable review record; true when stored. Not stored (or absent) → the log line instead. */
  recordReview?(userId: string, result: TakedownResult): Promise<boolean>;
}

export interface TakedownResult { coachPages: number; listings: number; payouts: PayoutFreeze; skipped?: 'already_held' }

/** The Stripe metadata key and value a frozen account carries. */
export const PAYOUT_HOLD_META = { fel_payout_hold: 'seller_age_review' } as const;

/** A short one-way reference for the review queue. Not reversible to the id. */
export function reviewRef(userId: string): string {
  return createHash('sha256').update(`seller-age:${userId}`).digest('hex').slice(0, 12);
}

export async function takeDownMinorSeller(userId: string, deps: TakedownDeps): Promise<TakedownResult> {
  const prior = deps.priorHold ? await deps.priorHold(userId).catch(() => null) : null;
  const held = prior !== null && prior.payouts !== 'failed';
  if (held) {
    const live = deps.liveCount ? await deps.liveCount(userId).catch(() => 1) : 1;
    if (live === 0) return { coachPages: 0, listings: 0, payouts: prior.payouts, skipped: 'already_held' };
  }
  const coachPages = await deps.unpublishCoachPage(userId).catch(() => -1);
  const listings = await deps.deactivateListings(userId).catch(() => -1);
  const payouts = held ? prior.payouts : await deps.freezePayouts(userId).catch((): PayoutFreeze => 'failed');
  const result: TakedownResult = { coachPages, listings, payouts };
  const stored = deps.recordReview ? await deps.recordReview(userId, result).catch(() => false) : false;
  if (!stored) deps.log(`[seller-gate] under-18 seller taken down, review needed ref=${reviewRef(userId)} coachPages=${coachPages} listings=${listings} payouts=${payouts}`);
  return result;
}
