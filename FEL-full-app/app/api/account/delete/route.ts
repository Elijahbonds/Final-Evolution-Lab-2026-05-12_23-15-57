import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { markAccountErased } from '@/lib/auth/accountStatus';
import { eraseAccountNow, NoSuchAccountError, txRunner } from '@/lib/data-rights/accountDelete';
import { deleteBlock } from '@/lib/data-rights/deleteGate';
import { hitAccountDeleteLimit } from '@/lib/data-rights/deleteRateLimit';
import { isTombstoneEmail } from '@/lib/data-rights/tombstone';

export const dynamic = 'force-dynamic';

// ACCOUNT-DELETE (owner decisions 2026-10-25): "Delete my account", in account settings.
//
//   GET  → { block }: whether this account can be deleted in the app now (null), or why not (a minor, no birth year,
//          or the obligations to settle first — lib/data-rights/deleteGate.ts). Read-only.
//   POST { email, password, confirm: true } → the erase. In order:
//          signed in (401) → rate limit, per account, before the password is looked at (429) → the explicit confirm
//          (400) → already erased? then 200 again, nothing new (a retry after a dropped response) → re-authentication:
//          the typed email is this account's AND the password is right (403, one message for both) → not blocked
//          (409, with the reason) → lib/data-rights/accountDelete.ts eraseAccountNow, the same function the
//          operator's script runs → this instance ends the account's sessions at once, and the response clears the
//          session cookie. Other instances end them within 30 s (lib/auth/accountStatus.ts).
//
// The account is always the session's. The body never names one.

const SESSION_COOKIE = authOptions.cookies?.sessionToken?.name ?? '__session';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** The answer after an erase: done, and this browser's session cookie is gone. */
function erasedResponse(alreadyErased: boolean) {
  const res = json({ ok: true, alreadyErased });
  const opts = authOptions.cookies?.sessionToken?.options ?? {};
  res.cookies.set(SESSION_COOKIE, '', { ...opts, maxAge: 0 });
  return res;
}

export async function GET() {
  const userId = await signedInUserId();
  if (!userId) return json({ error: 'signed_out' }, 401);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
  if (!user) return json({ error: 'signed_out' }, 401);
  return json({ block: await deleteBlock(prisma, userId, user.dobYear) });
}

export async function POST(req: Request) {
  const userId = await signedInUserId();
  if (!userId) return json({ error: 'signed_out' }, 401);

  const limit = await hitAccountDeleteLimit(prisma, userId);
  if (!limit.ok) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(Math.max(1, limit.retryAfterSec)) });

  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown; confirm?: unknown } | null;
  if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400);
  if (body.confirm !== true) return json({ error: 'confirm_required' }, 400);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, password: true, dobYear: true } });
  if (!user) return json({ error: 'signed_out' }, 401);

  // a retry of a delete that already went through: the same answer again, nothing new done or recorded
  if (isTombstoneEmail(userId, user.email)) {
    markAccountErased(userId);
    return erasedResponse(true);
  }

  const typedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const emailOk = typedEmail.length > 0 && typedEmail === user.email.trim().toLowerCase();
  // bcrypt runs whatever the email check said, so the answer takes as long either way
  const passwordOk = password.length > 0 && !!user.password && (await bcrypt.compare(password, user.password));
  if (!emailOk || !passwordOk) return json({ error: 'reauth_failed' }, 403);

  const block = await deleteBlock(prisma, userId, user.dobYear);
  if (block) return json({ error: 'blocked', block }, 409);

  try {
    const outcome = await eraseAccountNow(txRunner(prisma), userId, 'in-app');
    markAccountErased(userId);
    return erasedResponse(outcome.alreadyErased);
  } catch (e) {
    if (e instanceof NoSuchAccountError) return json({ error: 'signed_out' }, 401);
    // one line, no id: the transaction rolled back, so nothing was deleted
    console.error('[data-rights] ACCOUNT_ERASE_FAILED', e instanceof Error ? e.name : typeof e);
    return json({ error: 'failed' }, 500);
  }
}
