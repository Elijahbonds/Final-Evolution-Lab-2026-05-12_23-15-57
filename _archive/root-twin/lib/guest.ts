/**
 * lib/guest.ts
 * ============
 * M13 Step 1 — guest-mode helpers (Blueprint 2.1 "60 seconds to a dunk").
 *
 * A server-issued anonymous session lets the landing page reach a judged dunk
 * with ZERO auth. Guests carry a rotating opaque token in an httpOnly cookie
 * and NO PII (M13 FIREWALL). On signup the guest's taste-run state migrates
 * into the new account.
 */

export const GUEST_COOKIE = 'fel_guest';
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
