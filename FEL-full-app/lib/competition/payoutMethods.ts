// PAYOUT DESTINATIONS — where the money actually goes (2026-09-13).
//
// Owner: "make sure we verify identity payouts or add paypal or zelle payout or their bank." Identity
// verification landed in payoutGate.ts; this is the other half — the destination.
//
// WHAT IS HONESTLY AUTOMATABLE, stated up front because one of the three is not:
//
//   BANK (ACH)  — real. Stripe Connect payouts to a bank account; already the implied path (PayoutRequest
//                 carries `stripeTransferId`). Needs routing + account number and a Connect account.
//   PAYPAL      — real. PayPal's Payouts API sends to an email address or a payer ID.
//   ZELLE       — NOT automatable here, and this file does not pretend. Zelle is a bank-to-bank consumer
//                 network; there is no general platform disbursement API the way there is for PayPal. It is
//                 modelled as a MANUAL destination: the request is captured and queued for an operator to
//                 send from a business banking portal. That is a real way to pay somebody and a bad thing to
//                 describe as an integration, so `automated: false` and the UI is expected to say "usually
//                 within two business days" rather than implying an instant transfer.
//
// THE PROPERTY THAT MATTERS MOST, and it is not the plumbing: a payout destination has to belong to the
// SAME person the KYC check verified. Verifying an identity and then wiring the money to an arbitrary
// third-party account verifies nothing — it is the single most common way a verified-identity control gets
// walked around. `destinationMatchesIdentity` is the check, and it is required by `validateDestination`.
//
// NOTHING HERE TOUCHES A PROVIDER. Pure validation and policy; the Stripe/PayPal calls live in the route.
// No account number, routing number or PayPal address is ever logged by this module.

export type PayoutMethod = 'bank' | 'paypal' | 'zelle';

export interface MethodInfo {
  method: PayoutMethod;
  label: string;
  /** False means a human sends it. See the header — Zelle is the honest case. */
  automated: boolean;
  /** What the player is told about timing. Never "instant" for something queued to an operator. */
  timing: string;
  /** Provider fee borne by the recipient, cents. Zero where the platform absorbs it. */
  feeCents: number;
}

export const METHODS: Readonly<Record<PayoutMethod, MethodInfo>> = {
  bank: {
    method: 'bank', label: 'Bank account (ACH)', automated: true,
    timing: 'Usually 2–3 business days.', feeCents: 0,
  },
  paypal: {
    method: 'paypal', label: 'PayPal', automated: true,
    timing: 'Usually within a few minutes.', feeCents: 0,
  },
  zelle: {
    method: 'zelle', label: 'Zelle', automated: false,
    timing: 'Sent by hand — usually within two business days.', feeCents: 0,
  },
};

export function methodsAvailable(): MethodInfo[] {
  return Object.values(METHODS);
}

// ── destinations ─────────────────────────────────────────────────────────────────────────────────────────

export interface BankDestination {
  method: 'bank';
  /** Name on the account, as the bank holds it. */
  accountName: string;
  /** 9 digits, US ABA. */
  routingNumber: string;
  /** 4–17 digits. */
  accountNumber: string;
}

export interface PaypalDestination {
  method: 'paypal';
  accountName: string;
  email: string;
}

export interface ZelleDestination {
  method: 'zelle';
  accountName: string;
  /** Zelle addresses are an email OR a US mobile number. */
  handle: string;
}

export type PayoutDestination = BankDestination | PaypalDestination | ZelleDestination;

export interface VerifiedIdentity {
  /** The legal name the KYC provider verified. */
  legalName: string;
  kycStatus: string;
}

export interface DestinationCheck {
  valid: boolean;
  reason:
    | 'not-verified' | 'name-mismatch' | 'bad-routing' | 'bad-account'
    | 'bad-email' | 'bad-handle' | 'missing-name' | null;
  message: string;
}

const ok = (): DestinationCheck => ({ valid: true, reason: null, message: '' });
const bad = (reason: NonNullable<DestinationCheck['reason']>, message: string): DestinationCheck =>
  ({ valid: false, reason, message });

/**
 * Does this destination belong to the person we verified?
 *
 * Compared on a NORMALISED name rather than exactly: casing, punctuation, accents and middle names differ
 * between a KYC record and a bank record for the same human, and refusing "JOHN A O'NEILL" against "John
 * O'Neill" is a false decline that sends a real person to support. What it will not accept is a different
 * surname, which is the case that matters.
 */
export function destinationMatchesIdentity(destName: string, identity: VerifiedIdentity): boolean {
  const a = nameKey(destName);
  const b = nameKey(identity.legalName);
  if (!a || !b) return false;
  return a.given === b.given && surnamesMatch(a.surname, b.surname);
}

interface NameKey { given: string; surname: string }

/**
 * A name reduced to a given name and a SURNAME BLOCK — everything after the first word, concatenated.
 *
 * Joining the tail is what makes the awkward real cases line up. "O'Neill" arrives from one system as
 * `oneill` and from another as `o neill`; splitting on whitespace makes those two different surnames. This
 * was a MEASURED false decline rather than a hypothetical — the first version of this matcher refused
 * "john oneill" against a verified "John O'Neill", which is a real person being sent to support.
 *
 * Punctuation is DELETED rather than replaced with a space, for the same reason.
 */
function nameKey(name: string): NameKey | null {
  const words = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;              // a single word is not a full legal name
  return { given: words[0], surname: words.slice(1).join('') };
}

/**
 * Surnames match exactly, or within a couple of characters at the end.
 *
 * The tolerance covers a folded middle initial ("aoneill") or a particle that lost its space ("o neill").
 * It is deliberately BOUNDED — the shorter key must be at least four characters and the gap at most two —
 * so "son" can never match "johnson", which is the false ACCEPT an unbounded suffix rule would open.
 */
function surnamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4 || long.length - short.length > 2) return false;
  return long.endsWith(short);
}

/**
 * Is this destination usable?
 *
 * Identity is checked FIRST and hardest. Format checks only matter once we know the money is going to the
 * right person.
 */
export function validateDestination(dest: PayoutDestination, identity: VerifiedIdentity): DestinationCheck {
  if ((identity.kycStatus ?? '').toUpperCase() !== 'VERIFIED') {
    return bad('not-verified', 'Verify your identity before adding a payout destination.');
  }
  if (!dest.accountName || !dest.accountName.trim()) {
    return bad('missing-name', 'Enter the name on the account.');
  }
  if (!destinationMatchesIdentity(dest.accountName, identity)) {
    return bad('name-mismatch', 'The name on this destination has to match your verified name.');
  }

  switch (dest.method) {
    case 'bank':
      if (!/^\d{9}$/.test(dest.routingNumber) || !isAbaValid(dest.routingNumber)) {
        return bad('bad-routing', 'That routing number is not valid.');
      }
      if (!/^\d{4,17}$/.test(dest.accountNumber)) {
        return bad('bad-account', 'That account number is not valid.');
      }
      return ok();
    case 'paypal':
      return isEmail(dest.email) ? ok() : bad('bad-email', 'Enter the email on your PayPal account.');
    case 'zelle':
      return isEmail(dest.handle) || isUsMobile(dest.handle)
        ? ok()
        : bad('bad-handle', 'Enter the email or US mobile number registered with Zelle.');
  }
}

/**
 * ABA checksum.
 *
 * Catches a transposed digit, which is the overwhelmingly common way a routing number is wrong — and a wrong
 * routing number does not bounce cleanly, it sends somebody's money to a different bank.
 */
export function isAbaValid(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0 && sum > 0;
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function isUsMobile(v: string): boolean {
  const digits = v.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/** Last four only — never the whole number, in a UI or a log. */
export function maskDestination(dest: PayoutDestination): string {
  switch (dest.method) {
    case 'bank': return `Bank ••••${dest.accountNumber.slice(-4)}`;
    case 'paypal': return `PayPal ${maskEmail(dest.email)}`;
    case 'zelle': return `Zelle ${isEmail(dest.handle) ? maskEmail(dest.handle) : `••••${dest.handle.replace(/\D/g, '').slice(-4)}`}`;
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}•••@${domain ?? ''}`;
}

/** Does this one need an operator? Drives the queue and the timing copy. */
export function needsManualSend(method: PayoutMethod): boolean {
  return !METHODS[method].automated;
}
