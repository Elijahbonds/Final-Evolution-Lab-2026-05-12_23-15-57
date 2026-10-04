import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * The admin-route gate, moved unchanged out of app/api/admin/metrics/route.ts
 * so /coach/admin and both /api/admin routes call one function.
 * role === 'admin' only. A missing session and any other role (including owner
 * and coach) are the same answer: null.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === 'admin' ? (session!.user as { role?: string }) : null;
}

/**
 * GET /api/coach/exercises and GET /api/coach/categories list the whole
 * knowledge base, drafts included. Coach or admin may read. Everyone else
 * is refused here, before the query. Published drills for a signed-in player
 * stay on GET /api/coach/catalogue.
 * Returns the response to send, or null when the read may proceed.
 */
export async function denyUnlessCoachOrAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role === 'admin' || role === 'coach') return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
