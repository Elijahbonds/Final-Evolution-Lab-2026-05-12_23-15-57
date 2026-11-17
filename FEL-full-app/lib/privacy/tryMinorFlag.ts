// TRY-AGE-BANDS-FIX-1 (Cyber TRY-AGE-BANDS-REVIEW 2026-11-09, F2). Behind TRY_AGE_BANDS_ENABLED (default off).
//
// A 13-17 or unknown answer on /try is a per-tab session lock only (lib/screen/store lockSessionAge), so a new tab or a closed
// tab forgets it and an older re-pick there reached the adult guest path. This is the browser-session-only flag that holds the
// answer across tabs: a constant cookie, `fel_try_minor=1`, that dies when the browser closes. It mirrors ageBlockCookieHeader
// (lib/privacy/ageScreen) with ONE difference: no Max-Age and no Expires (a session cookie) — never longer-lived than the browser
// session without Elijah's say-so. The value is a constant: no age, no year, no id, no timestamp. Pure: no React, no next/*,
// so the shell (client) and the routes (server) share it.

export const TRY_MINOR_COOKIE = 'fel_try_minor';
export const TRY_MINOR_VALUE = '1';

/** The Set-Cookie header (client `document.cookie` form too). Session cookie: no Max-Age, no Expires. Path=/, SameSite=Lax, Secure in production, not httpOnly. */
export function tryMinorCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${TRY_MINOR_COOKIE}=${TRY_MINOR_VALUE}; Path=/; SameSite=Lax${secure}`;
}

/** True when a Cookie header / document.cookie string carries the constant flag. */
export function tryMinorInCookieString(cookie: string | null | undefined): boolean {
  if (!cookie) return false;
  return cookie.split(';').some((part) => {
    const [name, value] = part.trim().split('=');
    return name === TRY_MINOR_COOKIE && value === TRY_MINOR_VALUE;
  });
}

/** The flag in this browser (client only; false where there is no document). */
export function tryMinorPresent(): boolean {
  try { return typeof document !== 'undefined' && tryMinorInCookieString(document.cookie); } catch { return false; }
}

/** Write the flag (client only). Writes nothing else. */
export function writeTryMinorFlag(): void {
  try { document.cookie = tryMinorCookieHeader(); } catch { /* ignore */ }
}

/** Server: the flag on a cookie jar (next/headers cookies()), honoured only when the caller has checked TRY_AGE_BANDS_ENABLED. */
export function hasTryMinorFlag(jar: { get(name: string): { value?: string } | undefined }): boolean {
  return jar.get(TRY_MINOR_COOKIE)?.value === TRY_MINOR_VALUE;
}
