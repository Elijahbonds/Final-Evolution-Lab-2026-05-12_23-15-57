/**
 * lib/guest.ts
 * ============
 * M13 Step 1 — guest-mode helpers (Blueprint 2.1 "60 seconds to a dunk").
 *
 * A server-issued anonymous session lets the landing page reach a judged dunk
 * with ZERO auth. Guests carry a rotating opaque token in an httpOnly cookie
 * and NO PII (M13 FIREWALL). On signup the guest's taste-run state migrates
 * into the new account.
 *
 * TIP-GUEST-TOKEN-HASH (2026-10-19): the token is a bearer secret, so it lives
 * only in the browser. The database and the analytics rows hold
 * hashGuestToken(token) — SHA-256, lowercase hex, no pepper: the token is 192
 * random bits, so an unsalted hash cannot be brute-forced back into a cookie.
 * Server-only (node:crypto); nothing in the browser bundle imports this file.
 */

import { createHash, randomBytes } from 'node:crypto';

/** The pre-TIP-GUEST-TOKEN-HASH name. Still the name in dev and test (a __Host- cookie needs Secure). */
export const GUEST_COOKIE_LEGACY = 'fel_guest';
/** Production name: __Host- means Secure, Path=/ and no Domain, enforced by the browser. */
export const GUEST_COOKIE_HOST = '__Host-fel_guest';

/** The cookie name for an environment: __Host-fel_guest in production, fel_guest elsewhere. */
export function guestCookieName(env: string | undefined = process.env.NODE_ENV): string {
  return env === 'production' ? GUEST_COOKIE_HOST : GUEST_COOKIE_LEGACY;
}

export const GUEST_COOKIE = guestCookieName();
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** randomBytes(24) as base64url is exactly 32 characters of [A-Za-z0-9_-]. Anything else is not a token we minted. */
const GUEST_TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;

export function isGuestTokenFormat(t: unknown): t is string {
  return typeof t === 'string' && GUEST_TOKEN_FORMAT.test(t);
}

/** SHA-256 of the token as lowercase hex (64 chars). What GuestSession and AnalyticsEvent.guestId store. */
export function hashGuestToken(t: string): string {
  return createHash('sha256').update(t, 'utf8').digest('hex');
}

/** A new guest token: 24 random bytes (192 bits), base64url. */
export function mintGuestToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Set-cookie options for the guest token. Lax, not Strict: the claim tab opened from /try must still carry it. */
export function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE,
  };
}
