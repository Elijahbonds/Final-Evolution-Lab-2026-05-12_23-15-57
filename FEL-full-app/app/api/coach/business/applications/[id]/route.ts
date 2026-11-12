// COACH-BUSINESS: PATCH { status: 'ACCEPTED' | 'DECLINED' | 'OPEN' } — the coach answers an application to them.
// Accepting records the answer; the coach then sends their usual invite link (the roster's own path and gates).
import { rateLimit } from '@/lib/rate-limit';
import { setApplicationStatus } from '@/lib/coach-business/store';
import { bad, json, notReady, rawDb, readJson, currentUserId } from '@/lib/coach-business/server';
import { sellerGate } from '@/lib/seller/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:app:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  // SELLER-18-1 (S-2): a seller action — the coach must be a verified adult (unknown age is refused).
  const seller = await sellerGate(userId, 'coach_business');
  if (seller) return seller;
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const body = (await readJson(req)) as { status?: unknown } | undefined;
  const status = body?.status;
  if (status !== 'ACCEPTED' && status !== 'DECLINED' && status !== 'OPEN') return bad('invalid_status');
  const ok = await setApplicationStatus(db, String(params?.id ?? ''), userId, status);
  return ok ? json({ ok: true }) : bad('not_found', 404);
}
