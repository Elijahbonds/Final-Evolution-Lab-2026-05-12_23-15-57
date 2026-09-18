// PAYOUT GATE — the checks that were missing on the way OUT (2026-09-13).
//
// Owner asked to extend the real-money surface. Auditing it first found the gap worth fixing before adding
// anything: `POST /api/wallet/withdraw` checked the feature flag and the amount bounds, and NOTHING ELSE.
// No identity verification, no self-exclusion check, no age check. Every one of those exists in
// `competition.ts` and is applied before a match is entered — none of them was applied before money left.
//
// That asymmetry is backwards. Entry risk is the platform's; PAYOUT is where the identity of the recipient
// actually matters, and it is the leg that carries the obligations. `checkCompetitionEligibility` also
// currently treats `kycStatus: 'NONE'` as a PASS, which is defensible for entering a $1 match and is not
// defensible for a withdrawal — so this file draws that line explicitly rather than reusing a gate built for
// the other direction.
//
// THE SHAPE: play is permitted with a light touch, cashing out is not. That is how the obligation actually
// falls, and it means an unverified player is never blocked from the product — only from taking money out
// until they have verified, which is the moment it is reasonable to ask.
//
// SELF-EXCLUSION IS HONOURED IN BOTH DIRECTIONS. Someone who has excluded themselves cannot enter, and this
// gate does not let them withdraw as a way of re-engaging with the money surface either — but it does not
// TRAP their balance: a self-excluded user gets a support path, not a refusal with no route out. A tool that
// keeps somebody's money hostage for using its own safety feature is worse than not having the feature.
//
// Pure: no Prisma, no Stripe. The route supplies the user row; this decides.

export type PayoutDenial =
  | 'feature-off'
  | 'kyc-required'
  | 'kyc-pending'
  | 'kyc-rejected'
  | 'self-excluded'
  | 'underage'
  | 'amount-out-of-bounds'
  | 'insufficient-balance';

export interface PayoutSubject {
  /** NONE | PENDING | VERIFIED | REJECTED. Undefined is treated as NONE. */
  kycStatus?: string | null;
  selfExcludedAt?: Date | null;
  /** Birth year. Undefined means unknown, which fails closed. */
  dobYear?: number | null;
  balanceCents: number;
}

export interface PayoutDecision {
  allowed: boolean;
  reason: PayoutDenial | null;
  /** What the player is told. Names the next step wherever one exists. */
  message: string;
  /** True when the answer is "do something and come back", rather than "no". */
  actionable: boolean;
}

export const MIN_AGE_YEARS = 18;

/**
 * Verification is required to WITHDRAW, at any amount.
 *
 * There is deliberately no "small withdrawals are fine" threshold. A limit like that is the first thing
 * anybody structuring around a control finds, and it makes the control decorative.
 */
export function requiresVerification(): boolean {
  return true;
}

export function canWithdraw(
  subject: PayoutSubject,
  amountCents: number,
  bounds: { min: number; max: number },
  now: Date = new Date(),
): PayoutDecision {
  const deny = (reason: PayoutDenial, message: string, actionable = false): PayoutDecision =>
    ({ allowed: false, reason, message, actionable });

  // self-exclusion first: it outranks everything, and the message must not read as a punishment
  if (subject.selfExcludedAt) {
    return deny(
      'self-excluded',
      'Your account is self-excluded. Contact support to arrange a withdrawal of your remaining balance.',
      true,
    );
  }

  // age, failing closed on unknown
  const year = subject.dobYear;
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return deny('underage', 'Add your date of birth to your profile before withdrawing.', true);
  }
  if (now.getUTCFullYear() - year < MIN_AGE_YEARS) {
    return deny('underage', `Withdrawals are available from age ${MIN_AGE_YEARS}.`);
  }

  // IDENTITY — the check the withdraw route never made
  const kyc = (subject.kycStatus ?? 'NONE').toUpperCase();
  if (kyc === 'REJECTED') {
    return deny('kyc-rejected', 'Identity verification was unsuccessful. Contact support.', true);
  }
  if (kyc === 'PENDING') {
    return deny('kyc-pending', 'Identity verification is still in progress. This usually takes a day.', false);
  }
  if (kyc !== 'VERIFIED') {
    return deny('kyc-required', 'Verify your identity to withdraw. It takes a few minutes and is only needed once.', true);
  }

  if (!Number.isInteger(amountCents) || amountCents < bounds.min || amountCents > bounds.max) {
    return deny('amount-out-of-bounds', `Withdrawals are between ${money(bounds.min)} and ${money(bounds.max)}.`);
  }
  if (amountCents > subject.balanceCents) {
    return deny('insufficient-balance', 'That is more than your balance.');
  }

  return { allowed: true, reason: null, message: 'Withdrawal requested.', actionable: false };
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── RESPONSIBLE PLAY ─────────────────────────────────────────────────────────────────────────────────────
//
// Not in the brief, and included anyway. A money surface without limits is one a player cannot bound even
// when they want to, and the controls below are cheap, standard, and far easier to build now than to
// retrofit once there is a balance history to reconcile against.

export interface PlayLimits {
  /** Player-set ceiling on deposits per rolling 24h, cents. Null means unset. */
  dailyDepositCents?: number | null;
  /** Player-set ceiling on total entry fees per rolling 24h, cents. */
  dailyStakeCents?: number | null;
  /** A cooling-off period the player asked for. */
  cooldownUntil?: Date | null;
}

export interface LimitCheck {
  allowed: boolean;
  reason: 'cooldown' | 'deposit-limit' | 'stake-limit' | null;
  message: string;
}

/**
 * Would this deposit or stake breach a limit the player set for themselves?
 *
 * A limit can be LOWERED immediately and only RAISED after a cooling-off period — that asymmetry is the
 * whole point of a self-set limit, and a system that lets somebody raise theirs mid-session has not given
 * them a limit at all. That rule lives with the setter, not here; this only enforces the current value.
 */
export function withinLimits(
  limits: PlayLimits,
  spentTodayCents: number,
  requestCents: number,
  kind: 'deposit' | 'stake',
  now: Date = new Date(),
): LimitCheck {
  if (limits.cooldownUntil && limits.cooldownUntil > now) {
    return { allowed: false, reason: 'cooldown', message: 'You set a break. It ends ' + limits.cooldownUntil.toISOString().slice(0, 10) + '.' };
  }
  const cap = kind === 'deposit' ? limits.dailyDepositCents : limits.dailyStakeCents;
  if (typeof cap === 'number' && cap >= 0 && spentTodayCents + requestCents > cap) {
    return {
      allowed: false,
      reason: kind === 'deposit' ? 'deposit-limit' : 'stake-limit',
      message: `That would pass the daily limit you set (${money(cap)}).`,
    };
  }
  return { allowed: true, reason: null, message: '' };
}

/** Lowering a limit takes effect now; raising it waits. The asymmetry IS the feature. */
export const LIMIT_RAISE_DELAY_HOURS = 24;

export function limitChangeEffectiveAt(current: number | null | undefined, next: number, now: Date = new Date()): Date {
  const raising = typeof current === 'number' && next > current;
  return raising ? new Date(now.getTime() + LIMIT_RAISE_DELAY_HOURS * 3600_000) : now;
}
