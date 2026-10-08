import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isCoachStoreEnabled, isCoachStorePaymentsEnabled, isCoachReviewUploadsEnabled } from '@/lib/flags';
import { STORE_CLOSED_MESSAGE } from './constants';
import type { StoreClosedReason } from './stripeMode';

/** Named so public coach-store routes match the route-contract guard. Flag off is a 404. */
export function assertCoachStoreOn(): NextResponse | null {
  if (!isCoachStoreEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return null;
}

/**
 * STORE-READY B2: every "payments not set up" answer is 409 store_closed, NEVER 503 — the store flag off stays a
 * 404, but a payments-off, missing-key or live-mode-off checkout is a friendly, retryable closed store, not an
 * error. At most one PII-free log line per closed answer.
 */
export function storeClosed(reason: StoreClosedReason): NextResponse {
  console.warn(`[coach-store] store_closed reason=${reason}`);
  return NextResponse.json({ error: 'store_closed', reason, message: STORE_CLOSED_MESSAGE }, { status: 409 });
}

export function assertPaymentsOn(): NextResponse | null {
  const off = assertCoachStoreOn();
  if (off) return off;
  if (!isCoachStorePaymentsEnabled()) {
    return storeClosed('payments_off');
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
