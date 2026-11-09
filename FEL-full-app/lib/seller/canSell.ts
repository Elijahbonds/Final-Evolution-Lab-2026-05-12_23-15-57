// lib/seller/canSell.ts — SELLER-18-1 (Cyber BOOK-SIGNOFF S-2, 2026-11-04): the one seller gate.
//
// canSell = the seller's role AND a verified adult, by User.dobYear read from the DATABASE (never the session, never a
// request body, never Stripe's identity check). Unknown age (no row, no year, a failed read) is refused. A Camp
// certification or an owner-granted teacher row is a ROLE only: it never lets anyone sell without the adult check.
//
// The age rule is not new: it is the strict one every buyer gate already uses (lib/coach-store/adult.ts →
// lib/privacy/healthWriteGate.ts → lib/age/ageRules.ts; a year gap of exactly 18 may still be 17, so it is refused).
//
// v2 (PM 2026-11-09; Cyber review F1): behind SELLER_ADULT_GATE_ENABLED (lib/flags.ts, default OFF). Off: the role only,
// as today — no birth-year read and no takedown. On: the role AND the adult check; a KNOWN under-18 year starts the
// takedown only when the account really holds seller rows on this surface (holdsSellerRows), so a teen who merely opens a
// seller page is refused and nothing of theirs is touched.
//
// Pure: every read comes in as a dependency, so the tests drive the real order of checks. The live wiring is
// lib/seller/server.ts.
import { readDobYear, type GateDb } from '@/lib/privacy/scanSaveGate';

/** Which kind of selling is being asked about. The role check differs; the age check never does. */
export type SellerRole = 'coach_store' | 'coach_business' | 'studio' | 'group_booking';

/** Why this account may not sell. `not_a_seller` keeps each surface's own answer (most are a 404). */
export type SellerRefusal = 'not_a_seller' | 'under_18' | 'age_unknown';

/** What a refused seller is told. Plain product copy. */
export const SELLER_AGE_MESSAGES: Record<Exclude<SellerRefusal, 'not_a_seller'>, string> = {
  under_18: 'Selling on FEL is for adults (18+).',
  age_unknown: 'Add your birth year in your account to sell on FEL. Selling is for adults (18+).',
};

export interface SellerGateDeps {
  db: GateDb;
  /** Does this account hold the selling role for this surface? A failed read is "no". */
  hasRole(userId: string): Promise<boolean>;
  /** The verified-adult check (lib/coach-store/adult.ts isVerifiedAdult). */
  isAdult(db: GateDb, userId: string): Promise<boolean>;
  /** Called when a seller with the role and seller rows is found to be under 18: take listings down, freeze payouts. */
  onMinorSeller?(userId: string): Promise<unknown>;
  /**
   * v2: SELLER_ADULT_GATE_ENABLED. `false` = the role only (no birth-year read, no takedown). Absent = on (the rule
   * itself; the live wiring always passes the setting).
   */
  gateOn?: boolean;
  /**
   * v2 (Cyber F1): does this account really sell on this surface (a Connect account, market profile or package; an
   * active cartridge; ...)? Only then may a minor be taken down. A failed read is "no". Absent = yes.
   */
  holdsSellerRows?(userId: string): Promise<boolean>;
}

/**
 * null when this account may sell; otherwise why not. Never rejects. In order: a user id → the role → (setting off:
 * pass) → verified 18+. Only a KNOWN under-18 year with the role AND seller rows starts the takedown; an unknown year is
 * refused but nothing is taken down. The refusal itself never depends on seller rows.
 */
export async function sellerRefusal(userId: string | null | undefined, deps: SellerGateDeps): Promise<SellerRefusal | null> {
  if (typeof userId !== 'string' || !userId) return 'not_a_seller';
  const role = await deps.hasRole(userId).catch(() => false);
  if (!role) return 'not_a_seller';
  if (deps.gateOn === false) return null;
  const adult = await deps.isAdult(deps.db, userId).catch(() => false);
  if (adult) return null;
  const dobYear = await readDobYear(deps.db, userId, 'seller_gate');
  if (dobYear === null) return 'age_unknown';
  if (deps.onMinorSeller) {
    const sells = deps.holdsSellerRows ? await deps.holdsSellerRows(userId).catch(() => false) : true;
    if (sells) await deps.onMinorSeller(userId).catch(() => undefined);
  }
  return 'under_18';
}
