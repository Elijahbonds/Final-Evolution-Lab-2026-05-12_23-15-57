/**
 * lib/age/arenaAgeBand.ts — ARENA-AGE-1 (Cyber F1 fix 1, T5): which Arena an account gets, decided on the SERVER only.
 *
 * The age is User.dobYear read from the DATABASE through the same rule every checkout uses (lib/stripe/adult-gate.ts
 * buyerAgeRefusal: verified 18+, unknown age is NOT an adult, a failed read is unknown). The client never picks the
 * mode: a teen or unknown-age account gets the no-entry practice Arena, and the adult entry routes (create, join,
 * quick-match) answer 403 with a plain reason. Cancel, reclaim, list and submit-score stay open so any entry already
 * locked can still be refunded or settled (PM decision 3, 2026-11-04).
 */
import { NextResponse } from 'next/server';
import { buyerAgeRefusal, type BuyerAgeRefusal } from '@/lib/stripe/adult-gate';
import type { GateDb } from '@/lib/privacy/scanSaveGate';

export type ArenaBand = 'adult' | 'teen';

/** Where an account without a saved birth year adds one, then comes back to the Arena. */
export const ARENA_BIRTH_YEAR_HREF = `/age?next=${encodeURIComponent('/arena')}`;

/**
 * A refusal always says why (PM decision 4: no silent hard-block); an unknown age is told how to fix it.
 */
export const ARENA_AGE_MESSAGES: Record<BuyerAgeRefusal, string> = {
  under_18: 'Entry duels are for players 18 and over. Practice duels are free to play.',
  age_unknown: 'Add your birth year to play entry duels. Until then you can play free practice duels.',
};

/** 'adult' for a verified adult; everyone else (teen, unknown age, failed read) is 'teen'. Never rejects. */
export async function arenaBand(db: GateDb, userId: string): Promise<{ band: ArenaBand; reason: BuyerAgeRefusal | null }> {
  const reason = await buyerAgeRefusal(db, userId);
  return { band: reason === null ? 'adult' : 'teen', reason };
}

/** The 403 an adult-only Arena entry route returns. Nothing was written. */
export function refuseArenaEntry(reason: BuyerAgeRefusal): NextResponse {
  return NextResponse.json(
    {
      error: 'adults_only',
      reason,
      message: ARENA_AGE_MESSAGES[reason],
      detail: ARENA_AGE_MESSAGES[reason],
      ...(reason === 'age_unknown' ? { addBirthYear: ARENA_BIRTH_YEAR_HREF } : {}),
    },
    { status: 403 },
  );
}

/** Thrown inside an entry route's transaction, before any Lab Credits move; the route turns it into refuseArenaEntry. */
export class ArenaAgeRefusal extends Error {
  constructor(public reason: BuyerAgeRefusal) {
    super(`arena entry refused: ${reason}`);
    this.name = 'ArenaAgeRefusal';
  }
}

/** null for a verified adult; otherwise the 403. Call it before the first Lab Credits write. */
export async function arenaEntryGate(db: GateDb, userId: string): Promise<NextResponse | null> {
  const reason = await buyerAgeRefusal(db, userId);
  return reason ? refuseArenaEntry(reason) : null;
}
