// COACH-BUSINESS: POST { amountCents? } — the coach refunds part or all of one of their own one-off sales (the coach's
// transfer is reversed and FEL's 5% handed back in proportion), or cancels a monthly one. lib/coach-business/service.ts.
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, paymentsClosed } from '@/lib/coach-business/connect';
import { refundSale } from '@/lib/coach-business/service';
import { bad, json, liveDeps, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:refund:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  const body = (await readJson(req)) as { amountCents?: unknown } | undefined;
  const amount = body?.amountCents === undefined || body?.amountCents === null ? null : Number(body.amountCents);
  const r = await refundSale(liveDeps(), userId, String(params?.id ?? ''), amount);
  if (!r.ok) return r.error === 'store_closed' && r.reason ? paymentsClosed(r.reason as never) : bad(r.error, r.status);
  return json(r);
}
