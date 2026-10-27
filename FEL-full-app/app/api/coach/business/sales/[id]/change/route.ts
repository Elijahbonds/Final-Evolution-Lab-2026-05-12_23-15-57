// COACH-DELIVERY COA-11 (2026-10-27): POST { packageId } — the coach moves a client's running monthly coaching to another of
// their monthly packages (an upgrade is prorated on the next invoice; a downgrade applies from the next renewal).
// lib/coach-business/packageChange.ts. Payments off → 409 store_closed payments_off before the database or Stripe.
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, paymentsClosed } from '@/lib/coach-business/connect';
import { changeMonthlyPackage, type ChangeStripe } from '@/lib/coach-business/packageChange';
import { bad, json, liveDeps, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:change:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  const d = liveDeps();
  const r = await changeMonthlyPackage({ db: d.db, env: d.env, now: d.now, plan: d.plan, stripe: () => d.stripe() as unknown as ChangeStripe }, userId, String(params?.id ?? ''), await readJson(req));
  if (!r.ok) return r.error === 'store_closed' && r.reason ? paymentsClosed(r.reason as never) : bad(r.error, r.status, r.message ? { message: r.message } : undefined);
  return json(r);
}
