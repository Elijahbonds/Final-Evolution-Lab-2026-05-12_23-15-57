import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isCoachStoreEnabled, isCoachStorePaymentsEnabled, isCoachReviewUploadsEnabled } from '@/lib/flags';

/** Named so public coach-store routes match the route-contract guard. Flag off is a 404. */
export function assertCoachStoreOn(): NextResponse | null {
  if (!isCoachStoreEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return null;
}

export function assertPaymentsOn(): NextResponse | null {
  const off = assertCoachStoreOn();
  if (off) return off;
  if (!isCoachStorePaymentsEnabled()) {
    return NextResponse.json({ error: 'payments_not_set_up', message: 'payments not set up' }, { status: 503 });
  }
  return null;
}

export function reviewsCanBeSold(): boolean {
  return isCoachReviewUploadsEnabled() && Boolean((process.env.COACH_REVIEWS_BUCKET ?? '').trim());
}

export async function storeUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id || null;
}

export function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2021');
}

/** One line, no person in it. Pages show a friendly empty state; routes answer 503. */
export function logStoreUnavailable(): void {
  console.warn('[coach-store] coach store not set up yet');
}

export function notSetUp(): NextResponse {
  logStoreUnavailable();
  return NextResponse.json({ error: 'coach_store_not_set_up', message: 'coach store not set up yet' }, { status: 503 });
}
