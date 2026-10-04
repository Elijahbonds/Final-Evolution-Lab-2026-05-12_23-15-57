import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLATFORM_FEE_RATE } from '@/lib/fees';
import { addressRejected } from './address';
import { coachStorePostings, coachStoreSplit, decideReferral, nextReviewCredits, referralShareOfFee, weeklyEquivalentCents } from './money';
import { decideCancel, decideJoin } from './policy';
import { clipRejected, originalsDue, reviewOpening } from './reviews';
import { openSlots } from './slots';
import { PAIN_LINE } from './constants';
import { invoiceChargeOrIntent, invoiceSubscriptionId, subscriptionPeriodEndUnix } from './stripeShapes';
import { stripeTestGate } from './stripeMode';
import { drillsForTeen, teenOfflineOpen } from './teen';
import { DUNK_WEEKS } from './dunkProgram';
import { coachingIcs } from './ics';
import { parseManifest, programComingSoon } from './manifest';
import { makingOfferCollision, signalRole, signalTooBig } from './call/limits';
import { iceServers } from './call/iceServers';
import { splitPayment } from '@/lib/store/split';
import { ptParts } from '@/lib/sessions/schedule';

describe('coach store money', () => {
  it('keeps 15 percent and takes the Stripe fee from the coach', () => {
    const split = coachStoreSplit(10000, 320);
    expect(PLATFORM_FEE_RATE).toBe(0.15);
    expect(split.platformFeeCents).toBe(1500);
    expect(split.coachCents).toBe(10000 - 1500 - 320);
    const postings = coachStorePostings(split, 'coach');
    expect(postings.reduce((n, p) => n + p.amount, 0)).toBe(0);
    const referral = decideReferral({
      referrerUserId: 'ref', buyerUserId: 'buy', coachUserId: 'coach',
      referrerIsAdult: true, buyerIsAdult: true, priceCents: 10000, platformFeeCents: 1500,
      renewalIndex: 0, source: 'program', weeklyCents: null, monthCutCents: 0, share: 0.2,
      paidAt: new Date('2026-06-01T00:00:00Z'), sessionEndsAt: null,
    });
    expect(referral.cutCents).toBe(300);
    expect(referral.cutCents).toBeLessThanOrEqual(split.platformFeeCents);
    expect(split.coachCents).toBe(8180);
  });

  it('refuses the referral guardrails', () => {
    const base = {
      referrerUserId: 'ref', buyerUserId: 'buy', coachUserId: 'coach',
      referrerIsAdult: true, buyerIsAdult: true, priceCents: 10000, platformFeeCents: 1500,
      renewalIndex: 0, source: 'program' as const, weeklyCents: null, monthCutCents: 0, share: 0.2,
      paidAt: new Date('2026-06-01T00:00:00Z'), sessionEndsAt: null,
    };
    expect(decideReferral({ ...base, referrerUserId: 'buy' }).reason).toBe('self_referral');
    expect(decideReferral({ ...base, referrerUserId: 'coach' }).reason).toBe('referrer_is_coach');
    expect(decideReferral({ ...base, referrerIsAdult: false }).reason).toBe('referrer_not_adult');
    expect(decideReferral({ ...base, buyerIsAdult: false }).reason).toBe('buyer_not_adult');
    expect(decideReferral({ ...base, renewalIndex: 13 }).reason).toBe('renewal_cap');
    expect(decideReferral({ ...base, source: 'membership', weeklyCents: weeklyEquivalentCents(2000, 'month') }).reason).toBe('under_ten_a_week');
    expect(decideReferral({ ...base, monthCutCents: 50000 }).reason).toBe('month_cap');
    expect(referralShareOfFee({} as NodeJS.ProcessEnv)).toBe(0.2);
    expect(referralShareOfFee({ COACH_STORE_REFERRAL_SHARE_OF_FEE: '0.9' } as NodeJS.ProcessEnv)).toBe(0.5);
  });

  it('does not grant a third review credit, and records the invoice either way', () => {
    expect(nextReviewCredits(2, null, 'in_1', true)).toEqual({ credits: 2, lastInvoiceId: 'in_1' });
    expect(nextReviewCredits(1, 'in_1', 'in_1', true).credits).toBe(1);
    expect(nextReviewCredits(1, 'in_1', 'in_2', true).credits).toBe(2);
  });

  it('a 15 percent split of the old tree pays no commission instead of throwing', () => {
    const s = splitPayment({ id: 'p', payerId: 'b', amountCents: 10000, kind: 'coaching_retainer', recurring: true }, ['a', 'b', 'c'], 0.15);
    expect(s.commissionCents).toBe(0);
    expect(s.coachCents + s.platformCents).toBe(10000);
  });
});

describe('slots, cancel, join, clips', () => {
  it('9:00 Pacific is 16:00Z in summer and 17:00Z in winter, with no spring gap and no fall duplicate', () => {
    const weekly = [{ dow: 0, startMin: 0, endMin: 24 * 60 }];
    const base = { weekly, blackouts: [], busy: [], bufferMinutes: 0, minNoticeHours: 0, maxDaysAhead: 2, durations: [30] as const };
    const summer = openSlots({ ...base, now: new Date('2026-07-12T00:00:00Z') }).find((s) => s.label.includes('9:00 AM'));
    const winter = openSlots({ ...base, now: new Date('2027-01-03T00:00:00Z') }).find((s) => s.label.includes('9:00 AM'));
    expect(summer && ptParts(summer.startsAt).hour).toBe(9);
    expect(summer?.startsAt.toISOString().slice(11, 16)).toBe('16:00');
    expect(winter?.startsAt.toISOString().slice(11, 16)).toBe('17:00');
    const spring = openSlots({ ...base, now: new Date('2027-03-14T00:00:00Z'), maxDaysAhead: 1 });
    expect(spring.some((s) => s.label.includes(' 2:30 AM'))).toBe(false);
    const fall = openSlots({ ...base, now: new Date('2026-11-01T00:00:00Z'), maxDaysAhead: 1 });
    const keys = fall.map((s) => s.startsAt.toISOString());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cancel is free outside the window and a connection failure does not spend the one reschedule', () => {
    const startsAt = new Date('2026-08-02T16:00:00Z');
    expect(decideCancel({ clientFullRefundHours: 24, reschedulesUsed: 0, startsAt, now: new Date('2026-08-01T00:00:00Z') }, 'cancel').ok).toBe(true);
    const late = decideCancel({ clientFullRefundHours: 24, reschedulesUsed: 0, startsAt, now: new Date('2026-08-02T10:00:00Z') }, 'reschedule');
    expect(late.ok && late.consumesReschedule).toBe(true);
    expect(decideCancel({ clientFullRefundHours: 24, reschedulesUsed: 1, startsAt, now: new Date('2026-08-02T10:00:00Z') }, 'reschedule').ok).toBe(false);
  });

  it('join window and clip limits', () => {
    const startsAt = new Date('2026-08-02T16:00:00Z');
    const endsAt = new Date('2026-08-02T16:30:00Z');
    expect(decideJoin({ isParty: true, isAdult: false, status: 'PAID', kind: 'live_1on1', startsAt, endsAt, now: startsAt }).error).toBe('not_adult');
    expect(decideJoin({ isParty: true, isAdult: true, status: 'PAID', kind: 'live_1on1', startsAt, endsAt, now: new Date(startsAt.getTime() - 11 * 60_000) }).error).toBe('not_open_yet');
    expect(decideJoin({ isParty: true, isAdult: true, status: 'PAID', kind: 'live_1on1', startsAt, endsAt, now: new Date(endsAt.getTime() + 16 * 60_000) }).status).toBe(410);
    expect(clipRejected({ seconds: 61, bytes: 1000, mime: 'video/mp4' }, 0)).toMatch(/60/);
    expect(clipRejected({ seconds: 10, bytes: 209715201, mime: 'video/mp4' }, 0)).toMatch(/60/);
    expect(clipRejected({ seconds: 10, bytes: 1000, mime: 'video/mp4' }, 3)).toMatch(/4th/);
    expect(reviewOpening(true, 'Bend the knee.')).toMatch(new RegExp(`^${PAIN_LINE}`));
  });

  it('sweep deletes originals and keeps the reply path out of the list', () => {
    const due = originalsDue([{
      id: 'b', originalClipDeleteAt: new Date('2026-01-01'), originalsDeletedAt: null,
      clipPaths: ['coach-reviews/originals/b/a.mp4'], replyClipPath: 'coach-reviews/replies/b/a.webm',
    }], new Date('2026-02-01'));
    expect(due).toEqual([{ id: 'b', paths: ['coach-reviews/originals/b/a.mp4'] }]);
  });
});

describe('adults, teens, stripe shapes, copy', () => {
  it('coming soon programs do not check out, and the pain line cannot be dropped', () => {
    const dunk = parseManifest(JSON.stringify({ kind: 'program', lane: 'dunking', billing: 'one_time' }));
    const corr = parseManifest(JSON.stringify({ kind: 'program', lane: 'correctives', billing: 'one_time' }));
    expect(dunk && programComingSoon(dunk)).toBe(false);
    expect(corr && programComingSoon(corr)).toBe(true);
    expect(addressRejected('123 Main Street')).toBe('street_address');
    expect(addressRejected('PO Box 1')).toBe(null);
  });

  it('reads both invoice shapes and fails closed without a test key', () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_1' } } })).toBe('sub_1');
    expect(invoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
    expect(subscriptionPeriodEndUnix({ items: { data: [{ current_period_end: 10 }] }, current_period_end: 9 })).toBe(10);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: '' } as NodeJS.ProcessEnv).ok).toBe(false);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'sk_live_x' } as NodeJS.ProcessEnv).ok).toBe(false);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'sk_test_x' } as NodeJS.ProcessEnv).ok).toBe(true);
  });

  it('hides adult-only drills from a teen and keeps the offline grace at 7 days', () => {
    expect(drillsForTeen(DUNK_WEEKS.flatMap((w) => w.days.flatMap((d) => d.drills))).some((d) => d.adultOnly)).toBe(false);
    const ok = new Date('2026-08-01T00:00:00Z');
    expect(teenOfflineOpen(ok, new Date('2026-08-07T00:00:00Z'))).toBe(true);
    expect(teenOfflineOpen(ok, new Date('2026-08-09T00:00:00Z'))).toBe(false);
  });

  it('reads a basil invoice payment and an older charge id', () => {
    expect(invoiceChargeOrIntent({
      payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_1' } }] },
    }).paymentIntentId).toBe('pi_1');
    expect(invoiceChargeOrIntent({ charge: 'ch_1' }).chargeId).toBe('ch_1');
  });

  it('the calendar file has no location, and the call role is assigned by the server', () => {
    const ics = coachingIcs({ bookingId: 'b', startsAt: new Date('2026-08-02T16:00:00Z'), endsAt: new Date('2026-08-02T16:30:00Z'), url: 'https://go.finalevolutiongroup.com/session/b' });
    expect(ics).not.toMatch(/^LOCATION:/m);
    expect(ics).toContain('SUMMARY:Coaching call with Elijah Bonds');
    expect(signalRole(true)).toBe('coach');
    expect(makingOfferCollision(true, true)).toBe('rollback');
    expect(signalTooBig('x'.repeat(17000))).toBe(true);
    expect(iceServers({} as NodeJS.ProcessEnv)).toHaveLength(1);
  });
});

describe('source guards', () => {
  it('the signer does not name the production bucket', () => {
    const src = readFileSync('lib/coach-store/storage.ts', 'utf8');
    expect(src).not.toContain('fel-coach-reviews');
    expect(src).toContain('COACH_REVIEWS_BUCKET');
    expect(src).toContain('coach-reviews/originals/');
    expect(src).toContain('coach-reviews/replies/');
    expect(src).toContain('deleteOriginalObject');
    const api = readFileSync('lib/coach-store/api.ts', 'utf8');
    expect(api).toContain('deleteOriginalObject');
  });

  it('the webhook answers 500 and the payout route writes nothing', () => {
    const hook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
    expect(hook).toContain('status: 500');
    expect(hook).toContain('payments not set up');
    expect(hook).not.toContain('Return 200 to prevent Stripe retries');
    const payout = readFileSync('app/api/stripe/payout/route.ts', 'utf8');
    expect(payout).toContain('payouts_not_available');
    expect(payout).not.toContain("status: 'COMPLETED'");
  });
});
