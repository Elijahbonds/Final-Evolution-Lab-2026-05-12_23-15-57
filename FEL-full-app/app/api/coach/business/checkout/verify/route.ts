// COACH-BUSINESS: POST { sessionId } — the server-verified success path (the SEC-F4 no-webhook rule): the thanks page asks
// Stripe for the session itself and fulfils through the SAME code as the webhook, so the sale is recorded even if the
// webhook is late. Idempotent: the sale's status moves once and the fee is booked once (lib/coach-business/webhook.ts).
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, paymentsClosed } from '@/lib/coach-business/connect';
import { coachConnectMeta, fulfilConnectCheckout } from '@/lib/coach-business/webhook';
import { bad, connectStripe, json, notReady, prismaConnectDeps, rawDb, readJson, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:verify:${userId}`, 20, 60_000).ok) return bad('rate_limited', 429);
  const body = (await readJson(req)) as { sessionId?: unknown } | undefined;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return bad('invalid_session');
  const off = await notReady(rawDb());
  if (off) return off;
  const session = await connectStripe().checkout.sessions.retrieve(sessionId);
  const meta = coachConnectMeta(session);
  if (!meta || meta.buyerId !== userId || session.client_reference_id !== userId) return bad('not_found', 404);
  const outcome = await fulfilConnectCheckout(prismaConnectDeps(), session);
  return json({ status: outcome === 'fulfilled' || outcome === 'already' ? 'paid' : outcome });
}
