// COACH-BUSINESS: POST → a one-time link to the coach's Stripe Express dashboard (balance, payouts and payout schedule,
// bank details). Payouts are Stripe's: FEL never holds the coach's money.
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, expressDashboardLink, paymentsClosed } from '@/lib/coach-business/connect';
import { connectFor } from '@/lib/coach-business/store';
import { bad, connectStripe, json, notReady, rawDb, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:dash:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const row = await connectFor(db, userId);
  if (!row || !row.detailsSubmitted) return bad('connect_not_ready', 409, { message: 'Finish setting up payments first.' });
  return json({ url: await expressDashboardLink(connectStripe(), row.stripeAccountId) });
}
