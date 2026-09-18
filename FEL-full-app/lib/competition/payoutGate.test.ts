// MONEY DOES NOT LEAVE TO AN UNVERIFIED IDENTITY (2026-09-13).
//
// The withdraw route checked the feature flag and the amount bounds and nothing else — no KYC, no
// self-exclusion, no age. These tests exist so that cannot come back, and they are written as "what must
// never be allowed" rather than "what should work", because the failure here is a fail-OPEN.

import { describe, it, expect } from 'vitest';
import {
  canWithdraw, withinLimits, limitChangeEffectiveAt, requiresVerification,
  MIN_AGE_YEARS, LIMIT_RAISE_DELAY_HOURS, type PayoutSubject,
} from './payoutGate';

const NOW = new Date('2026-09-13T12:00:00.000Z');
const BOUNDS = { min: 1000, max: 100_000 };

const ok = (over: Partial<PayoutSubject> = {}): PayoutSubject => ({
  kycStatus: 'VERIFIED', selfExcludedAt: null, dobYear: 1995, balanceCents: 50_000, ...over,
});

describe('IDENTITY IS REQUIRED TO WITHDRAW', () => {
  it('an unverified account cannot withdraw, and is told the next step', () => {
    const d = canWithdraw(ok({ kycStatus: 'NONE' }), 5000, BOUNDS, NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('kyc-required');
    expect(d.actionable).toBe(true);
    expect(d.message).toMatch(/verify your identity/i);
  });

  it('a MISSING kyc status is treated as unverified, not as a pass', () => {
    for (const kycStatus of [undefined, null, '', 'unknown', 'none']) {
      expect(canWithdraw(ok({ kycStatus }), 5000, BOUNDS, NOW).allowed, String(kycStatus)).toBe(false);
    }
  });

  it('pending and rejected each say which they are', () => {
    expect(canWithdraw(ok({ kycStatus: 'PENDING' }), 5000, BOUNDS, NOW).reason).toBe('kyc-pending');
    expect(canWithdraw(ok({ kycStatus: 'REJECTED' }), 5000, BOUNDS, NOW).reason).toBe('kyc-rejected');
  });

  it('THERE IS NO SMALL-WITHDRAWAL EXEMPTION', () => {
    // a threshold below which verification is skipped is the first thing anybody structuring around a
    // control finds, and it makes the control decorative
    expect(requiresVerification()).toBe(true);
    for (const amount of [BOUNDS.min, 1001, 2500, BOUNDS.max]) {
      expect(canWithdraw(ok({ kycStatus: 'NONE' }), amount, BOUNDS, NOW).allowed, String(amount)).toBe(false);
    }
  });

  it('a verified adult with a balance can withdraw', () => {
    const d = canWithdraw(ok(), 5000, BOUNDS, NOW);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBeNull();
  });
});

describe('SELF-EXCLUSION OUTRANKS EVERYTHING — but never traps the balance', () => {
  it('a self-excluded account cannot withdraw through the normal path', () => {
    const d = canWithdraw(ok({ selfExcludedAt: new Date('2026-01-01') }), 5000, BOUNDS, NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('self-excluded');
  });

  it('and it outranks a perfectly verified account', () => {
    const d = canWithdraw(ok({ kycStatus: 'VERIFIED', selfExcludedAt: new Date('2026-01-01') }), 5000, BOUNDS, NOW);
    expect(d.reason).toBe('self-excluded');
  });

  it('THE MESSAGE OFFERS A ROUTE OUT, because holding someone’s money for using a safety feature is worse than not having it', () => {
    const d = canWithdraw(ok({ selfExcludedAt: new Date('2026-01-01') }), 5000, BOUNDS, NOW);
    expect(d.actionable).toBe(true);
    expect(d.message).toMatch(/contact support/i);
    expect(d.message).not.toMatch(/denied|refused|forbidden/i);
  });
});

describe('age fails closed', () => {
  it('an unknown date of birth blocks, and asks for it', () => {
    for (const dobYear of [undefined, null, Number.NaN]) {
      const d = canWithdraw(ok({ dobYear: dobYear as number }), 5000, BOUNDS, NOW);
      expect(d.allowed, String(dobYear)).toBe(false);
      expect(d.reason).toBe('underage');
    }
  });

  it('under 18 blocks', () => {
    expect(canWithdraw(ok({ dobYear: NOW.getUTCFullYear() - 17 }), 5000, BOUNDS, NOW).allowed).toBe(false);
    expect(canWithdraw(ok({ dobYear: NOW.getUTCFullYear() - MIN_AGE_YEARS }), 5000, BOUNDS, NOW).allowed).toBe(true);
  });
});

describe('amount and balance', () => {
  it('rejects outside the bounds and above the balance', () => {
    expect(canWithdraw(ok(), 999, BOUNDS, NOW).reason).toBe('amount-out-of-bounds');
    expect(canWithdraw(ok(), 100_001, BOUNDS, NOW).reason).toBe('amount-out-of-bounds');
    expect(canWithdraw(ok(), 1234.5, BOUNDS, NOW).reason).toBe('amount-out-of-bounds');
    expect(canWithdraw(ok({ balanceCents: 2000 }), 5000, BOUNDS, NOW).reason).toBe('insufficient-balance');
  });

  it('IDENTITY IS CHECKED BEFORE THE AMOUNT', () => {
    // so an unverified user is never told "that amount is fine" on the way to being refused anyway
    const d = canWithdraw(ok({ kycStatus: 'NONE' }), 999_999, BOUNDS, NOW);
    expect(d.reason).toBe('kyc-required');
  });
});

describe('self-set limits', () => {
  it('a cooling-off period blocks, and says when it ends', () => {
    const c = withinLimits({ cooldownUntil: new Date('2026-10-01') }, 0, 1000, 'deposit', NOW);
    expect(c.allowed).toBe(false);
    expect(c.reason).toBe('cooldown');
    expect(c.message).toContain('2026-10-01');
  });

  it('an expired cooling-off does not block', () => {
    expect(withinLimits({ cooldownUntil: new Date('2026-01-01') }, 0, 1000, 'deposit', NOW).allowed).toBe(true);
  });

  it('a daily limit blocks the request that would pass it, not the one that reaches it', () => {
    const limits = { dailyDepositCents: 10_000 };
    expect(withinLimits(limits, 9000, 1000, 'deposit', NOW).allowed).toBe(true);
    expect(withinLimits(limits, 9000, 1001, 'deposit', NOW).allowed).toBe(false);
  });

  it('deposit and stake limits are separate', () => {
    const limits = { dailyDepositCents: 10_000, dailyStakeCents: 2000 };
    expect(withinLimits(limits, 0, 5000, 'deposit', NOW).allowed).toBe(true);
    expect(withinLimits(limits, 0, 5000, 'stake', NOW).allowed).toBe(false);
  });

  it('a limit of zero means zero, not unset', () => {
    expect(withinLimits({ dailyDepositCents: 0 }, 0, 1, 'deposit', NOW).allowed).toBe(false);
  });

  it('unset limits allow anything', () => {
    expect(withinLimits({}, 999_999, 999_999, 'deposit', NOW).allowed).toBe(true);
  });

  it('LOWERING A LIMIT IS IMMEDIATE, RAISING IT WAITS — the asymmetry is the whole feature', () => {
    // a system that lets somebody raise their limit mid-session has not given them a limit
    expect(limitChangeEffectiveAt(10_000, 5000, NOW).getTime()).toBe(NOW.getTime());
    const raised = limitChangeEffectiveAt(5000, 10_000, NOW);
    expect(raised.getTime()).toBe(NOW.getTime() + LIMIT_RAISE_DELAY_HOURS * 3600_000);
    expect(LIMIT_RAISE_DELAY_HOURS).toBeGreaterThanOrEqual(24);
  });

  it('setting a limit for the first time is immediate', () => {
    expect(limitChangeEffectiveAt(null, 5000, NOW).getTime()).toBe(NOW.getTime());
    expect(limitChangeEffectiveAt(undefined, 5000, NOW).getTime()).toBe(NOW.getTime());
  });
});
