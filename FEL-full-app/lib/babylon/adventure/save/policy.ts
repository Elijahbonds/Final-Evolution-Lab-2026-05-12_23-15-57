/**
 * Where an Adventure save may live (ADVENTURE PLAN, "Data and saves", 2026-10-06).
 *
 * THE TEEN RULE, as the Creator's (lib/creator/look/slots.ts TEEN_DEVICE_LOOK_EVERYWHERE, lib/creator/lookPrivacy.ts):
 * anyone who is not a VERIFIED adult (under 18, or an unknown age) keeps the save on the device only. Nothing of it is
 * uploaded. The verified-adult test is the strict one (lib/age/ageRules.ts isVerifiedAdultStrict), the same rule the
 * closet route answers `lookLocal` with.
 *
 * THE SERVER SAVE IS NOT BUILT YET. It is Phase B's, behind an additive table the owner applies
 * (ADVENTURE-PLAN.md, the pending SQL). Until then `ADVENTURE_SERVER_SAVE_ENABLED` is false and nobody's save leaves
 * the device; the policy already says what an adult's would do so Phase B only flips the flag and adds the route.
 *
 * Pure.
 */
import { isVerifiedAdultStrict } from '@/lib/age/ageRules';

/** Phase B flips this when the `AdventureSave` table and its route exist (owner's step). */
export const ADVENTURE_SERVER_SAVE_ENABLED = false;

export type SavePolicyReason = 'adult' | 'teen-or-unknown' | 'guest' | 'server-not-enabled';

export interface SavePolicy {
  /** The device copy is always kept. */
  device: true;
  /** May this save be sent to the server? */
  server: boolean;
  reason: SavePolicyReason;
}

/**
 * The policy for a player. `verifiedAdult` is true only when the account's age is verified 18+; null or undefined (not
 * known) is treated as not an adult.
 */
export function adventureSavePolicy(o: { signedIn: boolean; verifiedAdult?: boolean | null }): SavePolicy {
  if (!o.signedIn) return { device: true, server: false, reason: 'guest' };
  if (o.verifiedAdult !== true) return { device: true, server: false, reason: 'teen-or-unknown' };
  if (!ADVENTURE_SERVER_SAVE_ENABLED) return { device: true, server: false, reason: 'server-not-enabled' };
  return { device: true, server: true, reason: 'adult' };
}

/** From the closet answer (GET /api/v1/closet): `lookLocal: false` is a verified adult; anything else is not known. */
export function verifiedAdultFromCloset(closet: unknown): boolean | null {
  if (!closet || typeof closet !== 'object') return null;
  const v = (closet as { lookLocal?: unknown }).lookLocal;
  return v === false ? true : v === true ? false : null;
}

/** From a birth year (the strict rule). */
export function verifiedAdultFromDob(dobYear: number | null | undefined, now: Date): boolean {
  return isVerifiedAdultStrict(dobYear, now);
}
