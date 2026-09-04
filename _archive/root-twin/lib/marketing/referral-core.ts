/**
 * lib/marketing/referral-core.ts — PURE referral-code helpers.
 *
 * No DB / network / server-only imports, so both the server module
 * (lib/marketing/referral.ts) and the unit tests import the SAME logic
 * (single source of truth — never fork a core).
 */

// Unambiguous alphabet (no 0/O/1/I) for share codes that read cleanly aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a random share code of the given length. */
export function generateReferralCode(len = 7, rnd: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return out;
}

/** Is a string a well-formed referral code? */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z2-9]{5,12}$/.test(code);
}
