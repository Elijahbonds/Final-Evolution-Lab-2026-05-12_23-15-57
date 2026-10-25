// COACH-BUSINESS: POST a new package (monthly coaching, a session pack, a single review, a program). Any coach may define
// packages; whether a package shows Book or Apply is decided on the page (payments live + the coach's plan).
import { rateLimit } from '@/lib/rate-limit';
import { parsePackageInput, PACKAGES_PER_COACH_MAX } from '@/lib/coach-business/packages';
import { countPackages, insertPackage } from '@/lib/coach-business/store';
import { bad, isVerifiedAdultUser, json, notReady, rawDb, readJson, sessionUserId } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const userId = await sessionUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-business:pkg:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  if (!(await isVerifiedAdultUser(userId))) return bad('adults_only', 403);
  const db = rawDb();
  const off = await notReady(db);
  if (off) return off;
  const parsed = parsePackageInput(await readJson(req));
  if (!parsed.ok) return bad(parsed.error, 400, { field: parsed.field });
  const n = await countPackages(db, userId);
  if (n >= PACKAGES_PER_COACH_MAX) return bad('too_many_packages', 409);
  const id = await insertPackage(db, userId, parsed.value, n);
  return json({ ok: true, id }, 201);
}
