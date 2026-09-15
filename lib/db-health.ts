/**
 * lib/db-health.ts
 *
 * Helpers for telling an *infrastructure* failure (database unreachable,
 * credentials rejected, connection pool exhausted) apart from ordinary
 * application outcomes (no such user, wrong password).
 *
 * Why this exists: when DATABASE_URL is misconfigured in a deployment, every
 * Prisma call throws. If a sign-in path treats that throw the same as "no
 * matching user", the athlete is told "Invalid email or password" forever and
 * has no way to know the server simply cannot see its database. That failure
 * mode cost real debugging time — keep the two cases distinct.
 */

/** Prisma initialization/connectivity error codes (P1xxx = engine/connection). */
const CONNECTIVITY_CODES = new Set([
  'P1000', // authentication failed against the database server
  'P1001', // can't reach database server
  'P1002', // database server reached but timed out
  'P1003', // database does not exist
  'P1008', // operation timed out
  'P1010', // access denied for user
  'P1017', // server has closed the connection
]);

/**
 * True when the error is the database being unreachable/unusable rather than a
 * normal query result. Safe to call with `unknown`.
 */
export function isDatabaseUnreachable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; errorCode?: string; message?: string };

  if (e.name === 'PrismaClientInitializationError') return true;
  if (e.code && CONNECTIVITY_CODES.has(e.code)) return true;
  if (e.errorCode && CONNECTIVITY_CODES.has(e.errorCode)) return true;

  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    msg.includes("Can't reach database server") ||
    msg.includes('Server has closed the connection') ||
    msg.includes('the URL must start with the protocol')
  );
}

/**
 * Error code handed to NextAuth when sign-in fails for infrastructure reasons.
 * Deliberately opaque: the raw Prisma message names the database host and port,
 * and NextAuth puts the thrown message straight into a redirect URL.
 */
export const AUTH_SERVICE_UNAVAILABLE = 'ServiceUnavailable';
