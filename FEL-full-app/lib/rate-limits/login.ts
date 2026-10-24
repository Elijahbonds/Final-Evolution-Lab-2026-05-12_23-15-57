// lib/rate-limits/login.ts — RATE-LIMIT-WIRE (PR #289 QA rework, 2026-10-16): the sign-in limit, ahead of NextAuth.
//
// NextAuth's credentials sign-in is POST /api/auth/callback/credentials; the form posts it url-encoded (next-auth/react
// signIn), a script may post JSON — both are read here the way NextAuth reads them (next-auth/next/utils getBody), from a
// CLONE, so NextAuth still gets the untouched body. The email is normalised as lib/auth.ts authorize() looks it up.
//
// The answer past the limit is NextAuth's own JSON shape, `{ url }` naming its error page, with status 429: signIn()
// takes the error from that url (`RateLimited`, lib/auth-errors.ts) and the form says so, while a script sees a plain 429
// with Retry-After. Nothing is counted for any other auth request (session, csrf, providers, sign-out).
import { NextResponse } from 'next/server';
import { AUTH_RATE_LIMITED } from '@/lib/auth-errors';
import { trustedClientIp } from './clientIp';
import { checkRateLimits, retryAfterHeaders } from './policy';

/** Is this the credentials sign-in? `nextauth` is the catch-all segment: ['callback', 'credentials']. */
export function isCredentialsSignIn(req: Request, nextauth: string[] | undefined): boolean {
  return req.method === 'POST' && nextauth?.[0] === 'callback' && nextauth?.[1] === 'credentials';
}

/** The email the sign-in names, normalised as authorize() normalises it; '' when there is none. */
export async function signInEmail(req: Request): Promise<string> {
  try {
    const type = req.headers.get('content-type') ?? '';
    const copy = req.clone();
    let email: unknown;
    if (type.includes('application/json')) email = ((await copy.json()) as { email?: unknown } | null)?.email;
    else if (type.includes('application/x-www-form-urlencoded')) email = new URLSearchParams(await copy.text()).get('email');
    return typeof email === 'string' ? email.toLowerCase().trim().slice(0, 320) : '';
  } catch {
    return '';
  }
}

/** The 429 to send instead of signing in, or null to let NextAuth handle the request. */
export async function loginRateLimitRefusal(db: unknown, req: Request, nextauth: string[] | undefined): Promise<Response | null> {
  if (!isCredentialsSignIn(req, nextauth)) return null;
  const verdict = await checkRateLimits(db, 'login', [
    { kind: 'email', value: await signInEmail(req) },
    { kind: 'ip', value: trustedClientIp(req.headers) },
  ]);
  if (verdict.ok) return null;
  // the public origin when NEXTAUTH_URL names it (behind Hosting req.url can be the backend's), else the request's own
  const path = `/api/auth/error?error=${AUTH_RATE_LIMITED}`;
  let url: string;
  try { url = new URL(path, process.env.NEXTAUTH_URL || req.url).toString(); } catch { url = new URL(path, req.url).toString(); }
  return NextResponse.json({ url, error: AUTH_RATE_LIMITED }, { status: 429, headers: retryAfterHeaders(verdict) });
}
