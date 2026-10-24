/**
 * lib/stripe/adult-gate.ts — LAUNCH-SALES (P0, 2026-10-20): the 18+ check every real-money checkout outside the coach
 * store and the book shop runs before it talks to Stripe.
 *
 * STORE-READY B10 left VIRTUAL_PURCHASES_ENABLED off until "each [product] needs an 18+ check and a refund path". The
 * coach store (lib/coach-store/checkout.ts) and the book shop (app/api/books/checkout) already answer 403 adults_only
 * through isVerifiedAdult. This is the same rule for FEL Pro, FEL Coach/Facility, Studio Creator, cosmetics, studio
 * credits, the season pass PRO lane, and coin and shard packs:
 *
 *   - the age is User.dobYear read from the DATABASE (never the session token, never the request body);
 *   - "verified 18+" is the strict rule in lib/age/ageRules.ts (a year gap of exactly 18 may still be 17: refused);
 *   - unknown age (no row, no year, a failed read) is NOT an adult.
 *
 * The answer is 403 `{ error: 'adults_only', reason, message }`. `error` matches the coach store's and the book
 * shop's answer, so one client check covers every store; `reason` says which of the two refusals it was.
 */
import { NextResponse } from 'next/server';
import { readDobYear, verifiedAdult, type GateDb } from '@/lib/privacy/scanSaveGate';

export type BuyerAgeRefusal = 'under_18' | 'age_unknown';

/** What the buyer is told. Plain product copy, not policy text. */
export const BUYER_AGE_MESSAGES: Record<BuyerAgeRefusal, string> = {
  under_18: 'Purchases are for verified adults (18+).',
  age_unknown: 'Confirm your birth year to buy. Purchases are for verified adults (18+).',
};

/** Why this account may not buy, or null when it is a verified adult. Never rejects: a failed read is age_unknown. */
export async function buyerAgeRefusal(db: GateDb, userId: string, now: Date = new Date()): Promise<BuyerAgeRefusal | null> {
  const dobYear = await readDobYear(db, userId, 'purchase_gate');
  if (dobYear === null) return 'age_unknown';
  return verifiedAdult(dobYear, now) ? null : 'under_18';
}

/** The 403 a refused buyer gets. Nothing was created at Stripe or in the database. */
export function refuseBuyer(reason: BuyerAgeRefusal): NextResponse {
  return NextResponse.json(
    { error: 'adults_only', reason, message: BUYER_AGE_MESSAGES[reason] },
    { status: 403 },
  );
}

/** null for a verified adult; otherwise the 403 to return. Call it last, right before the first Stripe call. */
export async function adultBuyerGate(db: GateDb, userId: string): Promise<NextResponse | null> {
  const reason = await buyerAgeRefusal(db, userId);
  return reason ? refuseBuyer(reason) : null;
}
