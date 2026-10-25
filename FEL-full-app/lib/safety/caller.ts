// lib/safety/caller.ts — SAFETY lane (SAF-04, SAF-05): who is asking, as the safety routes need it. The account id comes
// from the session only (never a body). `adult` is lib/privacy/verifiedAdult on the account's birth year: a blank year,
// a minor and a read that fails all read as NOT adult — the careful side, so free text is never taken from a minor.
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export interface Caller { userId: string | null; role: string | null; adult: boolean }

export interface CallerDb { user: { findUnique(a: unknown): Promise<{ dobYear: number | null } | null> } }

export async function readCaller(db: CallerDb, now: Date = new Date()): Promise<Caller> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; role?: string } | undefined;
  const userId = typeof u?.id === 'string' && u.id ? u.id : null;
  const role = typeof u?.role === 'string' ? u.role : null;
  if (!userId) return { userId: null, role, adult: false };
  const row = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null);
  return { userId, role, adult: verifiedAdult(row?.dobYear ?? null, now) };
}

/** Is this person an adult by the same rule, for a target of a report (null id = unknown = not adult)? */
export async function isAdultAccount(db: CallerDb, userId: string | null, now: Date = new Date()): Promise<boolean> {
  if (!userId) return false;
  const row = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null);
  return verifiedAdult(row?.dobYear ?? null, now);
}

/** The moderation pages and actions are for role 'admin' only (lib/admin/requireAdmin.ts's rule), with the id for the audit. */
export function isAdmin(c: Caller): c is Caller & { userId: string } {
  return c.role === 'admin' && !!c.userId;
}
