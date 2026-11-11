// COACH-BUSINESS: PATCH one of the coach's own packages (the whole package is re-sent and re-checked). Retiring a package
// is `active: false`; it is never deleted, because sales point at it.
import { rateLimit } from '@/lib/rate-limit';
import { parsePackageInput } from '@/lib/coach-business/packages';
import { updatePackage } from '@/lib/coach-business/store';
import { bad, json, notReady, rawDb, readJson, currentUserId } from '@/lib/coach-business/server';
import { sellerGate } from '@/lib/seller/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:pkg:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  // SELLER-18-1 (S-2): a seller action — the coach must be a verified adult (unknown age is refused).
  const seller = await sellerGate(userId, 'coach_business');
  if (seller) return seller;
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const parsed = parsePackageInput(await readJson(req));
  if (!parsed.ok) return bad(parsed.error, 400, { field: parsed.field });
  const ok = await updatePackage(db, String(params?.id ?? ''), userId, parsed.value);
  return ok ? json({ ok: true }) : bad('package_not_found', 404);
}
