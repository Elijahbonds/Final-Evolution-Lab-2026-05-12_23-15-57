// COACH-BUSINESS: POST { packageId } → a Stripe Checkout for one coach's package: a destination charge to the coach's
// Express account with FEL's 5% application fee. Every refusal, in order, is in lib/coach-business/service.ts; with the
// payments switch off this answers 409 store_closed before it reads anything or calls Stripe.
// PAYMENTS-READY: the body also carries the buyer's terms tick ({ termsAccepted: true, termsVersion }, the store terms'
// shape); without it the answer is 409 terms_required with the current version, before any Stripe call.
import { rateLimit } from '@/lib/rate-limit';
import { connectGate, paymentsClosed } from '@/lib/coach-business/connect';
import { startPackageCheckout } from '@/lib/coach-business/service';
import { bad, json, liveDeps, readJson, currentUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const gate = connectGate();
  if (!gate.ok) return paymentsClosed(gate.reason);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:checkout:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  const body = (await readJson(req)) as { packageId?: unknown; termsAccepted?: unknown; termsVersion?: unknown } | undefined;
  const packageId = typeof body?.packageId === 'string' ? body.packageId : '';
  if (!packageId) return bad('invalid_body');
  const r = await startPackageCheckout(liveDeps(), userId, packageId, body);
  if (!r.ok) {
    if (r.error === 'store_closed' && r.reason) return paymentsClosed(r.reason as never);
    if (r.error === 'terms_required') return bad('terms_required', 409, { version: r.version ?? null });
    return bad(r.error, r.status, r.message ? { message: r.message } : undefined);
  }
  return json({ url: r.url });
}
