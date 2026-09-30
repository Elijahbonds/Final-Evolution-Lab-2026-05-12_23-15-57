// lib/privacy/u13LockLog.ts — AGE-SCREEN MUST (3): one PII-free line per under-13 lock.
//
// Server-only by what it does (a log), not by a next/* import. No database client. The line has exactly three keys: the
// date (YYYY-MM-DD), the route, and the reason. No user id, IP, email, birth year, or any other personal detail.
// assumption: (FE PM can reverse) a cookie-present retry logs nothing — the caller does not call this for it.

export type U13LockRoute = '/api/signup' | '/api/account/birth-year';

/** ONE argument. ONE line. ONE object, with only date, route, and reason. */
export function logU13Lock(route: U13LockRoute): void {
  const date = new Date().toISOString().slice(0, 10);
  console.warn(JSON.stringify({ date, route, reason: 'coppa_u13_lock' }));
}
