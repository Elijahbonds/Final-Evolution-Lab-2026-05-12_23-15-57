/**
 * lib/auth-errors.ts
 *
 * The sign-in error code that means "the backend is broken", as distinct from
 * "those credentials are wrong".
 *
 * It lives in its own module because both halves of the sign-in path need it:
 * `lib/auth.ts` throws it on the server, and the client form maps it to an
 * honest message. Importing it from `lib/auth.ts` would drag Prisma and bcrypt
 * into the browser bundle, so this file deliberately has no imports.
 *
 * Deliberately opaque. NextAuth puts a thrown message straight into the
 * /api/auth/error redirect URL, and the raw Prisma text names the database host
 * and port.
 */
export const AUTH_SERVICE_UNAVAILABLE = 'ServiceUnavailable';
